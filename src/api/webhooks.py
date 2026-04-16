# SPDX-License-Identifier: AGPL-3.0-or-later
"""GitHub webhook handlers for Pull Request events."""

import hashlib
import hmac
import math
import os
from datetime import UTC
from typing import Any

from fastapi import APIRouter, Header, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse

from src.core.config import settings
from src.core.logging import get_logger
from src.monitoring.metrics import record_webhook
from src.monitoring.performance import RateLimiter
from src.api._platform_cap import check_platform_llm_cap, stamp_platform_llm_flag  # PH15-01

router = APIRouter()
logger = get_logger(__name__)


async def _post_quota_exceeded_check_run(
    installation_id: int,
    owner: str,
    repo: str,
    head_sha: str,
    reason: str,
    app_id: int | None = None,
    private_key: str | None = None,
) -> None:
    """GAP-D: Create a neutral check run annotation when quota is exceeded.

    This gives the PR author visible feedback directly in the GitHub UI
    instead of a silent webhook 402 with no check run.
    """
    try:
        from src.github.app import get_github_client

        client = get_github_client(installation_id, app_id=app_id, private_key=private_key)
        github_repo = client.get_repo(f"{owner}/{repo}")
        github_repo.create_check_run(
            name="DocuGardener",
            head_sha=head_sha,
            status="completed",
            conclusion="neutral",
            output={
                "title": "Analysis Skipped — Plan Limit Reached",
                "summary": (
                    f"{reason}\n\n"
                    "**Upgrade your plan** in the "
                    "[DocuGardener dashboard](../../settings/billing) "
                    "to continue automatic documentation drift analysis."
                ),
            },
        )
        logger.info(
            "GAP-D: posted quota-exceeded check run",
            repo=f"{owner}/{repo}",
            head_sha=head_sha[:8],
        )
    except Exception as exc:
        logger.warning("GAP-D: failed to post quota check run", error=str(exc))


# GAP-02: Per-installation rate-limit headers.
# Token-bucket: 20 req/min sustained, burst of 20.  Keyed by GitHub installation_id
# so each installed org has its own independent limit.
_WEBHOOK_RATE_PER_SEC: float = 20.0 / 60  # ~0.33 req/s  → 20/min
_WEBHOOK_BURST: int = 20
_webhook_rate_limiters: dict[str, RateLimiter] = {}


def _get_rate_limiter(key: str) -> RateLimiter:
    """Return (or lazily create) the RateLimiter for *key* (installation_id or 'global')."""
    if key not in _webhook_rate_limiters:
        _webhook_rate_limiters[key] = RateLimiter(rate=_WEBHOOK_RATE_PER_SEC, burst=_WEBHOOK_BURST)
    return _webhook_rate_limiters[key]


def verify_github_signature(payload: bytes, signature: str, secret: str) -> bool:
    """
    Verify the GitHub webhook signature.

    Args:
        payload: Raw request body bytes
        signature: X-Hub-Signature-256 header value
        secret: Configured webhook secret

    Returns:
        True if signature is valid, False otherwise
    """
    if not signature or not signature.startswith("sha256="):
        return False

    expected = hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()

    received = signature.replace("sha256=", "")

    return hmac.compare_digest(expected, received)


