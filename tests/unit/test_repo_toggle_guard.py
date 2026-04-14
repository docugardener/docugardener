"""
Repo Enable/Disable Toggle — webhook guard tests.

When a repository has enabled=False in the DB, handle_pull_request()
must skip enqueueing the analysis job and return status="skipped".

When enabled=True (or not found), normal processing proceeds.
"""

import pytest
from unittest.mock import MagicMock, patch

from src.api.webhooks import handle_pull_request


# ── Helpers ───────────────────────────────────────────────────────────────────

def _make_pr_payload(repo_name: str = "api", action: str = "opened") -> dict:
    return {
        "action": action,
        "installation": {"id": 12345},
        "sender": {"login": "alice"},
        "pull_request": {
            "number": 42,
            "title": "fix: bug",
            "base": {"sha": "base-sha", "ref": "main"},
            "head": {"sha": "head-sha"},
        },
        "repository": {
            "full_name": f"acme/{repo_name}",
            "name": repo_name,
            "owner": {"login": "acme"},
        },
    }


def _make_tenant(tenant_id: str = "t1") -> MagicMock:
    t = MagicMock()
    t.id = tenant_id
    t.workflowConfig = None
    return t


def _make_repo(enabled: bool) -> MagicMock:
    r = MagicMock()
    r.enabled = enabled
    r.name = "api"
    return r


def _db_session(tenant: MagicMock, repo: MagicMock | None) -> MagicMock:
    """
    Build a DB session that correctly routes queries by model class.

    Import the real model classes here so identity comparison works even though
    the code imports them inside the function body (they're the same objects in
    sys.modules).
    """
    from src.storage.sql_models import Repository, Tenant

    tenant_chain = MagicMock()
    tenant_chain.filter.return_value.first.return_value = tenant

    repo_chain = MagicMock()
    repo_chain.filter.return_value.first.return_value = repo

    no_result_chain = MagicMock()
    no_result_chain.filter.return_value.first.return_value = None

    session = MagicMock()

    def _query_dispatcher(model):
        if model is Tenant:
            return tenant_chain
        if model is Repository:
            return repo_chain
        return no_result_chain  # Job and any other model → no existing record

    session.query.side_effect = _query_dispatcher
    return session


def _make_queue(job_id: str = "job-1") -> MagicMock:
    q = MagicMock()
    q.enqueue.return_value = MagicMock(id=job_id)
    return q


# ── Tests ─────────────────────────────────────────────────────────────────────

class TestRepoToggleGuard:

    @pytest.mark.asyncio
    async def test_disabled_repo_skips_analysis(self):
        """
        When repo.enabled is False, the webhook must return status="skipped"
        and must not enqueue the analysis job.
        """
        tenant = _make_tenant()
        repo = _make_repo(enabled=False)
        db = _db_session(tenant, repo)
        mock_queue = _make_queue()

        with (
            patch("src.pipeline.job_manager.SessionLocal", return_value=db),

            patch("src.worker.queue.get_queue", return_value=mock_queue),
            patch("src.worker.jobs.analyze_pr_job", MagicMock()),
        ):
            result = await handle_pull_request(_make_pr_payload(), "d-1")

        assert result["status"] == "skipped"
        assert "paused" in result["reason"].lower() or "api" in result["reason"]
        mock_queue.enqueue.assert_not_called()

    @pytest.mark.asyncio
    async def test_enabled_repo_enqueues_analysis(self):
        """When repo.enabled is True, the job is enqueued normally."""
        tenant = _make_tenant()
        repo = _make_repo(enabled=True)
        db = _db_session(tenant, repo)
        mock_queue = _make_queue()

        with (
            patch("src.pipeline.job_manager.SessionLocal", return_value=db),

            patch("src.worker.queue.get_queue", return_value=mock_queue),
            patch("src.worker.jobs.analyze_pr_job", MagicMock()),
        ):
            result = await handle_pull_request(_make_pr_payload(), "d-2")

        assert result["status"] == "queued"

    @pytest.mark.asyncio
    async def test_unknown_repo_proceeds_normally(self):
        """
        If the repo is not found in the DB (first sync), no block is applied.
        """
        tenant = _make_tenant()
        db = _db_session(tenant, None)  # repo not found
        mock_queue = _make_queue()

        with (
            patch("src.pipeline.job_manager.SessionLocal", return_value=db),

            patch("src.worker.queue.get_queue", return_value=mock_queue),
            patch("src.worker.jobs.analyze_pr_job", MagicMock()),
        ):
            result = await handle_pull_request(_make_pr_payload(), "d-3")

        assert result["status"] == "queued"

    @pytest.mark.asyncio
    async def test_db_failure_on_repo_check_does_not_block(self):
        """DB errors in the repo guard must never block webhook processing."""
        mock_queue = _make_queue()

        with (
            patch(
                "src.pipeline.job_manager.SessionLocal",
                side_effect=RuntimeError("DB is down"),
            ),

            patch("src.worker.queue.get_queue", return_value=mock_queue),
            patch("src.worker.jobs.analyze_pr_job", MagicMock()),
        ):
            result = await handle_pull_request(_make_pr_payload(), "d-4")

        assert result["status"] == "queued"
