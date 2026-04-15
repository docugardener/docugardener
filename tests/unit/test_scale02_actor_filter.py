"""
SCALE-02: Tests for actor-aware thresholding (bot/ignored actor filtering).

When a PR is opened by an actor listed in workflowConfig.ignoredActors,
handle_pull_request() must:
  - skip enqueueing the analysis job
  - return {"status": "skipped", "reason": "Actor '...' is in the ignoredActors list"}

When the actor is NOT ignored, the existing enqueue flow proceeds normally.

Patching notes: the production code does `from src.pipeline.job_manager import SessionLocal`
and `from src.storage.sql_models import Tenant` *inside the function body*, so we must
patch these at their source modules for the patches to take effect.
"""

from unittest.mock import MagicMock, patch

import pytest

from src.api.webhooks import handle_pull_request

# ── Helpers ───────────────────────────────────────────────────────────────────


def _make_pr_payload(sender_login: str = "dependabot[bot]", action: str = "opened") -> dict:
    """Build a minimal pull_request webhook payload."""
    return {
        "action": action,
        "installation": {"id": 12345},
        "sender": {"login": sender_login},
        "pull_request": {
            "number": 99,
            "title": "Bump lodash from 4.17.20 to 4.17.21",
            "base": {"sha": "abc123", "ref": "main"},
            "head": {"sha": "def456"},
        },
        "repository": {
            "full_name": "acme/api",
            "name": "api",
            "owner": {"login": "acme"},
        },
    }


def _make_tenant(workflow_config: dict | None) -> MagicMock:
    t = MagicMock()
    t.workflowConfig = workflow_config
    return t


def _make_db_session(tenant: MagicMock) -> MagicMock:
    """Build a DB session mock that returns the given tenant for Tenant queries,
    and None for all other model queries (prevents idempotency guard false-positives)."""
    from src.storage.sql_models import Tenant

    tenant_chain = MagicMock()
    tenant_chain.filter.return_value.first.return_value = tenant

    no_result_chain = MagicMock()
    no_result_chain.filter.return_value.first.return_value = None

    session = MagicMock()
    session.query.side_effect = lambda model: tenant_chain if model is Tenant else no_result_chain
    return session


def _make_queue(job_id: str = "job-test") -> tuple[MagicMock, MagicMock]:
    """Return (get_queue mock, enqueue result mock)."""
    mock_job = MagicMock()
    mock_job.id = job_id
    mock_queue = MagicMock()
    mock_queue.enqueue.return_value = mock_job
    return mock_queue, mock_job


# ── Tests ─────────────────────────────────────────────────────────────────────


class TestScale02ActorFilter:
    @pytest.mark.asyncio
    async def test_ignored_actor_skips_analysis(self):
        """
        When the PR sender is listed in workflowConfig.ignoredActors,
        the job must NOT be enqueued and status "skipped" is returned.
        """
        tenant = _make_tenant({"ignoredActors": ["dependabot[bot]", "renovate[bot]"]})
        db_session = _make_db_session(tenant)
        mock_queue, _ = _make_queue()

        with (
            patch("src.pipeline.job_manager.SessionLocal", return_value=db_session),
            patch("src.worker.queue.get_queue", return_value=mock_queue),
        ):
            result = await handle_pull_request(_make_pr_payload("dependabot[bot]"), "delivery-1")

        assert result["status"] == "skipped"
        assert "dependabot[bot]" in result["reason"]
        mock_queue.enqueue.assert_not_called()

    @pytest.mark.asyncio
    async def test_non_ignored_actor_enqueues_job(self):
        """
        A human developer not in ignoredActors must proceed to job enqueue.
        """
        tenant = _make_tenant({"ignoredActors": ["dependabot[bot]"]})
        db_session = _make_db_session(tenant)
        mock_queue, _ = _make_queue("job-xyz")

        with (
            patch("src.pipeline.job_manager.SessionLocal", return_value=db_session),
            patch("src.worker.queue.get_queue", return_value=mock_queue),
            patch("src.worker.jobs.analyze_pr_job", MagicMock()),
        ):
            result = await handle_pull_request(_make_pr_payload("alice"), "delivery-2")

        assert result["status"] == "queued"
        mock_queue.enqueue.assert_called_once()

    @pytest.mark.asyncio
    async def test_no_workflow_config_allows_all_actors(self):
        """
        When workflowConfig is NULL, no actors are filtered — job is enqueued.
        """
        tenant = _make_tenant(None)
        db_session = _make_db_session(tenant)
        mock_queue, _ = _make_queue("job-null-cfg")

        with (
            patch("src.pipeline.job_manager.SessionLocal", return_value=db_session),
            patch("src.worker.queue.get_queue", return_value=mock_queue),
            patch("src.worker.jobs.analyze_pr_job", MagicMock()),
        ):
            result = await handle_pull_request(_make_pr_payload("dependabot[bot]"), "delivery-3")

        assert result["status"] == "queued"

    @pytest.mark.asyncio
    async def test_empty_ignored_actors_list_allows_all(self):
        """workflowConfig.ignoredActors = [] means no actors are skipped."""
        tenant = _make_tenant({"ignoredActors": []})
        db_session = _make_db_session(tenant)
        mock_queue, _ = _make_queue("job-empty-list")

        with (
            patch("src.pipeline.job_manager.SessionLocal", return_value=db_session),
            patch("src.worker.queue.get_queue", return_value=mock_queue),
            patch("src.worker.jobs.analyze_pr_job", MagicMock()),
        ):
            result = await handle_pull_request(_make_pr_payload("dependabot[bot]"), "delivery-4")

        assert result["status"] == "queued"

    @pytest.mark.asyncio
    async def test_db_failure_does_not_block_webhook(self):
        """
        If the DB lookup for workflowConfig raises, the webhook must still
        enqueue the job — actor filtering is best-effort, never blocking.
        """
        mock_queue, _ = _make_queue("job-db-fail")

        with (
            patch(
                "src.pipeline.job_manager.SessionLocal",
                side_effect=RuntimeError("DB connection failed"),
            ),
            patch("src.worker.queue.get_queue", return_value=mock_queue),
            patch("src.worker.jobs.analyze_pr_job", MagicMock()),
        ):
            result = await handle_pull_request(_make_pr_payload("dependabot[bot]"), "delivery-5")

        assert result["status"] == "queued"

    @pytest.mark.asyncio
    async def test_ignored_actor_case_sensitive(self):
        """
        Actor matching is case-sensitive (GitHub logins are case-sensitive).
        "Dependabot[bot]" (title-case) must NOT be filtered for "dependabot[bot]".
        """
        tenant = _make_tenant({"ignoredActors": ["dependabot[bot]"]})
        db_session = _make_db_session(tenant)
        mock_queue, _ = _make_queue("job-case")

        with (
            patch("src.pipeline.job_manager.SessionLocal", return_value=db_session),
            patch("src.worker.queue.get_queue", return_value=mock_queue),
            patch("src.worker.jobs.analyze_pr_job", MagicMock()),
        ):
            result = await handle_pull_request(_make_pr_payload("Dependabot[bot]"), "delivery-6")

        # "Dependabot[bot]" ≠ "dependabot[bot]" — must NOT skip
        assert result["status"] == "queued"