@router.post("/github")
async def handle_github_webhook(
    request: Request,
    response: Response,
    x_github_event: str = Header(..., alias="X-GitHub-Event"),
    x_hub_signature_256: str = Header(None, alias="X-Hub-Signature-256"),
    x_github_delivery: str = Header(..., alias="X-GitHub-Delivery"),
) -> dict[str, Any]:
    """
    Handle incoming GitHub webhook events.

    Primary entry point for all GitHub App events. Currently handles:
    - pull_request: Triggers documentation drift analysis
    - ping: Webhook registration confirmation
    """
    # Get raw payload for signature verification
    payload = await request.body()

    # Verify webhook signature in production
    if settings.github_webhook_secret and not settings.debug:
        if not verify_github_signature(
            payload, x_hub_signature_256 or "", settings.github_webhook_secret
        ):
            logger.warning(
                "Invalid webhook signature",
                delivery_id=x_github_delivery,
                event_type=x_github_event,
            )
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid signature"
            )

    # Parse JSON payload
    try:
        data = await request.json()
    except Exception as e:
        logger.error("Failed to parse webhook payload", error=str(e))
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON payload")

    # GAP-02: Rate-limit per installation; fall back to "global" for ping / events
    # without an installation block.
    _installation_id_str = str((data.get("installation") or {}).get("id") or "global")
    _limiter = _get_rate_limiter(_installation_id_str)
    _allowed = await _limiter.acquire()
    _remaining = max(0, int(_limiter._tokens))
    response.headers["X-RateLimit-Limit"] = str(_WEBHOOK_BURST)
    response.headers["X-RateLimit-Remaining"] = str(_remaining)
    if not _allowed:
        _retry_after = math.ceil((1.0 - _limiter._tokens) / _WEBHOOK_RATE_PER_SEC)
        record_webhook(x_github_event, success=False, error_type="rate_limited")
        return JSONResponse(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            content={"detail": "Webhook rate limit exceeded. See Retry-After header."},
            headers={
                "X-RateLimit-Limit": str(_WEBHOOK_BURST),
                "X-RateLimit-Remaining": "0",
                "Retry-After": str(max(1, _retry_after)),
            },
        )

    # Delivery-ID dedup: smee occasionally re-delivers the same event on reconnect.
    # Use Redis SET NX with a 5-minute TTL to deduplicate at the entry point,
    # before any DB writes or queue operations.
    try:
        import redis as _redis_mod

        _rd = _redis_mod.from_url(
            os.environ.get("REDIS_URL", "redis://localhost:6379/0"),
            decode_responses=True,
        )
        _dedup_key = f"webhook:delivery:{x_github_delivery}"
        _is_new = _rd.set(_dedup_key, "1", nx=True, ex=300)  # 5-min TTL
        if not _is_new:
            logger.info(
                "Duplicate delivery skipped",
                delivery_id=x_github_delivery,
                event_type=x_github_event,
            )
            return {"status": "skipped", "reason": "duplicate_delivery"}
    except Exception as _dedup_exc:
        logger.warning("Delivery dedup check failed — proceeding", error=str(_dedup_exc))

    logger.info(
        "Received GitHub webhook",
        event_type=x_github_event,
        delivery_id=x_github_delivery,
        action=data.get("action"),
    )

    # Handle different event types
    try:
        if x_github_event == "ping":
            result = await handle_ping(data)
        elif x_github_event == "pull_request":
            result = await handle_pull_request(data, x_github_delivery)
        elif x_github_event == "installation":
            result = await handle_installation(data)
        else:
            logger.debug("Ignoring unhandled event type", event_type=x_github_event)
            result = {"status": "ignored", "event": x_github_event}
        record_webhook(x_github_event, success=True)
        return result
    except HTTPException:
        record_webhook(x_github_event, success=False, error_type="http_error")
        raise
    except Exception as exc:
        record_webhook(x_github_event, success=False, error_type=type(exc).__name__)
        raise


async def handle_ping(data: dict[str, Any]) -> dict[str, Any]:
    """Handle GitHub ping event (webhook registration confirmation)."""
    zen = data.get("zen", "")
    hook_id = data.get("hook_id")

    logger.info("GitHub App ping received", hook_id=hook_id, zen=zen)

    return {"status": "pong", "hook_id": hook_id, "message": f"DocuGardener is ready! Zen: {zen}"}


def extract_jira_ticket_key(pull_request: dict[str, Any]) -> str | None:
    """
    Extract a Jira ticket key from the PR branch name, title, or body.
    Tries sources in order of reliability. Returns the first match or None.
    Pattern matches e.g. BUG-123, FEAT-4567, DOC-1.
    """
    import re

    pattern = r"\b([A-Z][A-Z0-9]+-\d+)\b"
    sources = [
        pull_request.get("head", {}).get("ref", ""),  # branch: feature/BUG-123-fix-auth
        pull_request.get("title", ""),  # title: [BUG-123] Fix auth handler
        pull_request.get("body", "") or "",  # body: Fixes BUG-123
    ]
    for source in sources:
        match = re.search(pattern, source)
        if match:
            return match.group(1)
    return None


_DEFAULT_AI_BRANCH_PREFIXES = ["copilot/", "devin/", "cursor/", "claude/"]
_DEFAULT_AI_BODY_MARKERS = [
    "Generated with GitHub Copilot",
    "Generated with Cursor",
    "Generated with Devin",
    "Generated with Claude Code",
    "Co-authored-by: GitHub Copilot",
]


