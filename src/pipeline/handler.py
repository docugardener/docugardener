# SPDX-License-Identifier: AGPL-3.0-or-later
"""
Webhook job handler for asynchronous PR processing.

Handles queued PR analysis jobs from the webhook handler.
"""

import time
from typing import Any

from src.api.middleware import set_tenant_id
from src.core.config import settings
from src.core.logging import get_logger
from src.github.app import get_installation_token
from src.monitoring.metrics import record_analysis
from src.notifications.dispatcher import NotificationDispatcher
from src.notifications.first_analysis_email import maybe_send_first_analysis_email
from src.pipeline.analyzer import FileChange, PRAnalysisResult, PRAnalyzer
from src.pipeline.job_manager import JobStatus, job_manager
from src.pipeline.policy_evaluator import evaluate_policies
from src.pipeline.policy_parser import parse_policies
from src.pipeline.repo_config import apply_ignore_patterns, load_repo_config
from src.pipeline.reporter import GitHubReporter
from src.worker.context import get_tenant_context

logger = get_logger(__name__)


async def process_pull_request(
    installation_id: int,
    owner: str,
    repo: str,
    pr_number: int,
    action: str,
    base_sha: str,
    head_sha: str,
    changed_files: list[dict[str, Any]],
    base_ref: str | None = None,
    jira_ticket_key: str | None = None,
    ai_authored: bool = False,
    ai_signal: str = "",
    job_id: str | None = None,
) -> PRAnalysisResult:
    """
    Process a Pull Request webhook event.

    This is the main entry point for PR analysis, called from
    the webhook handler or job queue.

    Args:
        installation_id: GitHub App installation ID
        owner: Repository owner
        repo: Repository name
        pr_number: PR number
        action: PR action (opened, synchronize, etc.)
        base_sha: Base branch SHA
        head_sha: Head branch SHA
        changed_files: List of changed file metadata
        base_ref: Base branch name (e.g. main)

    Returns:
        Analysis result
    """
    logger.info(
        "Processing PR",
        repo=f"{owner}/{repo}",
        pr=pr_number,
        action=action,
    )

    # Skip if action is not relevant
    if action not in ("opened", "synchronize", "reopened"):
        logger.info("Skipping irrelevant action", action=action)
        return PRAnalysisResult(
            pr_number=pr_number,
            repo_full_name=f"{owner}/{repo}",
            error=f"Skipped: action '{action}' not analyzed",
        )

    # Resolve Tenant Context first — must happen before any GitHub API call
    # so we use per-tenant credentials (appId + privateKey stored in DB)
    # rather than the global .env values which may belong to a different app.
    llm_config = None
    notification_config = None
    try:
        tenant_ctx = get_tenant_context(str(installation_id))
        tenant_id = tenant_ctx.tenant_id
        set_tenant_id(tenant_id)
        llm_config = tenant_ctx.llm_config
        notification_config = tenant_ctx.notification_config
        workflow_config = getattr(tenant_ctx, "workflow_config", None)
        tenant_plan = getattr(tenant_ctx, "plan", "FREE") or "FREE"
        _app_id = int(tenant_ctx.app_id)
        _private_key = tenant_ctx.private_key
    except ValueError as e:
        logger.error("Tenant resolution failed", installation_id=installation_id, error=str(e))
        return PRAnalysisResult(pr_number=pr_number, repo_full_name=f"{owner}/{repo}", error=str(e))

    # Get installation token using per-tenant credentials
    token = get_installation_token(installation_id, app_id=_app_id, private_key=_private_key)

    # Fetch changed files if not provided (when called from webhook)
    gh_repo = None
    if not changed_files or base_ref is None:
        from src.github.app import get_github_client

        client = get_github_client(installation_id, app_id=_app_id, private_key=_private_key)
        gh_repo = client.get_repo(f"{owner}/{repo}")
        pr = gh_repo.get_pull(pr_number)

        if not changed_files:
            logger.info("Fetching changed files from GitHub API", pr=pr_number)
            changed_files = [f.raw_data for f in pr.get_files()]

        if base_ref is None:
            base_ref = pr.base.ref

    # WORK-02: Load repo-level config from .github/docugardener.yml (if present)
    repo_config = load_repo_config(owner, repo, token, ref=base_ref or "HEAD")
    ignore_patterns: list[str] = repo_config.get("ignore_patterns", [])

    # Convert file metadata, filtering out repo-level ignore patterns first
    all_file_paths = [f.get("filename", "") for f in changed_files]
    kept_paths = set(apply_ignore_patterns(all_file_paths, ignore_patterns))
    skipped_count = len(all_file_paths) - len(kept_paths)
    if skipped_count:
        logger.info(
            "WORK-02: skipping files via repo config ignore_patterns",
            skipped=skipped_count,
            patterns=ignore_patterns,
        )

    files = [
        FileChange(
            path=f.get("filename", ""),
            status=f.get("status", "modified"),
            additions=f.get("additions", 0),
            deletions=f.get("deletions", 0),
            patch=f.get("patch"),
        )
        for f in changed_files
        if f.get("filename", "") in kept_paths
    ]

    # DOCPOL-01: Evaluate policy rules from repo config
    policy_rules = parse_policies(repo_config, tenant_plan=getattr(tenant_ctx, "plan", "FREE"))
    policy_violations = []
    policy_blocks_merge = False
    if policy_rules:
        repo_file_tree = _fetch_repo_tree(owner, repo, head_sha, token)
        policy_violations = evaluate_policies(policy_rules, [f.path for f in files], repo_file_tree)
        policy_blocks_merge = any(
            v.enforcement in ("blocking", "blocking-with-reason") for v in policy_violations
        )

    # Create initial Check Run
    check_run_id = await create_initial_check_run(
        installation_id=installation_id,
        owner=owner,
        repo=repo,
        head_sha=head_sha,
        app_id=_app_id,
        private_key=_private_key,
    )

    # Default result — populated by the analysis; used by the finally block
    # to call report_to_pr even if an exception occurs mid-analysis.
    result: PRAnalysisResult = PRAnalysisResult(
        pr_number=pr_number,
        repo_full_name=f"{owner}/{repo}",
    )

    # Track Job in DB
    repo_id: str | None = None  # BUG-5: resolved below for Weaviate indexing
    try:
        # Resolve GitHub numeric repo ID for DB/Weaviate namespacing.
        # gh_repo is already set when we fetched files; if the queue provided
        # pre-fetched files we make one targeted call to get the repo ID.
        if gh_repo is None:
            try:
                from src.github.app import get_github_client

                _id_client = get_github_client(
                    installation_id, app_id=_app_id, private_key=_private_key
                )
                gh_repo = _id_client.get_repo(f"{owner}/{repo}")
            except Exception as _e:
                logger.warning(
                    "Could not resolve GitHub repo ID; using fallback '0'", error=str(_e)
                )
        github_repo_id = str(gh_repo.id) if gh_repo is not None else "0"
        # BUG-5: always resolve repo_id (get_or_create_repo is idempotent) so that
        # analyze_pr can stamp lastIndexedAt regardless of whether this is the
        # normal path (job_id is None) or the GAP-4 pre-created path.
        repo_id = job_manager.get_or_create_repo(tenant_id, github_repo_id, repo)
        if job_id is None:
            # Defense-in-depth: check for an existing non-failed job for this
            # (tenant, repo, pr_number, head_sha) before creating a new one.
            # Normally GAP-4 pre-creates the record and passes it via db_job_id;
            # this guard is a fallback for any path where that didn't happen.
            try:
                from src.pipeline.job_manager import SessionLocal as _HandlerIdemSession
                from src.storage.sql_models import Job as _HandlerIdemJob
                from src.storage.sql_models import JobStatus as _HandlerIdemStatus

                _h_db = _HandlerIdemSession()
                try:
                    _h_existing = (
                        _h_db.query(_HandlerIdemJob)
                        .filter(
                            _HandlerIdemJob.tenantId == tenant_id,
                            _HandlerIdemJob.repositoryId == repo_id,
                            _HandlerIdemJob.prNumber == pr_number,
                            _HandlerIdemJob.result.op("->>")(  # type: ignore[attr-defined]
                                "head_sha"
                            )
                            == head_sha,
                            _HandlerIdemJob.status != _HandlerIdemStatus.FAILED,
                        )
                        .first()
                    )
                    if _h_existing:
                        logger.info(
                            "handler: existing job found — reusing instead of creating duplicate",
                            job_id=_h_existing.id,
                            pr=pr_number,
                            head_sha=head_sha,
                            tenant_id=tenant_id,
                        )
                        job_id = _h_existing.id
                finally:
                    _h_db.close()
            except Exception as _h_idem_exc:
                logger.warning(
                    "handler: defense-in-depth idem check failed — will create new job",
                    error=str(_h_idem_exc),
                )

            if job_id is None:
                # Normal path: no pre-created record — create it now.
                job_id = job_manager.create_job(tenant_id, repo_id, pr_number)
        # else: GAP-4 path — record was pre-created in webhooks.py before Redis enqueue;
        # on_failure callback can now mark it FAILED even if this worker never started.
        if ai_authored and job_id:
            from src.pipeline.job_manager import SessionLocal
            from src.storage.sql_models import Job as _Job

            _sess = SessionLocal()
            try:
                _sess.query(_Job).filter(_Job.id == job_id).update({"aiAuthored": True})
                _sess.commit()
            except Exception as _e:
                logger.warning("Failed to set aiAuthored on job", error=str(_e))
                _sess.rollback()
            finally:
                _sess.close()
        job_manager.update_status(job_id, JobStatus.PROCESSING)
    except Exception as e:
        logger.error("Failed to create job record", error=str(e))
        job_id = None

    # Attach policy results to the result object so reporter.py can surface them
    # (populated after analyze_pr returns below)
    _policy_violations = policy_violations
    _policy_blocks_merge = policy_blocks_merge

    # Run analysis
    analyzer = PRAnalyzer()
    _analysis_start = time.monotonic()
    try:
        result = await analyzer.analyze_pr(
            owner=owner,
            repo=repo,
            pr_number=pr_number,
            base_sha=base_sha,
            head_sha=head_sha,
            changed_files=files,
            installation_token=token,
            tenant_id=tenant_id,
            base_ref=base_ref,
            llm_config=llm_config,
            repo_db_id=repo_id,
            workflow_config=workflow_config,
            plan=tenant_plan,
        )
        result.policy_violations = _policy_violations
        result.policy_blocks_merge = _policy_blocks_merge
        _analysis_duration = time.monotonic() - _analysis_start
        record_analysis(
            repo=f"{owner}/{repo}",
            duration_seconds=_analysis_duration,
            drift_score=result.drift_score or 0,
            severity=(result.drift_analysis.severity if result.drift_analysis else "none"),
            entities_count=len(files),
            success=result.success,
        )

        # Complete Job
        if job_id:
            if result.success:
                result_payload = {
                    "drift_score": result.drift_score,
                    "updates": len(result.documentation_updates),
                    "head_sha": head_sha,
                    "base_ref": base_ref,
                    "repo_full_name": f"{owner}/{repo}",
                    "changed_files": [f.path for f in files],
                    "check_run_id": check_run_id,
                    "installation_id": installation_id,
                    "jira_ticket_key": jira_ticket_key,
                    "ai_authored": ai_authored,
                    "ai_signal": ai_signal,
                    "documentation_updates": [
                        {
                            "file_path": str(u.file_path),
                            "content": u.content,
                            # FIX-01: recheck metadata from the documentation verification pass
                            "recheck_status": (
                                "passed"
                                if u.is_verified
                                else ("failed" if u.verification is not None else "skipped")
                            ),
                            "recheck_confidence": (
                                round(u.verification.confidence, 4)
                                if u.verification is not None
                                else None
                            ),
                        }
                        for u in result.documentation_updates
                    ],
                    "llm_usage": result.llm_usage,
                    "processing_time_ms": result.processing_time_ms,
                    "policy_violations": [
                        {
                            "rule_name": v.rule_name,
                            "enforcement": v.enforcement,
                            "paths_matched": v.paths_matched,
                            "require_docs": v.require_docs,
                            "docs_present": v.docs_present,
                            "docs_missing": v.docs_missing,
                        }
                        for v in policy_violations
                    ],
                    "policy_blocks_merge": policy_blocks_merge,
                    "pipeline_steps": {
                        "analysis_ms": round(_analysis_duration * 1000),
                        "docs_generated": len(result.documentation_updates),
                        "policy_violations": len(policy_violations),
                        "llm_tokens": (
                            result.llm_usage.get("total_tokens")
                            if isinstance(result.llm_usage, dict)
                            else None
                        ),
                    },
                }

                if result.drift_analysis:
                    try:
                        result_payload["drift_analysis"] = {
                            "severity": result.drift_analysis.severity,
                            "summary": result.drift_analysis.summary,
                            # FIX-01: expose verifier confidence (0.0–1.0) in the stored result
                            "confidence_score": round(result.drift_analysis.confidence_score, 4),
                            "reasons": [
                                {
                                    # LLM returns {file, section, reason}; fall back to legacy entity_name
                                    "entity": (r.get("section") or r.get("entity_name") or "")
                                    if isinstance(r, dict)
                                    else getattr(r, "entity_name", ""),
                                    "file": r.get("file", "") if isinstance(r, dict) else "",
                                    "reason": (r.get("reason") or "")
                                    if isinstance(r, dict)
                                    else getattr(r, "reason", ""),
                                }
                                for r in result.drift_analysis.required_updates
                            ],
                        }
                    except Exception as e:
                        logger.error("Failed to serialize drift analysis", error=str(e))

                # Pre-compute whether a fix PR will be auto-enqueued so the inbox
                # shows the correct state immediately on first appearance — no polling gap.
                _wf_pre = dict(workflow_config) if workflow_config else {}
                _has_updates = bool(result.documentation_updates)
                _epic05_will_fire = (
                    ai_authored and _has_updates and _wf_pre.get("aiAuthorMode") is True
                )
                _scale04_will_fire = (
                    not _epic05_will_fire
                    and _has_updates
                    and _wf_pre.get("autoHeal") is True
                    and result.drift_score >= int(_wf_pre.get("autoHealAbove", 80))
                )
                result_payload["auto_fix_enqueued"] = _epic05_will_fire or _scale04_will_fire

                job_manager.complete_job(job_id, result_payload)

                # C-04: first-analysis email — fire-and-forget, never blocks job
                try:
                    _da = result_payload.get("drift_analysis") or {}
                    _drift_score_c04: float = float(
                        _da.get("drift_score", result.drift_score)
                        if isinstance(_da, dict)
                        else result.drift_score
                    )
                    _summary_text_c04: str = (
                        _da.get("summary", "") if isinstance(_da, dict) else ""
                    ) or ""
                    maybe_send_first_analysis_email(
                        tenant_id=tenant_id,
                        pr_number=pr_number,
                        repo_full_name=f"{owner}/{repo}",
                        drift_score=_drift_score_c04,
                        summary_text=_summary_text_c04,
                        correlation_id=job_id,
                    )
                except Exception as _c04_exc:  # noqa: BLE001
                    logger.warning(
                        "C-04: first_analysis_email hook raised unexpectedly (non-fatal)",
                        extra={"error": str(_c04_exc), "tenant_id": tenant_id},
                    )

                _fix_pr_enqueued = False

                # EPIC-05: AI Author Mode — bypass inbox triage for AI-authored PRs.
                # When a PR is detected as AI-authored AND the tenant has enabled
                # aiAuthorMode, skip the inbox entirely and auto-enqueue the fix PR.
                if ai_authored and workflow_config and result.documentation_updates:
                    _wf = dict(workflow_config)
                    if _wf.get("aiAuthorMode") is True:
                        _auto_merge = bool(_wf.get("autoMergeAiDocs", False))
                        logger.info(
                            "EPIC-05: AI-authored PR — bypassing inbox, enqueuing fix PR",
                            job_id=job_id,
                            auto_merge=_auto_merge,
                            drift_score=result.drift_score,
                        )
                        try:
                            from rq import Retry

                            from src.worker.jobs import _on_job_failure, create_fix_pr_job
                            from src.worker.queue import QUEUE_HIGH, get_queue

                            # auto_merge jobs need extra time for CI polling (up to 10×30s)
                            _fix_timeout = 360 if _auto_merge else settings.max_processing_time
                            get_queue(QUEUE_HIGH).enqueue(
                                create_fix_pr_job,
                                job_id,
                                auto_merge=_auto_merge,
                                job_timeout=_fix_timeout,
                                retry=Retry(max=3, interval=[30, 60, 120]),
                                result_ttl=3600,
                                failure_ttl=604800,
                                on_failure=_on_job_failure,
                            )
                            _fix_pr_enqueued = True
                        except Exception as _e:
                            logger.error(
                                "EPIC-05: failed to enqueue AI bypass fix PR",
                                error=str(_e),
                            )

                # SCALE-04: Auto-Healing — enqueue fix PR when drift is severe.
                # Skipped if EPIC-05 already enqueued a fix PR for this job.
                if not _fix_pr_enqueued and workflow_config and result.documentation_updates:
                    _wf = dict(workflow_config)
                    if _wf.get("autoHeal") is True:
                        _auto_heal_above = int(_wf.get("autoHealAbove", 80))
                        if result.drift_score >= _auto_heal_above:
                            logger.info(
                                "SCALE-04: Auto-Heal triggered — enqueuing fix PR",
                                drift_score=result.drift_score,
                                threshold=_auto_heal_above,
                                job_id=job_id,
                            )
                            try:
                                from rq import Retry

                                from src.worker.jobs import _on_job_failure, create_fix_pr_job
                                from src.worker.queue import QUEUE_HIGH, get_queue

                                get_queue(QUEUE_HIGH).enqueue(
                                    create_fix_pr_job,
                                    job_id,
                                    job_timeout=settings.max_processing_time,
                                    retry=Retry(max=3, interval=[30, 60, 120]),
                                    result_ttl=3600,
                                    failure_ttl=604800,
                                    on_failure=_on_job_failure,
                                )
                                _fix_pr_enqueued = True
                            except Exception as _e:
                                logger.error(
                                    "SCALE-04: failed to enqueue auto-heal fix PR",
                                    error=str(_e),
                                )

                # Trigger Workflow Dispatcher for Drift Alerts
                if (
                    result.drift_analysis
                    and result.drift_analysis.required_updates
                    and workflow_config
                ):
                    dispatcher = NotificationDispatcher(
                        workflow_config=workflow_config,
                        tenant_plan=getattr(tenant_ctx, "plan", "FREE"),
                        github_app_id=tenant_ctx.app_id,
                        github_private_key=tenant_ctx.private_key,
                        installation_id=getattr(tenant_ctx, "installation_id", None),
                    )

                    # Build entity list from required_updates
                    # LLM returns {file, section, reason}; fall back to legacy entity_name
                    entities = []
                    for item in result.drift_analysis.required_updates:
                        name = (
                            item.get("section") or item.get("entity_name")
                            if isinstance(item, dict)
                            else getattr(item, "entity_name", None)
                        )
                        if name:
                            entities.append(name)

                    # One consolidated record per PR — not one per update item
                    class DriftRecordProxy:
                        def __init__(
                            self,
                            owner,
                            repo,
                            pr_number,
                            head_sha,
                            drift_score,
                            severity,
                            summary,
                            entities,
                        ):
                            self.owner = owner
                            self.repo = repo
                            self.pr_number = pr_number
                            self.head_sha = head_sha
                            self.drift_score = drift_score
                            self.severity = severity
                            self.summary = summary
                            self.entities = entities

                    record = DriftRecordProxy(
                        owner=owner,
                        repo=repo,
                        pr_number=pr_number,
                        head_sha=head_sha,
                        drift_score=result.drift_score,
                        severity=result.drift_analysis.severity,
                        summary=result.drift_analysis.summary,
                        entities=entities,
                    )
                    _dispatch_results = await dispatcher.dispatch_drift_alert(
                        record, jira_ticket_key=jira_ticket_key
                    )
                    # Persist integration dispatch status (PH15-06) — non-fatal
                    if _dispatch_results:
                        try:
                            from src.pipeline.job_manager import get_db
                            from src.storage.sql_models import Tenant as _TenantModel

                            _db_st = next(get_db())
                            try:
                                _t = (
                                    _db_st.query(_TenantModel)
                                    .filter(_TenantModel.id == tenant_id)
                                    .first()
                                )
                                if _t:
                                    _wc = dict(_t.workflowConfig) if _t.workflowConfig else {}
                                    _wc["integrationStatus"] = _dispatch_results
                                    _t.workflowConfig = _wc
                                    _db_st.commit()
                            finally:
                                _db_st.close()
                        except Exception as _st_err:
                            logger.warning(
                                "Failed to persist integration dispatch status", error=str(_st_err)
                            )
                    # Persist GitHub and Linear issue references for fix-PR resolution
                    _gh_issue_num = getattr(record, "github_issue_number", None)
                    _gh_issue_repo = getattr(record, "github_issue_repo", None)
                    _linear_issue_id = getattr(record, "linear_issue_id", None)
                    _issue_patch: dict = {}
                    if _gh_issue_num:
                        _issue_patch["github_issue_number"] = _gh_issue_num
                        _issue_patch["github_issue_repo"] = _gh_issue_repo
                    if _linear_issue_id:
                        _issue_patch["linear_issue_id"] = _linear_issue_id
                    if _issue_patch and job_id:
                        try:
                            job_manager.patch_result(job_id, _issue_patch)
                        except Exception as _e:
                            logger.warning("Failed to persist issue refs", error=str(_e))

            else:
                job_manager.fail_job(job_id, result.error or "Unknown error")

    except Exception as e:
        if job_id:
            job_manager.fail_job(job_id, str(e))
        raise e
    finally:
        # GAP-8: report_to_pr in finally so the GitHub check run always resolves,
        # even if process_pull_request raises. Without this, check runs can stay
        # stuck in "in_progress" indefinitely after worker failures.
        _reporter = GitHubReporter(
            installation_id,
            notification_config=notification_config,
            app_id=_app_id,
            private_key=_private_key,
        )
        try:
            await _reporter.report_to_pr(
                result,
                check_run_id=check_run_id,
                job_id=job_id,
                tenant_id=tenant_id,
            )
        except Exception as _report_exc:
            # Reporting failure must never mask the original analysis error.
            logger.warning(
                "report_to_pr failed in finally block",
                error=str(_report_exc),
                job_id=job_id,
            )

    return result


