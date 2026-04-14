# SPDX-License-Identifier: AGPL-3.0-or-later
"""
GAP-01: Tier quota enforcement.

Defines per-plan PR analysis limits and provides a single function,
`check_pr_quota`, that queries the DB and returns whether the tenant
is allowed to run another analysis this calendar month.

Design rules:
- Never raises — DB errors produce (True, "") so the webhook is not blocked
  by transient infra problems.  Log the error instead.
- All limit logic is in one place (PLAN_LIMITS) so pricing changes
  require touching only this file.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from src.core.logging import get_logger

if TYPE_CHECKING:
    from sqlalchemy.orm import Session
    from src.storage.sql_models import Tenant

logger = get_logger(__name__)


# ── Plan limits ───────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class PlanLimits:
    """Quota caps for one pricing tier."""
    max_prs_per_month: int   # -1 = unlimited
    max_repos: int           # -1 = unlimited
    plan_display: str


# -1 means unlimited.
PLAN_LIMITS: dict[str, PlanLimits] = {
    "FREE": PlanLimits(
        max_prs_per_month=50,
        max_repos=1,
        plan_display="Free",
    ),
    "PRO": PlanLimits(
        max_prs_per_month=500,
        max_repos=5,
        plan_display="Pro",
    ),
    "TEAM": PlanLimits(
        max_prs_per_month=-1,
        max_repos=-1,
        plan_display="Team",
    ),
}

# Fallback when `tenant.plan` is unknown (treat as FREE).
_DEFAULT_LIMITS = PLAN_LIMITS["FREE"]


# ── Public API ────────────────────────────────────────────────────────────────

def is_trial_active(tenant: "Tenant") -> bool:
    """
    GTM-01: Return True if the tenant has an active PRO trial (not yet expired).
    Handles missing attribute and non-datetime values gracefully.
    """
    expires = getattr(tenant, "trialExpiresAt", None)
    if not isinstance(expires, datetime):
        return False
    if expires.tzinfo is None:
        # Naive datetime — compare against naive UTC now
        return datetime.utcnow() < expires
    return datetime.now(timezone.utc) < expires


def get_plan_limits(plan: str, server_pr_limit: int = 0) -> PlanLimits:
    """Return limits for *plan*, preferring server-controlled PR limit (GAP-03).

    If *server_pr_limit* != 0, it overrides the hardcoded max_prs_per_month.
    -1 means unlimited (TEAM plan behaviour).  Repo limits are always local.
    """
    base = PLAN_LIMITS.get(plan.upper() if plan else "", _DEFAULT_LIMITS)
    if server_pr_limit != 0:
        return PlanLimits(
            max_prs_per_month=server_pr_limit,
            max_repos=base.max_repos,
            plan_display=base.plan_display,
        )
    return base


def count_monthly_analyses(session: "Session", tenant_id: str) -> int:
    """
    Count QUEUED + PROCESSING + COMPLETED jobs for *tenant_id* in the current
    calendar month (UTC).  FAILED jobs are excluded — they did not consume
    a meaningful analysis slot.
    """
    from src.storage.sql_models import Job, JobStatus

    month_start = datetime.now(timezone.utc).replace(
        day=1, hour=0, minute=0, second=0, microsecond=0
    )
    return (
        session.query(Job)
        .filter(
            Job.tenantId == tenant_id,
            Job.status.in_([
                JobStatus.QUEUED,
                JobStatus.PROCESSING,
                JobStatus.COMPLETED,
            ]),
            Job.createdAt >= month_start,
        )
        .count()
    )


def count_active_repos(session: "Session", tenant_id: str) -> int:
    """Count repositories stored for *tenant_id*."""
    from src.storage.sql_models import Repository

    return session.query(Repository).filter(Repository.tenantId == tenant_id).count()



def check_repo_quota(
    tenant: "Tenant",
    session: "Session",
    *,
    repo_full_name: str = "",
) -> tuple[bool, str]:
    """
    Check whether *tenant* may process a webhook for a given repository.

    Returns:
        (True, "")          — quota OK, proceed
        (False, reason_str) — repo limit exceeded; reason_str is user-facing
    """
    # GTM-01: active trial is treated as PRO for quota purposes
    effective_plan = "PRO" if is_trial_active(tenant) else tenant.plan
    # GAP-03: repo limits are local-only; server OU limit applies to PR quota only
    limits = get_plan_limits(effective_plan)

    if limits.max_repos == -1:
        return True, ""  # Unlimited plan

    active_repos = count_active_repos(session, tenant.id)

    if active_repos > limits.max_repos:
        reason = (
            f"Repository limit reached ({active_repos}/{limits.max_repos}) on the "
            f"{limits.plan_display} plan. Only {limits.max_repos} repo(s) may be monitored. "
            f"Upgrade your plan to add more."
        )
        logger.warning(
            "GAP-01: Repo quota exceeded",
            tenant_id=tenant.id,
            plan=tenant.plan,
            active_repos=active_repos,
            cap=limits.max_repos,
            repo=repo_full_name,
        )
        return False, reason

    return True, ""


# Agent rules quota: FREE=3, PRO/TEAM=unlimited
AGENT_RULES_LIMIT_FREE = 3


def count_agent_rules(session: "Session", tenant_id: str) -> int:
    """Count RulesArtifact records for *tenant_id*."""
    from src.storage.sql_models import RulesArtifact
    return session.query(RulesArtifact).filter(RulesArtifact.tenantId == tenant_id).count()


def check_agent_rules_quota(
    tenant: "Tenant",
    session: "Session",
) -> tuple[bool, str]:
    """Check whether *tenant* may create another agent rules artifact.

    FREE plan is capped at AGENT_RULES_LIMIT_FREE (3).
    PRO and TEAM are unlimited (-1).

    Returns:
        (True, "")          — quota OK, proceed
        (False, reason_str) — quota exceeded; reason_str is user-facing
    """
    effective_plan = "PRO" if is_trial_active(tenant) else tenant.plan

    if effective_plan in ("PRO", "TEAM"):
        return True, ""

    used = count_agent_rules(session, tenant.id)

    if used >= AGENT_RULES_LIMIT_FREE:
        reason = (
            f"Agent rules limit reached ({used}/{AGENT_RULES_LIMIT_FREE}) on the Free plan. "
            f"Upgrade to Pro for unlimited rule sets."
        )
        logger.warning(
            "DG-SAAS-05: Agent rules quota exceeded",
            tenant_id=tenant.id,
            plan=tenant.plan,
            used=used,
            cap=AGENT_RULES_LIMIT_FREE,
        )
        return False, reason

    return True, ""


def check_pr_quota(
    tenant: "Tenant",
    session: "Session",
) -> tuple[bool, str]:
    """
    Check whether *tenant* may run another PR analysis this month.

    Returns:
        (True, "")          — quota OK, proceed
        (False, reason_str) — quota exceeded; reason_str is user-facing
    """
    # GTM-01: active trial is treated as PRO for quota purposes
    effective_plan = "PRO" if is_trial_active(tenant) else tenant.plan
    # GAP-03: prefer server-controlled PR limit from PlatformCloud validation response
    limits = get_plan_limits(effective_plan, server_pr_limit=0)

    if limits.max_prs_per_month == -1:
        return True, ""  # Unlimited plan

    used = count_monthly_analyses(session, tenant.id)
    cap = limits.max_prs_per_month

    if used >= cap:
        reason = (
            f"Monthly PR analysis limit reached ({used}/{cap}) on the "
            f"{limits.plan_display} plan. Upgrade your plan or wait until "
            f"next month."
        )
        logger.warning(
            "GAP-01: PR quota exceeded",
            tenant_id=tenant.id,
            plan=tenant.plan,
            used=used,
            cap=cap,
        )
        return False, reason

    return True, ""
