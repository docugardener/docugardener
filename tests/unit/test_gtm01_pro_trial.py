"""
GTM-01: Unit tests for PRO Trial logic in src/billing/quota.py.

Groups:
  A. is_trial_active()    — pure function, no DB
  B. check_pr_quota()     — trial tenants treated as PRO
  C. check_repo_quota()   — trial tenants treated as PRO
"""

from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock

from src.billing.quota import (
    PLAN_LIMITS,
    check_pr_quota,
    check_repo_quota,
    is_trial_active,
)

# ── Helpers ───────────────────────────────────────────────────────────────────


def _tenant(
    plan: str = "FREE",
    tenant_id: str = "t-1",
    trial_expires_at=None,
) -> MagicMock:
    t = MagicMock()
    t.id = tenant_id
    t.plan = plan
    t.trialExpiresAt = trial_expires_at
    return t


def _session(count: int = 0) -> MagicMock:
    """Mock SQLAlchemy session whose query().filter().count() returns *count*."""
    q = MagicMock()
    q.filter.return_value = q
    q.filter_by.return_value = q
    q.in_.return_value = q
    q.count.return_value = count
    session = MagicMock()
    session.query.return_value = q
    return session


def _future(days: float = 7.0) -> datetime:
    return datetime.now(UTC) + timedelta(days=days)


def _past(days: float = 7.0) -> datetime:
    return datetime.now(UTC) - timedelta(days=days)


# ── A. is_trial_active ────────────────────────────────────────────────────────


class TestIsTrialActive:
    def test_no_trial_set_returns_false(self):
        tenant = _tenant(trial_expires_at=None)
        assert is_trial_active(tenant) is False

    def test_future_expiry_returns_true(self):
        tenant = _tenant(trial_expires_at=_future(7))
        assert is_trial_active(tenant) is True

    def test_past_expiry_returns_false(self):
        tenant = _tenant(trial_expires_at=_past(1))
        assert is_trial_active(tenant) is False

    def test_exactly_expired_returns_false(self):
        """A trial expiring 1 second ago is inactive."""
        tenant = _tenant(trial_expires_at=_past(1 / 86400))
        assert is_trial_active(tenant) is False

    def test_naive_datetime_future_returns_true(self):
        """Naive (no tzinfo) future datetime should still be treated as active."""
        naive_future = datetime.utcnow() + timedelta(days=5)
        tenant = _tenant(trial_expires_at=naive_future)
        assert is_trial_active(tenant) is True

    def test_naive_datetime_past_returns_false(self):
        naive_past = datetime.utcnow() - timedelta(days=1)
        tenant = _tenant(trial_expires_at=naive_past)
        assert is_trial_active(tenant) is False

    def test_missing_attribute_returns_false(self):
        """Tenant without trialExpiresAt attr (legacy row) returns False gracefully."""
        tenant = MagicMock(spec=["id", "plan"])
        # spec ensures trialExpiresAt is not accessible, so getattr returns default
        assert is_trial_active(tenant) is False


# ── B. check_pr_quota with trial ──────────────────────────────────────────────


class TestCheckPrQuotaWithTrial:
    def test_active_trial_allows_pro_quota(self):
        """AC-2: A FREE tenant with an active trial gets PRO PR quota (500/mo)."""
        pro_limit = PLAN_LIMITS["PRO"].max_prs_per_month  # 500
        # Just under the PRO limit but way over the FREE limit (50)
        tenant = _tenant(plan="FREE", trial_expires_at=_future(7))
        session = _session(count=51)  # 51 > FREE limit of 50
        allowed, reason = check_pr_quota(tenant, session)
        assert allowed is True
        assert reason == ""

    def test_expired_trial_reverts_to_free_quota(self):
        """AC-6: After trial expires, FREE quota (50/mo) applies again."""
        tenant = _tenant(plan="FREE", trial_expires_at=_past(1))
        session = _session(count=51)  # Over FREE limit
        allowed, reason = check_pr_quota(tenant, session)
        assert allowed is False
        assert "50" in reason  # FREE limit visible in reason

    def test_active_trial_blocks_over_pro_limit(self):
        """Trial tenant is still blocked if they exceed PRO quota (500)."""
        tenant = _tenant(plan="FREE", trial_expires_at=_future(7))
        session = _session(count=501)  # Over PRO limit of 500
        allowed, reason = check_pr_quota(tenant, session)
        assert allowed is False
        assert "500" in reason

    def test_no_trial_free_tenant_blocked_at_50(self):
        """Control: standard FREE tenant with no trial blocked at 50."""
        tenant = _tenant(plan="FREE", trial_expires_at=None)
        session = _session(count=50)
        allowed, reason = check_pr_quota(tenant, session)
        assert allowed is False

    def test_pro_plan_unaffected_by_trial_field(self):
        """PRO tenant with trial field still uses PRO quota normally."""
        tenant = _tenant(plan="PRO", trial_expires_at=_future(7))
        session = _session(count=499)  # Under PRO limit
        allowed, reason = check_pr_quota(tenant, session)
        assert allowed is True


# ── C. check_repo_quota with trial ───────────────────────────────────────────


class TestCheckRepoQuotaWithTrial:
    def test_active_trial_allows_pro_repo_limit(self):
        """AC-2: Trial tenant gets PRO repo limit (5) instead of FREE (1)."""
        tenant = _tenant(plan="FREE", trial_expires_at=_future(7))
        # Simulate 3 active repos — over FREE limit of 1, under PRO limit of 5
        session_mock = MagicMock()
        q = MagicMock()
        session_mock.query.return_value = q
        q.filter.return_value = q
        q.count.return_value = 3

        allowed, reason = check_repo_quota(tenant, session_mock)
        assert allowed is True

    def test_expired_trial_reverts_to_free_repo_limit(self):
        """After trial expires, FREE repo limit (1) applies."""
        tenant = _tenant(plan="FREE", trial_expires_at=_past(1))
        session_mock = MagicMock()
        q = MagicMock()
        session_mock.query.return_value = q
        q.filter.return_value = q
        q.count.return_value = 3  # Over FREE limit of 1

        allowed, reason = check_repo_quota(tenant, session_mock)
        assert allowed is False