def _matches_ai_pattern(value: str, pattern: str) -> bool:
    """
    Simple glob-like pattern match for AI author patterns.
    Supports: '*[bot]' (ends with), 'copilot/*' (starts with), exact match.
    """
    if not value or not pattern:
        return False
    if pattern.startswith("*"):
        return value.endswith(pattern[1:])
    if pattern.endswith("*"):
        return value.startswith(pattern[:-1])
    return value == pattern


def detect_ai_author(
    webhook_data: dict[str, Any],
    tenant_patterns: list[str] | None = None,
) -> tuple[bool, str]:
    """
    Detect if a PR was authored by an AI coding tool.

    Checks in priority order:
    1. Sender login ends with '[bot]'
    2. PR head branch matches known AI tool prefixes
    3. PR body contains AI tool attribution markers
    4. Tenant custom patterns from workflowConfig.aiAuthorPatterns

    Args:
        webhook_data: Full GitHub pull_request webhook payload.
        tenant_patterns: Optional custom patterns from workflowConfig.

    Returns:
        (True, signal_name) if AI-authored, (False, "") otherwise.
        signal_name ∈ {"bot_suffix", "branch_prefix", "body_marker", "custom_pattern"}
    """
    pr = webhook_data.get("pull_request", {}) or {}
    sender = webhook_data.get("sender", {}) or {}

    # Signal 1: Bot suffix in sender login — unambiguous, highest confidence
    sender_login: str = sender.get("login", "") or ""
    if sender_login.endswith("[bot]"):
        return True, "bot_suffix"

    # Signal 2: Branch prefix matches known AI tools
    branch: str = (pr.get("head") or {}).get("ref", "") or ""
    for prefix in _DEFAULT_AI_BRANCH_PREFIXES:
        if branch.startswith(prefix):
            return True, "branch_prefix"

    # Signal 3: PR body contains AI tool attribution marker
    body: str = pr.get("body", "") or ""
    for marker in _DEFAULT_AI_BODY_MARKERS:
        if marker in body:
            return True, "body_marker"

    # Signal 4: Tenant custom patterns (aiAuthorPatterns in workflowConfig)
    if tenant_patterns:
        for pattern in tenant_patterns:
            if _matches_ai_pattern(sender_login, pattern) or _matches_ai_pattern(branch, pattern):
                return True, "custom_pattern"

    return False, ""


