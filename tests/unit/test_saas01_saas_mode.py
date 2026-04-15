"""
DG-SAAS-01: Verify quota.py uses local PLAN_LIMITS in saas mode.

Note: get_connector() and CloudConnector have been removed (PC-free build).
Tests for the connector singleton have been dropped accordingly.
"""

from __future__ import annotations

# ── Quota — local fallback ─────────────────────────────────────────────────────


class TestQuotaLocalFallback:
    """quota.py must use local PLAN_LIMITS (server_pr_limit=0 means local fallback)."""

    def test_get_plan_limits_free_uses_local_50(self):
        from src.billing.quota import get_plan_limits

        limits = get_plan_limits("FREE", server_pr_limit=0)
        assert limits.max_prs_per_month == 50

    def test_get_plan_limits_pro_uses_local_500(self):
        from src.billing.quota import get_plan_limits

        limits = get_plan_limits("PRO", server_pr_limit=0)
        assert limits.max_prs_per_month == 500

    def test_get_plan_limits_team_is_unlimited(self):
        from src.billing.quota import get_plan_limits

        limits = get_plan_limits("TEAM", server_pr_limit=0)
        assert limits.max_prs_per_month == -1

    def test_get_plan_limits_free_max_repos_is_1(self):
        from src.billing.quota import get_plan_limits

        limits = get_plan_limits("FREE", server_pr_limit=0)
        assert limits.max_repos == 1

    def test_get_plan_limits_pro_max_repos_is_5(self):
        from src.billing.quota import get_plan_limits

        limits = get_plan_limits("PRO", server_pr_limit=0)
        assert limits.max_repos == 5

    def test_get_plan_limits_team_repos_unlimited(self):
        from src.billing.quota import get_plan_limits

        limits = get_plan_limits("TEAM", server_pr_limit=0)
        assert limits.max_repos == -1


# ── PLAN_LIMITS matches DG-SAAS-02 canonical table ────────────────────────────


class TestPlanLimitsCanonical:
    """PLAN_LIMITS values must match the DG-SAAS-02 plan structure exactly."""

    def test_free_pr_limit_is_50(self):
        from src.billing.quota import PLAN_LIMITS

        assert PLAN_LIMITS["FREE"].max_prs_per_month == 50

    def test_pro_pr_limit_is_500(self):
        from src.billing.quota import PLAN_LIMITS

        assert PLAN_LIMITS["PRO"].max_prs_per_month == 500

    def test_team_pr_limit_is_unlimited(self):
        from src.billing.quota import PLAN_LIMITS

        assert PLAN_LIMITS["TEAM"].max_prs_per_month == -1

    def test_free_repo_limit_is_1(self):
        from src.billing.quota import PLAN_LIMITS

        assert PLAN_LIMITS["FREE"].max_repos == 1

    def test_pro_repo_limit_is_5(self):
        from src.billing.quota import PLAN_LIMITS

        assert PLAN_LIMITS["PRO"].max_repos == 5

    def test_team_repo_limit_is_unlimited(self):
        from src.billing.quota import PLAN_LIMITS

        assert PLAN_LIMITS["TEAM"].max_repos == -1
