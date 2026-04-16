# SPDX-License-Identifier: AGPL-3.0-or-later
"""Unit tests for PH15-01 — operator-wide platform LLM monthly cap.

Tests verify that:
- The cap blocks ALL tenants (not just FREE) when operator spend >= cap
- BYOK tenants are exempt from cap enforcement and not counted
- PLATFORM_LLM_MONTHLY_CAP_EUR=0 disables enforcement entirely
- usedPlatformLlm is stamped correctly on BudgetJob records

Imports from ``src.api._platform_cap`` (the implementation module) which is
re-exported from ``src.api.webhooks`` via PH15-01.  Tests also verify the
re-export path so callers can import from either location.
"""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import MagicMock

# ---------------------------------------------------------------------------
# Helpers / fixtures
# ---------------------------------------------------------------------------


def _make_budget_job(
    status: str = "COMPLETED",
    cost_usd: float = 0.0,
    used_platform_llm: bool = True,
    created_at: datetime | None = None,
) -> MagicMock:
    """Return a mock _BudgetJob ORM row."""
    job = MagicMock()
    job.status = status
    job.usedPlatformLlm = used_platform_llm
    job.createdAt = created_at or datetime.now(UTC)
    job.result = {"llm_usage": {"estimated_cost_usd": cost_usd}}
    return job


def _make_settings(
    cap_eur: float = 10.0,
    bundled_gemini_key: str = "fake-bundled-key",
) -> MagicMock:
    s = MagicMock()
    s.platform_llm_monthly_cap_eur = cap_eur
    s.bundled_gemini_key = bundled_gemini_key
    return s


def _build_db_mock(platform_jobs: list) -> MagicMock:
    """Build a mock DB session whose .query().filter().all() returns platform_jobs."""
    filter_mock = MagicMock()
    filter_mock.all.return_value = platform_jobs
    query_mock = MagicMock()
    query_mock.filter.return_value = filter_mock
    db = MagicMock()
    db.query.return_value = query_mock
    return db


# ---------------------------------------------------------------------------
# Import the production functions under test
# ---------------------------------------------------------------------------

# Primary import path — implementation module
from src.api._platform_cap import check_platform_llm_cap, stamp_platform_llm_flag  # noqa: E402

# ---------------------------------------------------------------------------
# Test 1 — cap blocks when operator-wide spend >= cap
# ---------------------------------------------------------------------------


class TestCapBlocksWhenExceeded:
    def test_cap_blocks_when_exceeded(self):
        """Operator spend >= €10 → returns skipped response with 'budget' in reason."""
        # €10 cap; spend: 9.26 USD × 1.08 = €10.0008 — just over cap
        platform_jobs = [_make_budget_job(cost_usd=9.26)]
        db = _build_db_mock(platform_jobs)
        settings = _make_settings(cap_eur=10.0)

        result = check_platform_llm_cap(db=db, settings=settings, llm_cfg={})

        assert result is not None, "Expected cap to block but got None"
        assert result.get("status") == "skipped"
        assert "budget" in result.get("reason", "").lower()


# ---------------------------------------------------------------------------
# Test 2 — cap allows when under budget
# ---------------------------------------------------------------------------


class TestCapAllowsWhenUnder:
    def test_cap_allows_when_under(self):
        """Operator spend < €10 → returns None (processing should continue)."""
        platform_jobs = [_make_budget_job(cost_usd=1.0)]  # €1.08 — well under cap
        db = _build_db_mock(platform_jobs)
        settings = _make_settings(cap_eur=10.0)

        result = check_platform_llm_cap(db=db, settings=settings, llm_cfg={})

        assert result is None, f"Expected None (allow) but got: {result}"


# ---------------------------------------------------------------------------
# Test 3 — BYOK tenant not counted and not blocked
# ---------------------------------------------------------------------------


class TestByokTenantNotCounted:
    def test_byok_tenant_not_counted(self):
        """Tenant with own apiKey is not blocked regardless of platform spend."""
        platform_jobs = [_make_budget_job(cost_usd=100.0)]
        db = _build_db_mock(platform_jobs)
        settings = _make_settings(cap_eur=10.0)
        llm_cfg_with_own_key = {"apiKey": "tenant-own-key"}

        result = check_platform_llm_cap(db=db, settings=settings, llm_cfg=llm_cfg_with_own_key)

        assert result is None, "BYOK tenant should not be blocked by platform cap"

    def test_byok_with_base_url_not_counted(self):
        """Tenant with custom baseUrl (Ollama etc.) is also exempt."""
        platform_jobs = [_make_budget_job(cost_usd=100.0)]
        db = _build_db_mock(platform_jobs)
        settings = _make_settings(cap_eur=10.0)
        llm_cfg_with_base_url = {"baseUrl": "http://ollama.internal"}

        result = check_platform_llm_cap(db=db, settings=settings, llm_cfg=llm_cfg_with_base_url)

        assert result is None, "Tenant with custom baseUrl should not be blocked by platform cap"