async def create_initial_check_run(
    installation_id: int,
    owner: str,
    repo: str,
    head_sha: str,
    app_id: int | None = None,
    private_key: str | None = None,
) -> int:
    """
    Create an initial "in progress" Check Run.

    Called immediately when PR is received to show processing status.

    Args:
        installation_id: GitHub App installation ID
        owner: Repository owner
        repo: Repository name
        head_sha: Commit SHA
        app_id: Per-tenant GitHub App ID (overrides global .env value)
        private_key: Per-tenant private key (overrides global secrets/ file)

    Returns:
        Check Run ID
    """
    from src.github.app import get_github_client

    client = get_github_client(installation_id, app_id=app_id, private_key=private_key)
    github_repo = client.get_repo(f"{owner}/{repo}")

    check_run = github_repo.create_check_run(
        name="DocuGardener",
        head_sha=head_sha,
        status="in_progress",
        output={
            "title": "Analyzing documentation drift...",
            "summary": "DocuGardener is analyzing your code changes for documentation drift.",
        },
    )

    logger.info(
        "Created initial check run",
        repo=f"{owner}/{repo}",
        check_run_id=check_run.id,
    )

    return check_run.id


async def process_fix_pr(job_id: str, auto_merge: bool = False) -> None:
    """
    Background job to create an Auto-PR with documentation fixes.

    Executed when an Admin clicks 'Accept Changes' in the Inbox (auto_merge=False)
    or when EPIC-05 AI Author Mode bypasses inbox triage (auto_merge=True).

    Args:
        job_id: DB Job ID containing the analysis result.
        auto_merge: If True, merge the fix PR after CI passes and post
                    a summary comment on the original PR.
    """
    from datetime import datetime

    from src.agents.verifier import DocumentationDraft
    from src.github.app import get_installation_token
    from src.github.committer import GitCommitter
    from src.pipeline.job_manager import JobStatus, SessionLocal, get_db
    from src.storage.sql_models import Job, Tenant, TriageStatus
    from src.storage.sql_models import Job as _Job  # alias for dedup guard

    logger.info("Processing Auto-PR trigger", job_id=job_id)

    db = next(get_db())
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        logger.error("Job not found", job_id=job_id)
        return

    if not job.result or not isinstance(job.result, dict):
        logger.error("Job missing result or result is not a dict", job_id=job_id)
        job_manager.fail_job(job_id, "Missing analysis results for PR generation")
        return

    tenant = db.query(Tenant).filter(Tenant.id == job.tenantId).first()
    if not tenant or not tenant.githubOrgId:
        logger.error("Tenant not found or missing githubOrgId", tenant_id=job.tenantId)
        job_manager.fail_job(
            job_id, "Tenant configuration incomplete (missing GitHub Installation)"
        )
        return

    try:
        # Resolve installation ID from tenant's stored installationId (preferred)
        # falling back to githubOrgId for legacy records.
        raw_id = tenant.installationId or tenant.githubOrgId
        try:
            installation_id = int(raw_id)
        except (ValueError, TypeError):
            logger.error("Invalid installation ID in tenant config", raw_id=raw_id)
            job_manager.fail_job(job_id, "Invalid GitHub Installation ID")
            return

        # Use per-tenant credentials stored in DB
        from src.security.encryption import decrypt_credential

        _app_id = int(tenant.appId)
        _private_key = decrypt_credential(tenant.privateKey)
        token = get_installation_token(installation_id, app_id=_app_id, private_key=_private_key)

        result_content = job.result
        original_head_sha = result_content.get("head_sha")
        base_ref = result_content.get("base_ref")
        repo_full_name = result_content.get("repo_full_name")
        updates_raw = result_content.get("documentation_updates", [])
        ai_signal = result_content.get("ai_signal") or None

        if not repo_full_name or "/" not in repo_full_name:
            logger.error("Invalid repo_full_name in job result", job_id=job_id, repo=repo_full_name)
            job_manager.fail_job(job_id, "Could not resolve repository name")
            return

        owner, repo_name = repo_full_name.split("/")

        updates = []
        for u in updates_raw:
            if not u.get("file_path") or not u.get("content"):
                continue
            draft = DocumentationDraft(
                entity_name="Auto-PR Reference",
                file_path=u["file_path"],
                content=u["content"],
            )
            updates.append(draft)

        if not updates:
            logger.warning("No documentation updates found to apply", job_id=job_id)
            job_manager.fail_job(job_id, "No documentation updates were generated during analysis")
            return

        if not original_head_sha or not base_ref:
            logger.warning("Missing git references (SHA or base_ref)", job_id=job_id)
            job_manager.fail_job(job_id, "Missing git context (SHA or branch name)")
            return

        analysis_result = PRAnalysisResult(pr_number=job.prNumber, repo_full_name=repo_full_name)
        analysis_result.documentation_updates = updates

        committer = GitCommitter(installation_token=token, owner=owner, repo=repo_name)

        # Dedup guard: if an open fix PR already exists for this original PR number,
        # reuse its URL rather than creating a duplicate branch + PR.
        _existing_fix_pr_url = committer.find_open_fix_pr(job.prNumber)
        if _existing_fix_pr_url:
            logger.info(
                "Fix PR already exists — reusing existing PR, skipping new branch",
                job_id=job_id,
                existing_pr_url=_existing_fix_pr_url,
                pr_number=job.prNumber,
            )
            with SessionLocal() as db:
                _job = db.query(_Job).filter(_Job.id == job_id).first()
                if _job:
                    new_result = dict(_job.result or {})
                    new_result["fixPrUrl"] = _existing_fix_pr_url
                    _job.result = new_result
                    _job.fixPrUrl = _existing_fix_pr_url
                    # Fix PR already open — use FIX_PR_OPEN (not RESOLVED)
                    _job.triageStatus = TriageStatus.FIX_PR_OPEN
                    _job.updatedAt = datetime.utcnow()
                    db.commit()
            job_manager.complete_job(
                job_id, {**(job.result or {}), "fixPrUrl": _existing_fix_pr_url}
            )
            return

        # Transition to processing state if not already
        job_manager.update_status(job_id, JobStatus.PROCESSING)

        branch_name = committer.apply_and_push(analysis_result, original_head_sha)

        if branch_name:
            # FIX-01: compute recheck metadata from per-update statuses stored during analysis
            _drift_conf = result_content.get("drift_analysis", {}).get("confidence_score")
            _statuses = [
                u.get("recheck_status")
                for u in updates_raw
                if isinstance(u, dict) and u.get("recheck_status")
            ]
            if not _statuses:
                _agg_recheck = "skipped"
            elif all(s == "passed" for s in _statuses):
                _agg_recheck = "passed"
            else:
                _agg_recheck = "failed"
            _confidences = [
                u.get("recheck_confidence")
                for u in updates_raw
                if isinstance(u, dict) and u.get("recheck_confidence") is not None
            ]
            _agg_conf = round(sum(_confidences) / len(_confidences), 4) if _confidences else None

            pr_url = committer.create_pr(
                branch_name,
                job.prNumber,
                base_ref,
                confidence_score=float(_drift_conf) if _drift_conf is not None else None,
                recheck_status=_agg_recheck,
                ai_signal=ai_signal,
            )

            # Success! Update the job result with the new PR URL + FIX-01 metadata
            new_result = dict(job.result)
            new_result["fixPrUrl"] = pr_url
            new_result["recheck_status"] = _agg_recheck
            new_result["recheck_confidence"] = _agg_conf
            job.result = new_result
            job.fixPrUrl = pr_url  # Redundant but kept for easy access in API
            # Fix PR created — move to FIX_PR_OPEN (not RESOLVED yet).
            # RESOLVED is only set once the fix PR is actually merged:
            #   • auto-merge path: set below after auto_merge_pr() returns success
            #   • manual/human-merge path: set by handle_fix_pr_merged() webhook handler
            job.triageStatus = TriageStatus.FIX_PR_OPEN
            job.updatedAt = datetime.utcnow()
            db.commit()

            job_manager.complete_job(job_id, new_result)
            logger.info("Auto-PR successfully created and saved", job_id=job_id, pr_url=pr_url)

            # EPIC-05: Auto-merge the fix PR (AI Author Mode only)
            if auto_merge:
                _wf = dict(tenant.workflowConfig) if tenant.workflowConfig else {}
                _merge_method = _wf.get("autoMergeMethod", "squash")
                _wait_for_ci = _wf.get("autoMergeWaitForCI", True)
                skip_reason = committer.auto_merge_pr(
                    pr_url,
                    method=_merge_method,
                    wait_for_ci=bool(_wait_for_ci),
                )
                if skip_reason is None:
                    # Persist the merge method + merged-at timestamp
                    new_result["autoMergeMethod"] = _merge_method
                    new_result["fix_pr_merged_at"] = datetime.utcnow().isoformat() + "Z"
                    job.result = new_result
                    # Post summary comment on the original PR
                    committer.post_pr_comment(
                        job.prNumber,
                        (
                            f"🤖 **DocuGardener** — Documentation updated automatically.\n\n"
                            f"Documentation fix PR [{pr_url}]({pr_url}) was generated and merged "
                            f"automatically because this PR was authored by an AI coding tool.\n\n"
                            f"*No manual action required.*"
                        ),
                    )
                    # Fix PR merged — promote FIX_PR_OPEN → RESOLVED
                    from src.storage.sql_models import TriageStatus

                    job.triageStatus = TriageStatus.RESOLVED
                    job.updatedAt = datetime.utcnow()
                    db.commit()
                    logger.info(
                        "EPIC-05: fix PR auto-merged, job resolved",
                        job_id=job_id,
                        pr_url=pr_url,
                    )
                    # Close GitHub Issue if one was opened for this drift alert
                    db.refresh(job)
                    _gh_issue_num = (job.result or {}).get("github_issue_number")
                    _gh_issue_repo = (job.result or {}).get("github_issue_repo")
                    if _gh_issue_num and _gh_issue_repo and tenant.workflowConfig:
                        try:
                            from src.notifications.dispatcher import NotificationDispatcher
                            from src.security.encryption import decrypt_credential as _decrypt_key

                            _wc = dict(tenant.workflowConfig)
                            _disp = NotificationDispatcher(
                                workflow_config=_wc,
                                tenant_plan=getattr(tenant, "plan", "FREE"),
                                github_app_id=tenant.appId,
                                github_private_key=_decrypt_key(tenant.privateKey)
                                if tenant.privateKey
                                else None,
                                installation_id=tenant.installationId,
                            )
                            await _disp.close_github_issue(
                                repo=_gh_issue_repo,
                                issue_number=int(_gh_issue_num),
                                comment=f"✅ Fixed by merged documentation PR. Drift for PR #{job.prNumber} is now resolved.",
                            )
                            logger.info(
                                "EPIC-05: GitHub issue closed after auto-merge", issue=_gh_issue_num
                            )
                        except Exception as _e:
                            logger.warning("EPIC-05: failed to close GitHub issue", error=str(_e))
                else:
                    new_result["autoMergeSkipReason"] = skip_reason
                    job.result = new_result
                    db.commit()
                    logger.warning(
                        "EPIC-05: auto-merge skipped — fix PR left open",
                        job_id=job_id,
                        pr_url=pr_url,
                        reason=skip_reason,
                    )

            # Post Jira comment if a ticket was linked to the original PR
            jira_ticket_key = result_content.get("jira_ticket_key")
            if jira_ticket_key and tenant.workflowConfig:
                try:
                    from src.notifications.dispatcher import NotificationDispatcher
                    from src.security.encryption import decrypt_credential as _dc

                    dispatcher = NotificationDispatcher(
                        workflow_config=dict(tenant.workflowConfig),
                        tenant_plan=getattr(tenant, "plan", "FREE"),
                        github_app_id=tenant.appId,
                        github_private_key=_dc(tenant.privateKey) if tenant.privateKey else None,
                        installation_id=tenant.installationId,
                    )
                    comment = (
                        f"📝 *DocuGardener — Documentation Fix PR Created*\n\n"
                        f"A documentation update PR has been automatically generated for PR #{job.prNumber}.\n"
                        f"Fix PR: [{pr_url}|{pr_url}]\n\n"
                        f"Please review and merge the fix PR to complete the documentation update."
                    )
                    await dispatcher.post_jira_lifecycle_comment(jira_ticket_key, comment)
                except Exception as e:
                    logger.warning(
                        "Failed to post Jira fix PR comment", ticket=jira_ticket_key, error=str(e)
                    )
        else:
            # BUG-4: use FIX_PR_FAILED (not plain FAILED) so the UI can show an amber
            # "Fix PR could not be pushed" state, distinct from an analysis failure.
            job_manager.fail_job(
                job_id,
                "Git committer failed to create or push branch",
                triage_status="FIX_PR_FAILED",
            )

    except Exception as e:
        logger.error("Auto-PR creation failed with exception", error=str(e), job_id=job_id)
        # BUG-4: same — mark as FIX_PR_FAILED so the inbox shows an actionable amber state.
        job_manager.fail_job(
            job_id,
            f"Auto-PR generation error: {str(e)}",
            triage_status="FIX_PR_FAILED",
        )
        raise  # GAP-3: re-raise so RQ moves job to FailedJobRegistry


