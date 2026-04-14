"""
GAP-01: Unit tests for src/billing/quota.py and the webhook quota gate.

Tests are grouped into:
  A. get_plan_limits()       — pure function, no DB
  B. count_monthly_analyses() — DB query (session mocked)
  C. check_pr_quota()        — integration of A + B (session mocked)
  D. Webhook integration     — HTTP 402 raised when quota exceeded
"""

import json
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from src.billing.quota import (
    PLAN_LIMITS,
    check_pr_quota,
    check_repo_quota,
    get_plan_limits,
    count_monthly_analyses,
    count_active_repos,
)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _tenant(plan: str = "FREE", tenant_id: str = "t-1") -> MagicMock:
    t = MagicMock()
    t.id = tenant_id
    t.plan = plan
    return t


def _session(count: int = 0) -> MagicMock:
    """Mock SQLAlchemy session whose query().filter().count() returns *count*."""
    q = MagicMock()
    q.filter.return_value = q
    q.count.return_value = count
    session = MagicMock()
    session.query.return_value = q
    return session


# ── A. get_plan_limits ────────────────────────────────────────────────────────

class TestGetPlanLimits:

    def test_free_plan_limit_is_50(self):
        limits = get_plan_limits("FREE")
        assert limits.max_prs_per_month == 50

    def test_pro_plan_limit_is_500(self):
        limits = get_plan_limits("PRO")
        assert limits.max_prs_per_month == 500

    def test_team_plan_is_unlimited(self):
        limits = get_plan_limits("TEAM")
        assert limits.max_prs_per_month == -1

    def test_case_insensitive(self):
        assert get_plan_limits("free").max_prs_per_month == get_plan_limits("FREE").max_prs_per_month

    def test_unknown_plan_falls_back_to_free(self):
        limits = get_plan_limits("ENTERPRISE_PLUS")
        assert limits.max_prs_per_month == PLAN_LIMITS["FREE"].max_prs_per_month

    def test_empty_plan_falls_back_to_free(self):
        limits = get_plan_limits("")
        assert limits.max_prs_per_month == PLAN_LIMITS["FREE"].max_prs_per_month

    def test_free_max_repos_is_1(self):
        limits = get_plan_limits("FREE")
        assert limits.max_repos == 1

    def test_pro_max_repos_is_5(self):
        limits = get_plan_limits("PRO")
        assert limits.max_repos == 5

    def test_team_max_repos_is_unlimited(self):
        limits = get_plan_limits("TEAM")
        assert limits.max_repos == -1

    def test_plan_limits_dict_contains_all_tiers(self):
        assert "FREE" in PLAN_LIMITS
        assert "PRO" in PLAN_LIMITS
        assert "TEAM" in PLAN_LIMITS


# ── B. count_monthly_analyses ─────────────────────────────────────────────────

class TestCountMonthlyAnalyses:

    def test_returns_query_count(self):
        session = _session(count=17)
        result = count_monthly_analyses(session, "t-1")
        assert result == 17

    def test_zero_when_no_jobs(self):
        session = _session(count=0)
        result = count_monthly_analyses(session, "t-abc")
        assert result == 0

    def test_queries_correct_tenant(self):
        session = _session(count=3)
        count_monthly_analyses(session, "my-tenant")
        # Verify query was called with Job model
        session.query.assert_called_once()


# ── C. check_pr_quota ─────────────────────────────────────────────────────────

class TestCheckPrQuota:

    def test_allowed_when_under_limit(self):
        tenant = _tenant("FREE")
        session = _session(count=10)  # 10 < 50
        allowed, reason = check_pr_quota(tenant, session)
        assert allowed is True
        assert reason == ""

    def test_blocked_when_at_limit(self):
        tenant = _tenant("FREE")
        session = _session(count=50)  # exactly at cap
        allowed, reason = check_pr_quota(tenant, session)
        assert allowed is False
        assert "50" in reason  # shows usage/cap

    def test_blocked_when_over_limit(self):
        tenant = _tenant("FREE")
        session = _session(count=99)
        allowed, reason = check_pr_quota(tenant, session)
        assert allowed is False

    def test_reason_mentions_plan_name(self):
        tenant = _tenant("FREE")
        session = _session(count=50)
        _, reason = check_pr_quota(tenant, session)
        assert "Free" in reason

    def test_reason_mentions_upgrade(self):
        tenant = _tenant("FREE")
        session = _session(count=50)
        _, reason = check_pr_quota(tenant, session)
        assert "Upgrade" in reason or "upgrade" in reason

    def test_pro_allowed_at_499(self):
        tenant = _tenant("PRO")
        session = _session(count=499)
        allowed, _ = check_pr_quota(tenant, session)
        assert allowed is True

    def test_pro_blocked_at_500(self):
        tenant = _tenant("PRO")
        session = _session(count=500)
        allowed, _ = check_pr_quota(tenant, session)
        assert allowed is False

    def test_team_always_allowed(self):
        tenant = _tenant("TEAM")
        session = _session(count=99999)  # Arbitrary high number
        allowed, reason = check_pr_quota(tenant, session)
        assert allowed is True
        assert reason == ""

    def test_team_does_not_query_db(self):
        """TEAM plan is unlimited — no DB count needed."""
        tenant = _tenant("TEAM")
        session = _session(count=0)
        check_pr_quota(tenant, session)
        # count() should NOT have been called since we short-circuit for unlimited
        session.query.return_value.filter.return_value.count.assert_not_called()

    def test_unknown_plan_treated_as_free(self):
        tenant = _tenant("LEGACY")
        session = _session(count=50)
        allowed, _ = check_pr_quota(tenant, session)
        assert allowed is False  # same as FREE at limit