# ---------------------------------------------------------------------------
# Test 4 — cap=0 disables enforcement
# ---------------------------------------------------------------------------


class TestCapZeroDisablesEnforcement:
    def test_cap_zero_disables_enforcement(self):
        """PLATFORM_LLM_MONTHLY_CAP_EUR=0 → no blocking regardless of spend."""
        platform_jobs = [_make_budget_job(cost_usd=9999.0)]
        db = _build_db_mock(platform_jobs)
        settings = _make_settings(cap_eur=0.0)

        result = check_platform_llm_cap(db=db, settings=settings, llm_cfg={})

        assert result is None, "cap=0 should disable enforcement"


# ---------------------------------------------------------------------------
# Test 5 — PRO/TEAM plans also blocked (operator-wide, plan-agnostic)
# ---------------------------------------------------------------------------


class TestProTeamPlanAlsoBlocked:
    def test_pro_team_plan_also_blocked(self):
        """
        The operator-wide cap is plan-agnostic.
        A PRO/TEAM tenant with no own apiKey is blocked equally.
        The cap function checks only llm_cfg for apiKey/baseUrl,
        never the tenant's billing plan.
        """
        platform_jobs = [_make_budget_job(cost_usd=9.26)]
        db = _build_db_mock(platform_jobs)
        settings = _make_settings(cap_eur=10.0)
        # No apiKey in llm_cfg → uses platform LLM, plan does not matter
        llm_cfg_no_own_key: dict = {}

        result = check_platform_llm_cap(db=db, settings=settings, llm_cfg=llm_cfg_no_own_key)

        assert result is not None, "PRO/TEAM tenant without own key should be blocked"
        assert result.get("status") == "skipped"
        assert "budget" in result.get("reason", "").lower()


# ---------------------------------------------------------------------------
# Test 6 — usedPlatformLlm flag stamped True when bundled key used
# ---------------------------------------------------------------------------


class TestUsedPlatformLlmFlagStampedTrue:
    def test_used_platform_llm_flag_stamped_true(self):
        """When bundled key is in use, stamp_platform_llm_flag sets flag=True."""
        job = MagicMock()
        job.usedPlatformLlm = None
        db = MagicMock()
        settings = _make_settings(bundled_gemini_key="fake-bundled-key")
        llm_cfg: dict = {}  # no own key → platform LLM

        stamp_platform_llm_flag(job=job, db=db, settings=settings, llm_cfg=llm_cfg)

        assert job.usedPlatformLlm is True
        db.commit.assert_called_once()


# ---------------------------------------------------------------------------
# Test 7 — usedPlatformLlm flag stamped False for BYOK
# ---------------------------------------------------------------------------


class TestUsedPlatformLlmFlagStampedFalseForByok:
    def test_used_platform_llm_flag_stamped_false_for_byok(self):
        """When tenant has own apiKey, flag is set to False."""
        job = MagicMock()
        job.usedPlatformLlm = None
        db = MagicMock()
        settings = _make_settings(bundled_gemini_key="fake-bundled-key")
        llm_cfg = {"apiKey": "tenant-own-key"}

        stamp_platform_llm_flag(job=job, db=db, settings=settings, llm_cfg=llm_cfg)

        assert job.usedPlatformLlm is False
        db.commit.assert_called_once()


# ---------------------------------------------------------------------------
# Re-export verification — webhooks.py must expose these names (PH15-01)
# ---------------------------------------------------------------------------


class TestWebhooksReExport:
    def test_check_platform_llm_cap_importable_from_webhooks(self):
        """check_platform_llm_cap must be importable from src.api.webhooks."""
        from src.api import webhooks  # noqa: PLC0415

        assert hasattr(webhooks, "check_platform_llm_cap"), (
            "src.api.webhooks must expose check_platform_llm_cap "
            "(add: from src.api._platform_cap import check_platform_llm_cap)"
        )

    def test_stamp_platform_llm_flag_importable_from_webhooks(self):
        """stamp_platform_llm_flag must be importable from src.api.webhooks."""
        from src.api import webhooks  # noqa: PLC0415

        assert hasattr(webhooks, "stamp_platform_llm_flag"), (
            "src.api.webhooks must expose stamp_platform_llm_flag "
            "(add: from src.api._platform_cap import stamp_platform_llm_flag)"
        )
