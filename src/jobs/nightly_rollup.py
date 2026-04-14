# SPDX-License-Identifier: AGPL-3.0-or-later
"""
SCALE-03: Asynchronous Nightly Drift Rollup.

Runs at 02:00 UTC daily. For every active repository that had completed PR
analysis jobs in the past 24 hours, this job:

  1. Aggregates drift scores across all those PRs.
  2. Identifies the high-drift PRs (score >= HIGH_DRIFT_THRESHOLD).
  3. Posts a single GitHub Issue summarising the accumulated debt.

This replaces the noise of dozens of individual PR check annotations with one
focused daily digest that engineering leads can triage at their own pace.

Bot-author filtering is now implemented via `sender_type` stored in Job.result.
The rollup covers ALL completed PRs but shows a bot vs human breakdown in the
summary block so engineering leads can focus on human-authored high-drift PRs.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from src.core.config import settings
from src.core.logging import get_logger
from src.github.app import get_github_client
from src.security.encryption import decrypt_credential
from src.storage.sql_models import Job, JobStatus, Repository, Tenant

logger = get_logger(__name__)

engine = create_engine(settings.sql_database_url)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# ── Constants ─────────────────────────────────────────────────────────────────

# PRs at or above this score appear in the "High-Drift" table in the issue.
HIGH_DRIFT_THRESHOLD = 60

# GitHub label applied to every rollup issue (created on first use).
ROLLUP_ISSUE_LABEL = "docugardener-rollup"


# ── Data class ────────────────────────────────────────────────────────────────

class RepoRollupResult:
    """Aggregated drift statistics for one repository over the rollup window."""

    def __init__(
        self,
        repo_name: str,
        job_count: int,
        avg_drift: float,
        max_drift: int,
        high_drift_jobs: list[dict[str, Any]],
        bot_count: int = 0,
        human_count: int = 0,
    ) -> None:
        self.repo_name = repo_name
        self.job_count = job_count
        self.avg_drift = avg_drift
        self.max_drift = max_drift
        # Jobs whose drift_score >= HIGH_DRIFT_THRESHOLD, sorted desc by score.
        self.high_drift_jobs = high_drift_jobs
        # SCALE-03: sender_type breakdown for the rollup window.
        self.bot_count = bot_count
        self.human_count = human_count


# ── Aggregation helpers ───────────────────────────────────────────────────────

def aggregate_repo_jobs(jobs: list[Job]) -> RepoRollupResult | None:
    """
    Aggregate a list of completed Job records for a single repository.

    Returns None when no job carries a numeric drift_score in its result JSON
    (e.g. all jobs were fast-pathed or failed before scoring).
    """
    repo_name = ""
    scored: list[dict[str, Any]] = []
    bot_count = 0
    human_count = 0

    for job in jobs:
        result = job.result or {}
        drift_score = result.get("drift_score")
        if drift_score is None:
            continue
        repo_name = result.get("repo_full_name", repo_name)
        sender_type = result.get("sender_type", "human")
        if sender_type == "bot":
            bot_count += 1
        else:
            human_count += 1
        scored.append(
            {
                "pr_number": job.prNumber,
                "drift_score": int(drift_score),
                "summary": (result.get("drift_analysis") or {}).get("summary", ""),
                "severity": (result.get("drift_analysis") or {}).get("severity", "low"),
                "sender_type": sender_type,
            }
        )

    if not scored:
        return None

    scores = [j["drift_score"] for j in scored]
    avg_drift = sum(scores) / len(scores)
    max_drift = max(scores)
    high_drift = sorted(
        [j for j in scored if j["drift_score"] >= HIGH_DRIFT_THRESHOLD],
        key=lambda x: x["drift_score"],
        reverse=True,
    )

    return RepoRollupResult(
        repo_name=repo_name,
        job_count=len(scored),
        avg_drift=avg_drift,
        max_drift=max_drift,
        high_drift_jobs=high_drift,
        bot_count=bot_count,
        human_count=human_count,
    )


def build_issue_title(rollup: RepoRollupResult) -> str:
    """One-line title for the GitHub Issue."""
    date_str = datetime.utcnow().strftime("%Y-%m-%d")
    return (
        f"[DocuGardener] Nightly Drift Report — {date_str} "
        f"(avg {rollup.avg_drift:.0f}, peak {rollup.max_drift})"
    )


def build_issue_body(rollup: RepoRollupResult, window_hours: int = 24) -> str:
    """Render the full markdown body for the rollup GitHub Issue."""
    now_utc = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")

    lines: list[str] = [
        "## DocuGardener Nightly Drift Report",
        "",
        f"> **Window**: Last {window_hours} hours  ",
        f"> **PRs analysed**: {rollup.job_count}  ",
        f"> **Human-authored**: {rollup.human_count}  ",
        f"> **Bot-authored**: {rollup.bot_count}  ",
        f"> **Average drift score**: {rollup.avg_drift:.1f}  ",
        f"> **Peak drift score**: {rollup.max_drift}  ",
        "",
    ]

    if rollup.high_drift_jobs:
        lines += [
            f"### ⚠️ High-Drift PRs (score ≥ {HIGH_DRIFT_THRESHOLD})",
            "",
            "| PR | Score | Severity | Summary |",
            "|-----|-------|----------|---------|",
        ]
        for j in rollup.high_drift_jobs:
            summary = (j["summary"] or "—")[:80]
            lines.append(
                f"| #{j['pr_number']} | {j['drift_score']} | {j['severity']} | {summary} |"
            )
        lines.append("")
    else:
        lines += [
            f"### ✅ No high-drift PRs in the last {window_hours} hours",
            "",
            f"All {rollup.job_count} PR(s) analysed scored below the "
            f"{HIGH_DRIFT_THRESHOLD} threshold. Garden is healthy.",
            "",
        ]

    lines += [
        "---",
        f"*Generated by DocuGardener · {now_utc}*",
    ]

    return "\n".join(lines)


# ── GitHub Issue posting ──────────────────────────────────────────────────────

def post_rollup_issue(
    installation_id: int,
    app_id: str,
    private_key: str,
    repo_full_name: str,
    rollup: RepoRollupResult,
) -> str | None:
    """
    Create a GitHub Issue for the rollup summary.

    Returns the issue HTML URL on success, None on any error (failures are
    logged but never propagate — the rollup is best-effort).
    """
    try:
        gh = get_github_client(
            installation_id=installation_id,
            app_id=int(app_id),
            private_key=private_key,
        )
        repo = gh.get_repo(repo_full_name)

        # Ensure the label exists (idempotent — silently skip if already there).
        try:
            repo.get_label(ROLLUP_ISSUE_LABEL)
        except Exception:
            try:
                repo.create_label(
                    name=ROLLUP_ISSUE_LABEL,
                    color="0075ca",
                    description="DocuGardener daily drift digest",
                )
            except Exception:
                pass  # Label creation is best-effort; issue will still be posted.

        issue = repo.create_issue(
            title=build_issue_title(rollup),
            body=build_issue_body(rollup),
            labels=[ROLLUP_ISSUE_LABEL],
        )

        logger.info(
            "Rollup issue posted",
            repo=repo_full_name,
            issue_url=issue.html_url,
            job_count=rollup.job_count,
        )
        return issue.html_url

    except Exception as exc:
        logger.error(
            "Failed to post rollup issue",
            repo=repo_full_name,
            error=str(exc),
        )
        return None


# ── Per-tenant processing ─────────────────────────────────────────────────────

def _process_tenant(
    session,
    tenant: Tenant,
    cutoff: datetime,
    summary: dict[str, Any],
) -> None:
    """Aggregate and post rollup issues for all active repos of one tenant."""
    try:
        private_key = decrypt_credential(tenant.privateKey)
    except Exception as exc:
        logger.warning(
            "Cannot decrypt private key — skipping tenant",
            tenant_id=tenant.id,
            error=str(exc),
        )
        return

    installation_id = int(tenant.installationId)

    repos = session.execute(
        select(Repository).where(
            Repository.tenantId == tenant.id,
            Repository.enabled == True,  # noqa: E712
        )
    ).scalars().all()

    for repo in repos:
        jobs = session.execute(
            select(Job).where(
                Job.repositoryId == repo.id,
                Job.status == JobStatus.COMPLETED,
                Job.createdAt >= cutoff,
            )
        ).scalars().all()

        if not jobs:
            continue

        rollup = aggregate_repo_jobs(list(jobs))
        if rollup is None:
            continue  # All jobs were fast-pathed or have no drift score.

        summary["repos_processed"] += 1

        issue_url = post_rollup_issue(
            installation_id=installation_id,
            app_id=tenant.appId,
            private_key=private_key,
            repo_full_name=repo.name,
            rollup=rollup,
        )

        if issue_url:
            summary["issues_posted"] += 1
        else:
            summary["errors"] += 1


# ── Main entry point ──────────────────────────────────────────────────────────

def run_nightly_rollup(window_hours: int = 24) -> dict[str, Any]:
    """
    Main rollup entry point — called by the APScheduler cron at 02:00 UTC.

    Iterates over all credentialed tenants, finds repos with completed jobs
    inside the `window_hours` window, and posts one GitHub Issue per repo.

    Returns an observability summary dict (repos_processed, issues_posted,
    errors) suitable for logging and unit assertions.
    """
    cutoff = datetime.utcnow() - timedelta(hours=window_hours)
    summary: dict[str, Any] = {
        "repos_processed": 0,
        "issues_posted": 0,
        "errors": 0,
    }

    session = SessionLocal()
    try:
        # GTM-02: nightly rollup is a PRO+ feature; skip FREE tenants
        tenants = session.execute(
            select(Tenant).where(
                Tenant.installationId.isnot(None),
                Tenant.privateKey.isnot(None),
                Tenant.appId.isnot(None),
                Tenant.plan != "FREE",
            )
        ).scalars().all()

        for tenant in tenants:
            try:
                _process_tenant(session, tenant, cutoff, summary)
            except Exception as exc:
                logger.error(
                    "Rollup failed for tenant",
                    tenant_id=tenant.id,
                    error=str(exc),
                )
                summary["errors"] += 1
    finally:
        session.close()

    logger.info("Nightly rollup complete", **summary)
    return summary