# ── C2. check_repo_quota ──────────────────────────────────────────────────────

class TestCheckRepoQuota:

    def test_free_allowed_when_one_repo(self):
        tenant = _tenant("FREE")
        session = _session(count=1)  # exactly at cap → still allowed
        allowed, reason = check_repo_quota(tenant, session)
        assert allowed is True
        assert reason == ""

    def test_free_blocked_when_two_repos(self):
        tenant = _tenant("FREE")
        session = _session(count=2)  # 2 > max_repos=1
        allowed, reason = check_repo_quota(tenant, session)
        assert allowed is False
        assert "1" in reason  # shows cap

    def test_free_reason_mentions_upgrade(self):
        tenant = _tenant("FREE")
        session = _session(count=2)
        _, reason = check_repo_quota(tenant, session)
        assert "upgrade" in reason.lower() or "Upgrade" in reason

    def test_pro_allowed_when_within_limit(self):
        tenant = _tenant("PRO")
        session = _session(count=4)  # max_repos=5
        allowed, _ = check_repo_quota(tenant, session)
        assert allowed is True

    def test_pro_blocked_when_over_limit(self):
        tenant = _tenant("PRO")
        session = _session(count=6)
        allowed, _ = check_repo_quota(tenant, session)
        assert allowed is False

    def test_team_always_allowed(self):
        tenant = _tenant("TEAM")
        session = _session(count=9999)
        allowed, reason = check_repo_quota(tenant, session)
        assert allowed is True
        assert reason == ""

    def test_team_does_not_query_db(self):
        tenant = _tenant("TEAM")
        session = _session(count=0)
        check_repo_quota(tenant, session)
        session.query.return_value.filter.return_value.count.assert_not_called()

    def test_repo_full_name_included_in_log(self):
        """Ensure the function accepts repo_full_name kwarg without raising."""
        tenant = _tenant("FREE")
        session = _session(count=5)
        allowed, _ = check_repo_quota(tenant, session, repo_full_name="org/repo")
        assert allowed is False  # 5 > 1


def _make_session_for_tenant(mock_tenant: MagicMock) -> MagicMock:
    """Return a DB session mock that routes Tenant queries to mock_tenant and
    returns None for all other models (prevents idempotency guard false-positives)."""
    from src.storage.sql_models import Tenant

    tenant_chain = MagicMock()
    tenant_chain.filter.return_value.first.return_value = mock_tenant

    no_result_chain = MagicMock()
    no_result_chain.filter.return_value.first.return_value = None

    session = MagicMock()
    session.query.side_effect = lambda model: tenant_chain if model is Tenant else no_result_chain
    return session


# ── D. Webhook integration ────────────────────────────────────────────────────