async def handle_pull_request(data: dict[str, Any], delivery_id: str) -> dict[str, Any]:
    """
    Handle pull_request webhook event.

    This is the main entry point for documentation drift analysis.
    Triggers the analysis pipeline for opened/synchronized PRs.
    """
    action = data.get("action")
    pull_request = data.get("pull_request", {})
    repository = data.get("repository", {})

    pr_number = pull_request.get("number")
    pr_title = pull_request.get("title")
    repo_full_name = repository.get("full_name")

    logger.info(
        "Processing pull request event",
        action=action,
        repo=repo_full_name,
        pr_number=pr_number,
        pr_title=pr_title,
        delivery_id=delivery_id,
    )

    # Fix PR merged → auto-resolve the parent inbox alert
    head_ref_closed: str = pull_request.get("head", {}).get("ref", "")
    if (
        action == "closed"
        and pull_request.get("merged") is True
        and head_ref_closed.startswith("docugardener-fix-")
    ):
        return await handle_fix_pr_merged(data, head_ref_closed)

    # Only process opened and synchronized (new commits) events
    if action not in ["opened", "synchronize", "reopened"]:
        logger.debug("Skipping PR action", action=action)
        return {"status": "skipped", "reason": f"Action '{action}' does not require analysis"}

    # Loop prevention: skip DocuGardener's own fix PRs to avoid infinite analysis cycles
    head_ref: str = pull_request.get("head", {}).get("ref", "")
    if head_ref.startswith("docugardener-fix-"):
        logger.info(
            "Skipping DocuGardener fix PR — loop prevention",
            branch=head_ref,
            pr=pr_number,
            repo=repo_full_name,
        )
        return {
            "status": "skipped",
            "reason": "DocuGardener fix PR — not analyzed to prevent loop",
        }

    # SCALE-02: Actor-Aware Thresholding — skip analysis for ignored actors
    # (e.g. dependabot[bot], renovate[bot]) configured in workflowConfig
    installation_id = data.get("installation", {}).get("id")
    sender_login: str = (data.get("sender") or {}).get("login", "")
    if sender_login and installation_id:
        try:
            from src.pipeline.job_manager import SessionLocal
            from src.storage.sql_models import Tenant

            _db = SessionLocal()
            try:
                _tenant = (
                    _db.query(Tenant).filter(Tenant.installationId == str(installation_id)).first()
                )
                if _tenant and _tenant.workflowConfig:
                    ignored_actors: list[str] = (
                        dict(_tenant.workflowConfig).get("ignoredActors") or []
                    )
                    if sender_login in ignored_actors:
                        logger.info(
                            "SCALE-02: skipping analysis — actor is on ignore list",
                            actor=sender_login,
                            repo=repo_full_name,
                            pr=pr_number,
                        )
                        return {
                            "status": "skipped",
                            "reason": f"Actor '{sender_login}' is in the ignoredActors list",
                        }
            finally:
                _db.close()
        except Exception as exc:
            # Never block webhook processing due to a DB lookup failure
            logger.warning("SCALE-02: failed to check ignoredActors", error=str(exc))

    # Repo Enable/Disable Guard: skip analysis if repo has been paused via the UI
    repo_name = repository.get("name", "")
    if installation_id and repo_name:
        try:
            from src.pipeline.job_manager import SessionLocal
            from src.storage.sql_models import Repository, Tenant

            _db2 = SessionLocal()
            try:
                _tenant2 = (
                    _db2.query(Tenant).filter(Tenant.installationId == str(installation_id)).first()
                )
                if _tenant2:
                    _repo = (
                        _db2.query(Repository)
                        .filter(
                            Repository.tenantId == _tenant2.id,
                            Repository.name == repo_name,
                        )
                        .first()
                    )
                    if _repo is not None and _repo.enabled is False:
                        logger.info(
                            "Repo is paused — skipping analysis",
                            repo=repo_full_name,
                            pr=pr_number,
                        )
                        return {
                            "status": "skipped",
                            "reason": f"Repository '{repo_name}' is paused. Enable it in Settings → Repositories.",
                        }
            finally:
                _db2.close()
        except Exception as exc:
            logger.warning("Repo-guard: failed to check repo enabled state", error=str(exc))

    # Extract Jira ticket key from PR — used to comment on existing ticket, not create new ones
    jira_ticket_key = extract_jira_ticket_key(pull_request)
    if jira_ticket_key:
        logger.info("Jira ticket key found in PR", ticket=jira_ticket_key, pr=pr_number)

    # EPIC-05: AI Author Detection — load custom patterns then run detection
    ai_authored = False
    _ai_signal = ""
    _tenant_patterns: list[str] | None = None
    if installation_id:
        try:
            from src.pipeline.job_manager import SessionLocal
            from src.storage.sql_models import Tenant as _Tenant

            _db_ai = SessionLocal()
            try:
                _t = (
                    _db_ai.query(_Tenant)
                    .filter(_Tenant.installationId == str(installation_id))
                    .first()
                )
                if _t and _t.workflowConfig:
                    _tenant_patterns = dict(_t.workflowConfig).get("aiAuthorPatterns") or None
            finally:
                _db_ai.close()
        except Exception as _exc:
            logger.warning(
                "EPIC-05: failed to load tenant patterns for AI detection", error=str(_exc)
            )

    ai_authored, _ai_signal = detect_ai_author(data, tenant_patterns=_tenant_patterns)
    if ai_authored:
        logger.info(
            "EPIC-05: AI-authored PR detected",
            signal=_ai_signal,
            sender=sender_login,
            repo=repo_full_name,
            pr=pr_number,
        )

    # SCALE-03: Classify sender type for nightly rollup filtering
    if sender_login.endswith("[bot]"):
        sender_type = "bot"
    elif ai_authored:
        sender_type = "ai"
    else:
        sender_type = "human"

    # ENT-03: Budget Guard — hard block when monthly spend exceeds tenant's budget
    if installation_id:
        try:
            from datetime import datetime

            from src.pipeline.job_manager import SessionLocal
            from src.storage.sql_models import Job as _BudgetJob
            from src.storage.sql_models import Tenant as _BudgetTenant

            _db_budget = SessionLocal()
            try:
                _bt = (
                    _db_budget.query(_BudgetTenant)
                    .filter(_BudgetTenant.installationId == str(installation_id))
                    .first()
                )
                if _bt:
                    # Operator-wide platform LLM cap — PH15-01
                    _llm_cfg = dict(_bt.llmConfig) if _bt.llmConfig else {}
                    _cap_result = check_platform_llm_cap(
                        db=_db_budget, settings=settings, llm_cfg=_llm_cfg
                    )
                    if _cap_result is not None:
                        return _cap_result

                if _bt and _bt.billingConfig:
                    _billing = dict(_bt.billingConfig)
                    _budget = _billing.get("monthlyBudgetUsd")
                    if _budget and float(_budget) > 0:
                        # Sum estimated_cost_usd for COMPLETED jobs this calendar month
                        _month_start = datetime.now(UTC).replace(
                            day=1, hour=0, minute=0, second=0, microsecond=0
                        )
                        _month_jobs = (
                            _db_budget.query(_BudgetJob)
                            .filter(
                                _BudgetJob.tenantId == _bt.id,
                                _BudgetJob.status == "COMPLETED",
                                _BudgetJob.createdAt >= _month_start,
                            )
                            .all()
                        )
                        _month_spend = sum(
                            (j.result or {}).get("llm_usage", {}).get("estimated_cost_usd", 0.0)
                            for j in _month_jobs
                            if isinstance(j.result, dict)
                        )
                        if _month_spend >= float(_budget):
                            logger.warning(
                                "Budget limit reached — skipping analysis",
                                tenant=_bt.id,
                                budget=_budget,
                                spend=_month_spend,
                            )
                            return {
                                "status": "skipped",
                                "reason": f"Monthly budget of ${_budget} USD reached (${_month_spend:.4f} spent). Update limit in Billing settings.",
                            }
            finally:
                _db_budget.close()
        except Exception as _exc:
            logger.warning("Budget guard: failed to check budget", error=str(_exc))

    # GAP-01: Tier quota enforcement — block over-quota tenants before enqueue
    if installation_id:
        try:
            from src.billing.quota import check_pr_quota, check_repo_quota
            from src.pipeline.job_manager import SessionLocal
            from src.storage.sql_models import Tenant as _QuotaTenant

            _db_quota = SessionLocal()
            try:
                _qt = (
                    _db_quota.query(_QuotaTenant)
                    .filter(_QuotaTenant.installationId == str(installation_id))
                    .first()
                )
                if _qt:
                    # Shared data for GAP-D check run annotation
                    _quota_owner = repository.get("owner", {}).get("login", "")
                    _quota_repo = repository.get("name", "")
                    _quota_sha = pull_request.get("head", {}).get("sha", "")
                    _quota_app_id = getattr(_qt, "appId", None)
                    _quota_pk: str | None = None
                    try:
                        if getattr(_qt, "privateKey", None):
                            from src.security.crypto import decrypt as _decrypt_key

                            _quota_pk = _decrypt_key(_qt.privateKey)
                    except Exception:
                        pass

                    # Repo quota — ensure tenant is not monitoring more repos than their plan allows
                    _repo_allowed, _repo_reason = check_repo_quota(
                        _qt,
                        _db_quota,
                        repo_full_name=f"{_quota_owner}/{_quota_repo}",
                    )
                    if not _repo_allowed:
                        if _quota_sha and _quota_owner and _quota_repo:
                            await _post_quota_exceeded_check_run(
                                installation_id,
                                _quota_owner,
                                _quota_repo,
                                _quota_sha,
                                _repo_reason,
                                app_id=_quota_app_id,
                                private_key=_quota_pk,
                            )
                        raise HTTPException(
                            status_code=402,
                            detail={
                                "status": "quota_exceeded",
                                "reason": _repo_reason,
                            },
                        )
                    # PR quota — enforce monthly analysis cap
                    _allowed, _quota_reason = check_pr_quota(_qt, _db_quota)
                    if not _allowed:
                        if _quota_sha and _quota_owner and _quota_repo:
                            await _post_quota_exceeded_check_run(
                                installation_id,
                                _quota_owner,
                                _quota_repo,
                                _quota_sha,
                                _quota_reason,
                                app_id=_quota_app_id,
                                private_key=_quota_pk,
                            )
                        # QUOTA-UX-01: persist a QUOTA_EXCEEDED job so the PR
                        # is visible in the dashboard as "held back" — not silently dropped.
                        try:
                            import uuid as _uuid

                            from src.storage.sql_models import JobStatus as _QJobStatus
                            from src.storage.sql_models import Repository as _QRepo

                            _qrepo = (
                                _db_quota.query(_QRepo)
                                .filter(
                                    _QRepo.tenantId == _qt.id,
                                    _QRepo.name == _quota_repo,
                                )
                                .first()
                            )
                            if _qrepo and pr_number:
                                from datetime import datetime as _dt

                                from src.storage.sql_models import Job as _QJob
                                from src.storage.sql_models import TriageStatus as _QTriageStatus

                                _qjob = _QJob(
                                    id=f"job-{_uuid.uuid4().hex}",
                                    tenantId=_qt.id,
                                    repositoryId=_qrepo.id,
                                    prNumber=pr_number,
                                    status=_QJobStatus.QUOTA_EXCEEDED,
                                    triageStatus=_QTriageStatus.RESOLVED,
                                    result={
                                        "quota_reason": _quota_reason,
                                        "repo_full_name": f"{_quota_owner}/{_quota_repo}",
                                        "head_sha": _quota_sha,
                                        "pr_title": pull_request.get("title", ""),
                                    },
                                    logs=[],
                                    createdAt=_dt.utcnow(),
                                    updatedAt=_dt.utcnow(),
                                )
                                _db_quota.add(_qjob)
                                _db_quota.commit()
                                logger.info(
                                    "QUOTA-UX-01: quota-exceeded job recorded",
                                    pr=pr_number,
                                    repo=f"{_quota_owner}/{_quota_repo}",
                                )
                        except Exception as _qjob_err:
                            logger.warning(
                                "QUOTA-UX-01: failed to record quota job", error=str(_qjob_err)
                            )
                        raise HTTPException(
                            status_code=402,
                            detail={
                                "status": "quota_exceeded",
                                "reason": _quota_reason,
                            },
                        )
            finally:
                _db_quota.close()
        except HTTPException:
            raise
        except Exception as _exc:
            logger.warning("GAP-01: quota check failed — allowing request", error=str(_exc))

    # Idempotency guard: skip if we already have a non-failed job for this
    # exact (pr_number, head_sha) pair. Prevents duplicate analysis from
    # GitHub firing opened + synchronize + check_suite for the same commit.
    _head_sha_check = pull_request.get("head", {}).get("sha")
    if _head_sha_check:
        try:
            from src.pipeline.job_manager import SessionLocal as _IdemSession
            from src.storage.sql_models import Job as _IdemJob
            from src.storage.sql_models import JobStatus as _IdemStatus

            _idem_db = _IdemSession()
            try:
                _existing = (
                    _idem_db.query(_IdemJob)
                    .filter(
                        _IdemJob.prNumber == pr_number,
                        _IdemJob.result.op("->>")(  # type: ignore[attr-defined]
                            "head_sha"
                        )
                        == _head_sha_check,
                        _IdemJob.status != _IdemStatus.FAILED,
                    )
                    .first()
                )
                if _existing:
                    logger.info(
                        "Skipping duplicate analysis — job already exists for this commit",
                        pr=pr_number,
                        head_sha=_head_sha_check,
                        existing_job=_existing.id,
                    )
                    return {"status": "skipped", "reason": "duplicate_commit"}
            finally:
                _idem_db.close()
        except Exception as _idem_exc:
            logger.warning("Idempotency check failed — proceeding anyway", error=str(_idem_exc))

    # Enqueue the analysis job
    from rq import Retry

    from src.worker.jobs import _on_job_failure, analyze_pr_job
    from src.worker.queue import QUEUE_DEFAULT, get_queue

    queue = get_queue(QUEUE_DEFAULT)
    job = queue.enqueue(
        analyze_pr_job,
        installation_id=installation_id,
        owner=repository.get("owner", {}).get("login"),
        repo=repository.get("name"),
        pr_number=pr_number,
        action=action,
        base_sha=pull_request.get("base", {}).get("sha"),
        head_sha=pull_request.get("head", {}).get("sha"),
        changed_files=[],  # Analyzer will fetch files if empty list passed
        base_ref=pull_request.get("base", {}).get("ref"),
        jira_ticket_key=jira_ticket_key,
        ai_authored=ai_authored,
        ai_signal=_ai_signal,
        sender_type=sender_type,
        job_timeout=settings.max_processing_time,
        retry=Retry(max=3, interval=[30, 60, 120]),
        result_ttl=3600,
        failure_ttl=604800,
        on_failure=_on_job_failure,
    )

    logger.info("Queued PR analysis job", job_id=job.id, pr=pr_number, repo=repo_full_name)

    return {
        "status": "queued",
        "job_id": job.id,
        "delivery_id": delivery_id,
        "repository": repo_full_name,
        "pull_request": pr_number,
        "message": "Documentation drift analysis queued",
    }


