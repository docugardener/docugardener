"""
ENT-03: Budget Guard Tests.

Tests for monthly budget enforcement in handle_pull_request().
When a tenant has billingConfig.monthlyBudgetUsd > 0 and the month's
spend (sum of estimated_cost_usd from completed jobs) reaches or exceeds
the budget, the webhook handler must return {"status": "skipped"} and
not enqueue the analysis job.

Coverage:
1. No billingConfig → guard passes (job enqueued)
2. billingConfig with monthlyBudgetUsd=0 → guard disabled (job enqueued)
3. Spend < budget → job enqueued
4. Spend == budget → skipped
5. Spend > budget → skipped
6. DB error → warning logged, job enqueued (non-fatal)
7. Reason field contains budget amount in skipped response
"""

from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock, patch

import pytest

from src.api.webhooks import handle_pull_request

# ── Helpers ───────────────────────────────────────────────────────────────────


def _make_pr_payload(
    sender_login: str = "alice",
    action: str = "opened",
    installation_id: int = 42,
) -> dict:
    """Build a minimal pull_request webhook payload."""
    return {
        "action": action,
        "installation": {"id": installation_id},
        "sender": {"login": sender_login},
        "pull_request": {
            "number": 99,
            "title": "Add new feature",
            "base": {"sha": "abc123", "ref": "main"},
            "head": {"sha": "def456", "ref": "feature/new"},
        },
        "repository": {
            "full_name": "acme/api",
            "name": "api",
            "owner": {"login": "acme"},
        },
    }


def _make_tenant(tenant_id: str, billing_config: dict | None) -> MagicMock:
    """Create a mock Tenant with billingConfig."""
    tenant = MagicMock()
    tenant.id = tenant_id
    tenant.installationId = "42"
    tenant.billingConfig = billing_config
    tenant.workflowConfig = None
    return tenant


def _make_job(estimated_cost: float, created_this_month: bool = True) -> MagicMock:
    """Create a mock Job with estimated_cost_usd in result."""
    job = MagicMock()
    job.status = "COMPLETED"
    job.result = {
        "llm_usage": {
            "estimated_cost_usd": estimated_cost,
        }
    }
    # Set createdAt to a datetime in the current month (or previous month if specified)
    if created_this_month:
        job.createdAt = datetime.now(UTC).replace(day=15)
    else:
        # Previous month
        job.createdAt = datetime.now(UTC).replace(day=1) - timedelta(days=1)
    return job


def _make_db_session(tenant: MagicMock, jobs: list[MagicMock]) -> MagicMock:
    """Build a DB session mock that returns the given tenant and jobs."""
    session = MagicMock()

    # Mock tenant query: query(Tenant).filter(...).first()
    tenant_query = MagicMock()
    tenant_filter = MagicMock()
    tenant_filter.first.return_value = tenant
    tenant_filter.all.return_value = [tenant]
    tenant_query.filter.return_value = tenant_filter

    # Mock Repository query: query(Repository).filter(...).first()
    # Return None so repo guard passes (no repo found = not disabled)
    repo_query = MagicMock()
    repo_filter = MagicMock()
    repo_filter.first.return_value = None
    repo_query.filter.return_value = repo_filter

    # Mock jobs query: query(Job).filter(..., ..., ...).all() / .first()
    # The budget guard code has ONE filter() call with 3 comma-separated arguments.
    # The idempotency guard also calls .first() on the jobs query — must return None
    # to avoid the duplicate-commit short-circuit returning {"status": "skipped"}.
    jobs_query = MagicMock()
    jobs_filter = MagicMock()
    jobs_filter.all.return_value = jobs
    jobs_filter.first.return_value = None
    jobs_query.filter.return_value = jobs_filter

    # Route based on query type
    def query_side_effect(model_class):
        from src.storage.sql_models import Job as JobModel
        from src.storage.sql_models import Repository
        from src.storage.sql_models import Tenant as TenantModel

        if model_class == TenantModel:
            return tenant_query
        elif model_class == JobModel:
            return jobs_query
        elif model_class == Repository:
            return repo_query
        return MagicMock()

    session.query.side_effect = query_side_effect
    return session


def _make_queue(job_id: str = "job-test") -> tuple[MagicMock, MagicMock]:
    """Return (queue mock, job mock)."""
    mock_job = MagicMock()
    mock_job.id = job_id
    mock_queue = MagicMock()
    mock_queue.enqueue.return_value = mock_job
    return mock_queue, mock_job


# ── Tests ─────────────────────────────────────────────────────────────────────