def _fetch_repo_tree(owner: str, repo: str, sha: str, token: str) -> list[str]:
    """
    DOCPOL-01: Fetch all blob file paths in the repository at the given SHA.

    Uses the GitHub Git Trees API with recursive=1. Returns [] on any error
    so policy evaluation degrades gracefully (all require_docs will be treated
    as missing, producing advisory-only violations where configured).

    Args:
        owner: Repository owner.
        repo:  Repository name.
        sha:   Commit SHA to fetch the tree for.
        token: GitHub installation access token.

    Returns:
        List of relative file paths (blobs only) in the repository.
    """
    import httpx

    url = f"https://api.github.com/repos/{owner}/{repo}/git/trees/{sha}"
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    try:
        resp = httpx.get(url, headers=headers, params={"recursive": "1"}, timeout=15.0)
        resp.raise_for_status()
        data = resp.json()
        if data.get("truncated"):
            logger.warning(
                "DOCPOL-01: repo tree truncated — policy evaluation may be incomplete",
                repo=f"{owner}/{repo}",
            )
        return [item["path"] for item in data.get("tree", []) if item.get("type") == "blob"]
    except Exception as exc:
        logger.warning(
            "DOCPOL-01: failed to fetch repo tree — skipping doc presence check",
            repo=f"{owner}/{repo}",
            error=str(exc),
        )
        return []