async def handle_fix_pr_merged(data: dict[str, Any], head_ref: str) -> dict[str, Any]:
    """
    Called when a DocuGardener fix PR is merged.
    Marks the original inbox alert as RESOLVED so it disappears from the queue.
    Branch name format: docugardener-fix-{pr_number}-{uuid}
    """
    import re

    # Extract original PR number from branch name
    match = re.match(r"docugardener-fix-(\d+)-", head_ref)
    if not match:
        logger.warning(
            "handle_fix_pr_merged: could not parse PR number from branch", branch=head_ref
        )
        return {"status": "skipped", "reason": "could not parse branch"}

    original_pr_number = int(match.group(1))
    installation_id = data.get("installation", {}).get("id")

    try:
        from datetime import datetime

        from src.pipeline.job_manager import SessionLocal
        from src.storage.sql_models import Job, Tenant, TriageStatus

        db = SessionLocal()
        try:
            tenant = db.query(Tenant).filter(Tenant.installationId == str(installation_id)).first()
            if not tenant:
                logger.warning(
                    "handle_fix_pr_merged: tenant not found", installation_id=installation_id
                )
                return {"status": "skipped", "reason": "tenant not found"}

            # Resolve ALL jobs in FIX_PR_OPEN state for this PR number.
            # FIX_PR_OPEN is the state set when the fix PR is created; RESOLVED
            # means the fix PR has been merged.  We only promote FIX_PR_OPEN →
            # RESOLVED here so we don't accidentally touch PENDING jobs (human
            # PRs still awaiting triage) or already-RESOLVED records.
            merged_at_str = datetime.utcnow().isoformat() + "Z"
            jobs = (
                db.query(Job)
                .filter(
                    Job.tenantId == tenant.id,
                    Job.prNumber == original_pr_number,
                    Job.triageStatus == TriageStatus.FIX_PR_OPEN,
                )
                .all()
            )

            if not jobs:
                logger.warning(
                    "handle_fix_pr_merged: no FIX_PR_OPEN job found for original PR",
                    pr=original_pr_number,
                )
                return {"status": "skipped", "reason": "job not found"}

            for job in jobs:
                job.triageStatus = TriageStatus.RESOLVED
                job.updatedAt = datetime.utcnow()
                # Stamp merge timestamp so the Jobs timeline can display it
                new_result = dict(job.result or {})
                new_result["fix_pr_merged_at"] = merged_at_str
                job.result = new_result
            db.commit()

            job = jobs[0]  # Use first job for check run update below
            logger.info(
                "Fix PR merged — original alert marked RESOLVED",
                original_pr=original_pr_number,
                fix_branch=head_ref,
                resolved_jobs=len(jobs),
                job_id=job.id,
            )

            # Update GitHub check run to success now that the fix PR is merged
            result_data_early = job.result or {}
            check_run_id = result_data_early.get("check_run_id")
            fix_installation_id = result_data_early.get("installation_id")
            repo_full_name = result_data_early.get("repo_full_name")
            if (
                check_run_id
                and fix_installation_id
                and repo_full_name
                and tenant.appId
                and tenant.privateKey
            ):
                try:
                    from src.github.app import get_github_client
                    from src.security.encryption import decrypt_credential

                    _private_key = decrypt_credential(tenant.privateKey)
                    client = get_github_client(
                        int(fix_installation_id), app_id=int(tenant.appId), private_key=_private_key
                    )
                    github_repo = client.get_repo(repo_full_name)
                    check_run = github_repo.get_check_run(int(check_run_id))
                    check_run.edit(
                        name="DocuGardener",
                        status="completed",
                        conclusion="success",
                        output={
                            "title": "✅ Documentation is now in sync",
                            "summary": (
                                f"The documentation fix PR has been merged. "
                                f"All documentation drift for PR #{original_pr_number} is resolved."
                            ),
                        },
                    )
                    logger.info(
                        "Check Run updated to success after fix PR merge",
                        job_id=job.id,
                        check_run_id=check_run_id,
                    )
                except Exception as e:
                    logger.warning("Failed to update check run after fix PR merge", error=str(e))

            # Post fix-merge notifications (Jira comment + close GitHub Issue)
            result_data = job.result or {}
            jira_ticket_key = result_data.get("jira_ticket_key")
            fix_pr_url = result_data.get("fixPrUrl", "")
            github_issue_number = result_data.get("github_issue_number")
            github_issue_repo = result_data.get("github_issue_repo")
            linear_issue_id = result_data.get("linear_issue_id")
            if (
                jira_ticket_key or github_issue_number or linear_issue_id
            ) and tenant.workflowConfig:
                try:
                    import asyncio

                    from src.notifications.dispatcher import NotificationDispatcher
                    from src.security.crypto import decrypt as _decrypt_key

                    _wc = dict(tenant.workflowConfig)
                    _granted = _wc.get("grantedFeatures")  # list[str] | None
                    dispatcher = NotificationDispatcher(
                        workflow_config=_wc,
                        tenant_plan=getattr(tenant, "plan", "FREE"),
                        github_app_id=tenant.appId,
                        github_private_key=_decrypt_key(tenant.privateKey)
                        if tenant.privateKey
                        else None,
                        installation_id=tenant.installationId,
                        granted_features=_granted,
                    )
                    if jira_ticket_key:
                        comment = (
                            f"✅ *DocuGardener — Documentation Updated*\n\n"
                            f"The documentation fix for PR [#{original_pr_number}|https://github.com] "
                            f"has been merged{' — ' + fix_pr_url if fix_pr_url else ''}.\n"
                            f"Docs are now in sync."
                        )
                        asyncio.run(
                            dispatcher.post_jira_lifecycle_comment(jira_ticket_key, comment)
                        )
                    if github_issue_number:
                        asyncio.run(
                            dispatcher.close_github_issue(
                                repo=github_issue_repo,
                                issue_number=int(github_issue_number),
                                comment=f"✅ Fixed by merged documentation PR. Drift for PR #{original_pr_number} is now resolved.",
                            )
                        )
                    if linear_issue_id:
                        asyncio.run(dispatcher.resolve_linear_issue(linear_issue_id))
                except Exception as e:
                    logger.warning("Failed to post fix-merge notifications", error=str(e))

            return {"status": "resolved", "original_pr": original_pr_number, "job_id": job.id}

        finally:
            db.close()

    except Exception as e:
        logger.error("handle_fix_pr_merged failed", error=str(e), branch=head_ref)
        return {"status": "error", "reason": str(e)}