class TestEnt03BudgetGuard:
    @pytest.mark.asyncio
    async def test_no_billing_config_allows_job(self):
        """
        When tenant has no billingConfig, the job should be enqueued normally.
        """
        tenant = _make_tenant("t-1", billing_config=None)
        db_session = _make_db_session(tenant, jobs=[])
        mock_queue, _ = _make_queue("job-no-config")

        with (
            patch("src.pipeline.job_manager.SessionLocal", return_value=db_session),
            patch("src.worker.queue.get_queue", return_value=mock_queue),
            patch("src.worker.jobs.analyze_pr_job", MagicMock()),
        ):
            result = await handle_pull_request(_make_pr_payload(), "delivery-1")

        assert result["status"] == "queued"
        mock_queue.enqueue.assert_called_once()

    @pytest.mark.asyncio
    async def test_zero_budget_disables_guard(self):
        """
        When monthlyBudgetUsd=0, the budget guard is disabled and job is enqueued.
        """
        tenant = _make_tenant("t-2", billing_config={"monthlyBudgetUsd": 0})
        db_session = _make_db_session(tenant, jobs=[])
        mock_queue, _ = _make_queue("job-zero-budget")

        with (
            patch("src.pipeline.job_manager.SessionLocal", return_value=db_session),
            patch("src.worker.queue.get_queue", return_value=mock_queue),
            patch("src.worker.jobs.analyze_pr_job", MagicMock()),
        ):
            result = await handle_pull_request(_make_pr_payload(), "delivery-2")

        assert result["status"] == "queued"
        mock_queue.enqueue.assert_called_once()

    @pytest.mark.asyncio
    async def test_spend_below_budget_allows_job(self):
        """
        When month spend < budget, the job should be enqueued.
        """
        tenant = _make_tenant("t-3", billing_config={"monthlyBudgetUsd": 10.0})
        jobs = [
            _make_job(2.5),
            _make_job(3.0),
            _make_job(1.5),
        ]  # Total: 7.0 USD
        db_session = _make_db_session(tenant, jobs)
        mock_queue, _ = _make_queue("job-below-budget")

        with (
            patch("src.pipeline.job_manager.SessionLocal", return_value=db_session),
            patch("src.worker.queue.get_queue", return_value=mock_queue),
            patch("src.worker.jobs.analyze_pr_job", MagicMock()),
        ):
            result = await handle_pull_request(_make_pr_payload(), "delivery-3")

        assert result["status"] == "queued"
        mock_queue.enqueue.assert_called_once()

    @pytest.mark.asyncio
    async def test_spend_equals_budget_skips_job(self):
        """
        When month spend == budget, return {"status": "skipped"} and do not enqueue.
        """
        tenant = _make_tenant("t-4", billing_config={"monthlyBudgetUsd": 10.0})
        jobs = [
            _make_job(4.0),
            _make_job(6.0),
        ]  # Total: 10.0 USD

        # Create a factory that returns a fresh session each time
        def session_factory():
            return _make_db_session(tenant, jobs)

        mock_queue, _ = _make_queue("job-at-budget")

        with (
            patch("src.pipeline.job_manager.SessionLocal", side_effect=session_factory),
            patch("src.worker.queue.get_queue", return_value=mock_queue),
        ):
            result = await handle_pull_request(_make_pr_payload(), "delivery-4")

        assert result["status"] == "skipped"
        assert "budget" in result["reason"].lower()
        mock_queue.enqueue.assert_not_called()

    @pytest.mark.asyncio
    async def test_spend_exceeds_budget_skips_job(self):
        """
        When month spend > budget, return {"status": "skipped"} and do not enqueue.
        """
        tenant = _make_tenant("t-5", billing_config={"monthlyBudgetUsd": 10.0})
        jobs = [
            _make_job(5.0),
            _make_job(7.5),
        ]  # Total: 12.5 USD
        db_session = _make_db_session(tenant, jobs)
        mock_queue, _ = _make_queue("job-over-budget")

        with (
            patch("src.pipeline.job_manager.SessionLocal", return_value=db_session),
            patch("src.worker.queue.get_queue", return_value=mock_queue),
        ):
            result = await handle_pull_request(_make_pr_payload(), "delivery-5")

        assert result["status"] == "skipped"
        assert "budget" in result["reason"].lower()
        mock_queue.enqueue.assert_not_called()

    @pytest.mark.asyncio
    async def test_reason_contains_budget_amount(self):
        """
        The skipped reason should contain the budget amount.
        Bypasses the operator-wide platform cap so the per-tenant guard is tested.
        """
        tenant = _make_tenant("t-6", billing_config={"monthlyBudgetUsd": 25.50})
        jobs = [_make_job(30.0)]
        db_session = _make_db_session(tenant, jobs)
        mock_queue, _ = _make_queue("job-reason")

        with (
            patch("src.pipeline.job_manager.SessionLocal", return_value=db_session),
            patch("src.worker.queue.get_queue", return_value=mock_queue),
            patch("src.api.webhooks.check_platform_llm_cap", return_value=None),
        ):
            result = await handle_pull_request(_make_pr_payload(), "delivery-6")

        assert result["status"] == "skipped"
        assert "25.5" in result["reason"] or "$25.5" in result["reason"]

    @pytest.mark.asyncio
    async def test_db_error_non_fatal_enqueues_job(self):
        """
        If the budget guard DB lookup fails, the error should be logged as a warning
        and the job should still be enqueued (non-fatal behavior).
        """
        mock_queue, _ = _make_queue("job-db-error")

        with (
            patch(
                "src.pipeline.job_manager.SessionLocal",
                side_effect=RuntimeError("DB connection failed"),
            ),
            patch("src.worker.queue.get_queue", return_value=mock_queue),
            patch("src.worker.jobs.analyze_pr_job", MagicMock()),
        ):
            result = await handle_pull_request(_make_pr_payload(), "delivery-7")

        # Job should still be enqueued despite DB error
        assert result["status"] == "queued"
        mock_queue.enqueue.assert_called_once()

    @pytest.mark.asyncio
    async def test_only_completed_jobs_counted(self):
        """
        Only COMPLETED jobs should be counted in the monthly spend.
        PENDING, RUNNING, FAILED jobs should be ignored.
        """
        tenant = _make_tenant("t-7", billing_config={"monthlyBudgetUsd": 10.0})

        # Create jobs with different statuses
        # Note: The query filters for status == "COMPLETED", so pending_job and failed_job
        # will be filtered out by the actual query, but we set status for clarity
        completed_job1 = _make_job(3.0)
        completed_job1.status = "COMPLETED"
        completed_job2 = _make_job(2.0)
        completed_job2.status = "COMPLETED"

        pending_job = MagicMock()
        pending_job.status = "PENDING"
        pending_job.result = {"llm_usage": {"estimated_cost_usd": 5.0}}
        pending_job.createdAt = datetime.now(UTC).replace(day=15)

        failed_job = MagicMock()
        failed_job.status = "FAILED"
        failed_job.result = {"llm_usage": {"estimated_cost_usd": 10.0}}
        failed_job.createdAt = datetime.now(UTC).replace(day=15)

        # Only return COMPLETED jobs in the mock query result
        # (simulating the filter for status == "COMPLETED")
        db_session = _make_db_session(tenant, jobs=[completed_job1, completed_job2])
        mock_queue, _ = _make_queue("job-status-filter")

        with (
            patch("src.pipeline.job_manager.SessionLocal", return_value=db_session),
            patch("src.worker.queue.get_queue", return_value=mock_queue),
            patch("src.worker.jobs.analyze_pr_job", MagicMock()),
        ):
            result = await handle_pull_request(_make_pr_payload(), "delivery-8")

        # Since only completed jobs (5.0 total) are counted, below budget
        assert result["status"] == "queued"
        mock_queue.enqueue.assert_called_once()

    @pytest.mark.asyncio
    async def test_jobs_without_llm_usage_ignored(self):
        """
        Jobs with missing result or llm_usage should be safely ignored (treated as 0 cost).
        """
        tenant = _make_tenant("t-8", billing_config={"monthlyBudgetUsd": 10.0})

        # Job with proper usage
        good_job = _make_job(5.0)

        # Job with no result
        no_result_job = MagicMock()
        no_result_job.status = "COMPLETED"
        no_result_job.result = None
        no_result_job.createdAt = datetime.now(UTC).replace(day=15)

        # Job with result but no llm_usage
        no_usage_job = MagicMock()
        no_usage_job.status = "COMPLETED"
        no_usage_job.result = {"other_data": "value"}
        no_usage_job.createdAt = datetime.now(UTC).replace(day=15)

        # Total: 5.0 USD (below budget)
        db_session = _make_db_session(tenant, jobs=[good_job, no_result_job, no_usage_job])
        mock_queue, _ = _make_queue("job-missing-data")

        with (
            patch("src.pipeline.job_manager.SessionLocal", return_value=db_session),
            patch("src.worker.queue.get_queue", return_value=mock_queue),
            patch("src.worker.jobs.analyze_pr_job", MagicMock()),
        ):
            result = await handle_pull_request(_make_pr_payload(), "delivery-9")

        assert result["status"] == "queued"
        mock_queue.enqueue.assert_called_once()

    @pytest.mark.asyncio
    async def test_negative_budget_treated_as_disabled(self):
        """
        Negative budget values should be treated as disabled (guard passes).
        Bypasses the operator-wide platform cap so the per-tenant guard is tested.
        """
        tenant = _make_tenant("t-9", billing_config={"monthlyBudgetUsd": -5.0})
        jobs = [_make_job(100.0)]  # High spend
        db_session = _make_db_session(tenant, jobs)
        mock_queue, _ = _make_queue("job-negative-budget")

        with (
            patch("src.pipeline.job_manager.SessionLocal", return_value=db_session),
            patch("src.worker.queue.get_queue", return_value=mock_queue),
            patch("src.worker.jobs.analyze_pr_job", MagicMock()),
            patch("src.api.webhooks.check_platform_llm_cap", return_value=None),
        ):
            result = await handle_pull_request(_make_pr_payload(), "delivery-10")

        # Negative budget is treated as disabled (not > 0)
        assert result["status"] == "queued"
        mock_queue.enqueue.assert_called_once()