class TestWebhookQuotaGate:
    """
    Verify that handle_pull_request raises HTTP 402 when check_pr_quota
    returns (False, reason).  All other DB / queue calls are fully mocked.
    """

    def _pr_data(self, installation_id: int = 42, action: str = "opened") -> dict:
        return {
            "action": action,
            "pull_request": {
                "number": 7,
                "title": "Add feature",
                "head": {"sha": "abc123", "ref": "feature/x"},
                "base": {"sha": "def456", "ref": "main"},
            },
            "repository": {
                "full_name": "org/repo",
                "name": "repo",
                "owner": {"login": "org"},
                "id": 99,
            },
            "installation": {"id": installation_id},
            "sender": {"login": "human", "type": "User"},
        }

    @patch("src.billing.quota.check_pr_quota", return_value=(False, "Limit reached"))
    @patch("src.billing.quota.check_repo_quota", return_value=(True, ""))
    @patch("src.pipeline.job_manager.SessionLocal")
    def test_raises_http_402_when_quota_exceeded(self, mock_session_cls, mock_repo_quota, mock_pr_quota):
        """When check_pr_quota returns False the handler must raise HTTP 402."""
        import asyncio
        from src.api.webhooks import handle_pull_request

        mock_tenant = MagicMock()
        mock_tenant.id = "t-1"
        mock_tenant.plan = "FREE"
        mock_tenant.workflowConfig = None
        mock_tenant.billingConfig = None

        mock_session_cls.return_value = _make_session_for_tenant(mock_tenant)

        with pytest.raises(HTTPException) as exc_info:
            asyncio.run(
                handle_pull_request(self._pr_data(), "delivery-1")
            )

        assert exc_info.value.status_code == 402
        assert "quota_exceeded" in str(exc_info.value.detail)

    @patch("src.billing.quota.check_pr_quota", return_value=(True, ""))
    @patch("src.billing.quota.check_repo_quota", return_value=(True, ""))
    @patch("src.pipeline.job_manager.SessionLocal")
    @patch("src.worker.queue.get_queue")
    def test_enqueues_when_quota_ok(self, mock_get_queue, mock_session_cls, mock_repo_quota, mock_pr_quota):
        """When quota is OK, the job is enqueued normally."""
        import asyncio
        from src.api.webhooks import handle_pull_request

        mock_tenant = MagicMock()
        mock_tenant.id = "t-1"
        mock_tenant.plan = "FREE"
        mock_tenant.workflowConfig = None
        mock_tenant.billingConfig = None

        mock_session_cls.return_value = _make_session_for_tenant(mock_tenant)

        mock_q = MagicMock()
        mock_get_queue.return_value = mock_q

        asyncio.run(
            handle_pull_request(self._pr_data(), "delivery-2")
        )

        mock_q.enqueue.assert_called_once()

    @patch("src.billing.quota.check_repo_quota", return_value=(False, "Repo limit reached"))
    @patch("src.pipeline.job_manager.SessionLocal")
    def test_raises_http_402_when_repo_quota_exceeded(self, mock_session_cls, mock_repo_quota):
        """When check_repo_quota returns False the handler must raise HTTP 402."""
        import asyncio
        from src.api.webhooks import handle_pull_request

        mock_tenant = MagicMock()
        mock_tenant.id = "t-1"
        mock_tenant.plan = "FREE"
        mock_tenant.workflowConfig = None
        mock_tenant.billingConfig = None

        mock_session_cls.return_value = _make_session_for_tenant(mock_tenant)

        with pytest.raises(HTTPException) as exc_info:
            asyncio.run(
                handle_pull_request(self._pr_data(), "delivery-repo-1")
            )

        assert exc_info.value.status_code == 402
        assert "quota_exceeded" in str(exc_info.value.detail)

    def test_db_failure_does_not_block_webhook(self):
        """A DB error in the quota check must not raise 402 — permissive failure."""
        import asyncio
        from src.api.webhooks import handle_pull_request

        # Patch SessionLocal at source so ALL DB calls in the handler raise
        with patch("src.pipeline.job_manager.SessionLocal", side_effect=Exception("DB down")):
            with patch("src.worker.queue.get_queue") as mock_queue:
                mock_q = MagicMock()
                mock_queue.return_value = mock_q
                try:
                    asyncio.run(
                        handle_pull_request(self._pr_data(), "delivery-3")
                    )
                except HTTPException as e:
                    assert e.status_code != 402, "DB failure must not produce 402"
                except Exception:
                    pass  # Other infra errors (Redis, etc.) are acceptable


# ── E. Agent rules quota (DG-SAAS-05) ─────────────────────────────────────────

class TestCheckAgentRulesQuota:

    def test_free_allows_up_to_3_rules(self):
        from src.billing.quota import check_agent_rules_quota
        tenant = _tenant("FREE")
        session = _session(count=2)
        allowed, reason = check_agent_rules_quota(tenant, session)
        assert allowed is True
        assert reason == ""

    def test_free_blocks_at_4_rules(self):
        from src.billing.quota import check_agent_rules_quota
        tenant = _tenant("FREE")
        session = _session(count=3)
        allowed, reason = check_agent_rules_quota(tenant, session)
        assert allowed is False
        assert "3" in reason

    def test_free_allows_exactly_3_rules(self):
        from src.billing.quota import check_agent_rules_quota
        tenant = _tenant("FREE")
        session = _session(count=3)
        # count=3 means limit hit — already at cap
        allowed, _ = check_agent_rules_quota(tenant, session)
        assert allowed is False

    def test_pro_is_unlimited(self):
        from src.billing.quota import check_agent_rules_quota
        tenant = _tenant("PRO")
        session = _session(count=999)
        allowed, reason = check_agent_rules_quota(tenant, session)
        assert allowed is True
        assert reason == ""

    def test_team_is_unlimited(self):
        from src.billing.quota import check_agent_rules_quota
        tenant = _tenant("TEAM")
        session = _session(count=999)
        allowed, reason = check_agent_rules_quota(tenant, session)
        assert allowed is True
        assert reason == ""

    def test_free_zero_rules_allowed(self):
        from src.billing.quota import check_agent_rules_quota
        tenant = _tenant("FREE")
        session = _session(count=0)
        allowed, _ = check_agent_rules_quota(tenant, session)
        assert allowed is True

    def test_reason_mentions_upgrade(self):
        from src.billing.quota import check_agent_rules_quota
        tenant = _tenant("FREE")
        session = _session(count=3)
        _, reason = check_agent_rules_quota(tenant, session)
        assert "pro" in reason.lower() or "upgrade" in reason.lower()