async def handle_installation(data: dict[str, Any]) -> dict[str, Any]:
    """
    Handle GitHub installation event.
    Saves the installation_id to the Tenant record so we can use it for API access.
    """
    action = data.get("action")
    installation = data.get("installation", {})
    installation_id = installation.get("id")
    account = installation.get("account", {})
    # owner_id is the GitHub Organization or User ID
    owner_id = str(account.get("id"))

    logger.info(
        "Processing installation event",
        action=action,
        owner_id=owner_id,
        installation_id=installation_id,
    )

    # We care about new installations and updating permissions
    if action in ["created", "new_permissions_accepted"]:
        from src.pipeline.job_manager import SessionLocal
        from src.storage.sql_models import Tenant

        db = SessionLocal()
        try:
            # Match by githubOrgId (which we save during manifest callback)
            tenant = db.query(Tenant).filter(Tenant.githubOrgId == owner_id).first()
            if tenant:
                tenant.installationId = str(installation_id)
                db.commit()
                logger.info(
                    "Updated tenant installation ID",
                    tenant_id=tenant.id,
                    installation_id=installation_id,
                )
            else:
                logger.warning("Tenant not found for installation", owner_id=owner_id)
        except Exception as e:
            db.rollback()
            logger.error("Failed to update tenant installation", error=str(e))
        finally:
            db.close()

    return {"status": "success", "action": action}
