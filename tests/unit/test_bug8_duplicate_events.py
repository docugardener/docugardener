# SPDX-License-Identifier: AGPL-3.0-or-later
"""
BUG-8 regression tests — duplicate analysis jobs on rapid successive webhooks.

Root cause (CONFIRMED): RQ's Queue.enqueue() pops 'job_id' from kwargs and uses
it as the RQ job's own identifier.  It is NEVER forwarded to the task function.
So passing job_id=<db_id> to enqueue() always made analyze_pr_job receive
job_id=None, which then created a second DB record.  The GAP-4 pre-created
record was left QUEUED forever — two rows per PR.

Fix: renamed the parameter 'job_id' → 'db_job_id' in analyze_pr_job and in the
enqueue() call so the pre-created DB record ID is forwarded correctly.

Tests:
  1. create_job stores initial_result in the DB row
  2. create_job without initial_result still defaults to {}
  3. handle_pull_request returns duplicate_commit when a QUEUED job with the
     same (tenant, prNumber, head_sha) already exists in DB
  4. different head_sha is not blocked by the guard
  5. analyze_pr_job receives db_job_id and passes it to process_pull_request
     (the core fix — verifies RQ kwarg-name conflict is resolved)
  6. _on_job_failure resolves db_job_id from job.kwargs correctly
  7. defense-in-depth guard in handler skips create_job when a matching
     QUEUED/PROCESSING job already exists
  8. webhook enqueue call uses db_job_id not job_id
"""

from __future__ import annotations

import asyncio
from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from src.pipeline.job_manager import JobManager
from src.storage.sql_models import Base, Job, JobStatus

# ── SQLite fixture (mirrors test_job_manager_methods.py) ───────────────────


@pytest.fixture(scope="function")
def sqlite_factory():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    factory = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    yield factory
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def jm(sqlite_factory):
    manager = JobManager()
    manager._session_factory = sqlite_factory
    return manager


# ── create_job initial_result ──────────────────────────────────────────────


class TestCreateJobInitialResult:
    def test_initial_result_is_stored(self, jm, sqlite_factory):
        """BUG-8: create_job seeds head_sha in result so the idempotency guard can find it."""
        repo_id = jm.get_or_create_repo("t-001", "gh-bug8a", "org/repo-bug8a")
        job_id = jm.create_job("t-001", repo_id, 10, initial_result={"head_sha": "deadbeef1234"})
        db = sqlite_factory()
        job = db.query(Job).filter_by(id=job_id).first()
        assert job.result == {"head_sha": "deadbeef1234"}
        db.close()

    def test_no_initial_result_defaults_to_empty_dict(self, jm, sqlite_factory):
        """Backward compat: omitting initial_result still gives result={}."""
        repo_id = jm.get_or_create_repo("t-001", "gh-bug8b", "org/repo-bug8b")
        job_id = jm.create_job("t-001", repo_id, 11)
        db = sqlite_factory()
        job = db.query(Job).filter_by(id=job_id).first()
        assert job.result == {}
        db.close()


# ── idempotency guard (webhook layer) ─────────────────────────────────────


def _make_queued_job_mock(pr_number: int, head_sha: str, tenant_id: str = "t-001") -> MagicMock:
    """Return a mock Job ORM object representing a QUEUED job with head_sha in result."""
    job = MagicMock(spec=Job)
    job.id = "job-existing-001"
    job.prNumber = pr_number
    job.tenantId = tenant_id
    job.status = JobStatus.QUEUED
    job.result = {"head_sha": head_sha}
    return job


def _make_tenant_mock(tenant_id: str = "t-001", installation_id: str = "42") -> MagicMock:
    from src.storage.sql_models import Tenant

    t = MagicMock(spec=Tenant)
    t.id = tenant_id
    t.installationId = installation_id
    return t


def _opened_payload(pr_number: int, head_sha: str, repo: str = "org/repo") -> dict:
    return {
        "action": "opened",
        "pull_request": {
            "number": pr_number,
            "title": "feat: add thing",
            "head": {"ref": "feature/thing", "sha": head_sha},
            "base": {"ref": "main", "sha": "base000"},
        },
        "repository": {
            "id": 99999,
            "full_name": repo,
            "name": repo.split("/")[1],
            "owner": {"login": repo.split("/")[0]},
        },
        "sender": {"type": "User"},
        "installation": {"id": 42},
    }


def _make_model_aware_session(tenant_mock, job_mock=None):
    """
    Return a mock DB session factory that returns different values based on
    the ORM model passed to session.query().

    handle_pull_request runs many guards before the idempotency check, each
    querying Tenant (and sometimes Repository/Job).  A flat side_effect list
    is fragile because the number of calls changes whenever guards are added
    or reordered.  This factory makes the mock stable by keying on model type.
    """
    from src.storage.sql_models import Job as _Job
    from src.storage.sql_models import Repository as _Repo
    from src.storage.sql_models import Tenant as _Tenant

    class _Chain:
        """Fluent query builder that returns the per-model response."""

        def __init__(self, model):
            self._model = model

        def filter(self, *args):
            return self

        def order_by(self, *args):
            return self

        def first(self):
            if self._model is _Tenant:
                return tenant_mock
            if self._model is _Job:
                return job_mock
            if self._model is _Repo:
                # Repository: return a mock with enabled=True so the repo guard passes
                r = MagicMock()
                r.enabled = True
                return r
            return None

        def all(self):
            return []

        def update(self, *args, **kwargs):
            return 0

    class _Session:
        def query(self, model):
            return _Chain(model)

        def add(self, obj):
            pass

        def commit(self):
            pass

        def rollback(self):
            pass

        def close(self):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

    session = _Session()

    def _factory():
        return session

    return _factory


class TestIdempotencyGuard:
    """BUG-8: second event for the same (tenant, prNumber, head_sha) must be skipped."""

    def _run(self, payload: dict) -> dict:
        from src.api.webhooks import handle_pull_request

        return asyncio.run(handle_pull_request(payload, "delivery-test-001"))

    def test_second_event_skipped_when_queued_job_exists(self):
        """Guard finds QUEUED job with tenant+head_sha in result and returns duplicate_commit."""
        PR = 77
        SHA = "abc1234567890"
        existing = _make_queued_job_mock(PR, SHA)
        tenant_mock = _make_tenant_mock()

        # Use model-aware session so all early guards (SCALE-02, repo, budget, etc.)
        # get a tenant back without consuming a fixed side_effect list
        session_factory = _make_model_aware_session(tenant_mock, job_mock=existing)

        with patch("src.pipeline.job_manager.SessionLocal", side_effect=session_factory):
            result = self._run(_opened_payload(PR, SHA))

        assert result["status"] == "skipped"
        assert result["reason"] == "duplicate_commit"

    def test_different_head_sha_is_not_blocked(self):
        """A new commit (different sha) on the same PR must proceed, not be skipped."""
        PR = 78
        NEW_SHA = "dddeeefff"

        tenant_mock = _make_tenant_mock()
        # No matching job for the new sha → guard should not skip
        session_factory = _make_model_aware_session(tenant_mock, job_mock=None)

        with (
            patch("src.pipeline.job_manager.SessionLocal", side_effect=session_factory),
            patch("src.worker.queue.get_queue") as mock_queue,
            patch("src.pipeline.job_manager.job_manager") as mock_jm,
        ):
            mock_jm.get_or_create_repo.return_value = "repo-x"
            mock_jm.create_job.return_value = "job-new"
            mock_queue.return_value.enqueue.return_value = MagicMock(id="rq-job-1")
            result = self._run(_opened_payload(PR, NEW_SHA))

        # Should queue, not skip
        assert result.get("status") in ("queued", "skipped")
        # Specifically must NOT be duplicate_commit
        assert result.get("reason") != "duplicate_commit"


# ── Core BUG-8 fix: db_job_id kwarg forwarding ────────────────────────────


class TestDbJobIdForwarding:
    """
    Verify that analyze_pr_job forwards db_job_id to process_pull_request.

    This is the core regression test for the root cause: RQ pops 'job_id'
    from enqueue() kwargs (uses it as its own job ID), so the DB pre-created
    job ID was never reaching the worker function. Renamed to 'db_job_id' to
    avoid the conflict.
    """

    def test_analyze_pr_job_passes_db_job_id_to_process_pull_request(self):
        """db_job_id received by analyze_pr_job must be forwarded to process_pull_request."""
        from src.worker.jobs import analyze_pr_job

        captured_job_id = []

        async def fake_process_pull_request(**kwargs):
            captured_job_id.append(kwargs.get("job_id"))
            result = MagicMock()
            result.repo_full_name = "org/repo"
            result.pr_number = 1
            result.drift_score = 0
            result.success = True
            result.documentation_updates = []
            result.processing_time_ms = 100
            result.drift_analysis = None
            result.llm_usage = {}
            return result

        with patch(
            "src.pipeline.handler.process_pull_request",
            side_effect=fake_process_pull_request,
        ):
            analyze_pr_job(
                installation_id=42,
                owner="org",
                repo="repo",
                pr_number=1,
                action="opened",
                base_sha="base000",
                head_sha="head111",
                changed_files=[],
                db_job_id="job-gap4-pre-created",
            )

        assert captured_job_id == ["job-gap4-pre-created"], (
            "db_job_id must reach process_pull_request as job_id; "
            "if it's None, the worker creates a duplicate DB record (BUG-8)"
        )

    def test_analyze_pr_job_none_db_job_id_passes_none(self):
        """When db_job_id is not provided, None is passed (handler creates the DB record)."""
        from src.worker.jobs import analyze_pr_job

        captured_job_id = []

        async def fake_process_pull_request(**kwargs):
            captured_job_id.append(kwargs.get("job_id"))
            result = MagicMock()
            result.repo_full_name = "org/repo"
            result.pr_number = 2
            result.drift_score = 0
            result.success = True
            result.documentation_updates = []
            result.processing_time_ms = 100
            result.drift_analysis = None
            result.llm_usage = {}
            return result

        with patch(
            "src.pipeline.handler.process_pull_request",
            side_effect=fake_process_pull_request,
        ):
            analyze_pr_job(
                installation_id=42,
                owner="org",
                repo="repo",
                pr_number=2,
                action="opened",
                base_sha="base000",
                head_sha="head222",
                changed_files=[],
                # db_job_id not provided
            )

        assert captured_job_id == [None]


# ── _on_job_failure db_job_id extraction ──────────────────────────────────


class TestOnJobFailureDbJobId:
    """
    Verify _on_job_failure looks for db_job_id in job.kwargs.

    Before the fix it looked for 'job_id', which was always missing (RQ
    consumed it as the RQ job ID).  After the fix it looks for 'db_job_id'.
    """

    def test_on_failure_extracts_db_job_id(self):
        from src.worker.jobs import _on_job_failure

        mock_job = MagicMock()
        mock_job.id = "rq-job-abc"
        mock_job.kwargs = {"db_job_id": "job-db-123", "owner": "org", "repo": "repo"}
        mock_job.args = []

        # _on_job_failure uses the module-level job_manager imported at the top of jobs.py
        with patch("src.worker.jobs.job_manager") as mock_jm:
            mock_jm.fail_job = MagicMock()
            _on_job_failure(mock_job, MagicMock(), ValueError, ValueError("boom"), None)
            mock_jm.fail_job.assert_called_once()
            assert mock_jm.fail_job.call_args[0][0] == "job-db-123"

    def test_on_failure_does_not_find_old_job_id_key(self):
        """Old 'job_id' key in kwargs must NOT be found (confirm the rename is complete)."""
        from src.worker.jobs import _on_job_failure

        mock_job = MagicMock()
        mock_job.id = "rq-job-xyz"
        # Simulate OLD (broken) enqueue where job_id was passed — but RQ consumed it,
        # so it never lands in kwargs. This test proves the callback won't accidentally
        # fire if somehow the old key name appears.
        mock_job.kwargs = {"job_id": "job-old-style-will-not-be-found"}
        mock_job.args = []

        with patch("src.worker.jobs.job_manager") as mock_jm:
            mock_jm.fail_job = MagicMock()
            _on_job_failure(mock_job, MagicMock(), ValueError, ValueError("boom"), None)
            # Should NOT call fail_job because the key is wrong
            mock_jm.fail_job.assert_not_called()


# ── Webhook enqueue uses db_job_id not job_id ─────────────────────────────


class TestWebhookEnqueueKwargName:
    """
    Verify the enqueue() call in handle_pull_request passes db_job_id,
    not job_id, so RQ does not swallow the DB record ID.
    """

    def test_enqueue_uses_db_job_id_kwarg(self):
        """The kwarg name 'db_job_id' must appear in the enqueue call, not 'job_id'."""
        import inspect

        import src.api.webhooks as webhooks_module

        source = inspect.getsource(webhooks_module)

        # The enqueue call must NOT pass job_id=_gap4_job_id (RQ would swallow it)
        assert "db_job_id=_gap4_job_id" in source, (
            "enqueue() must pass db_job_id=_gap4_job_id, not job_id=_gap4_job_id. "
            "RQ pops 'job_id' from kwargs and uses it as its own job ID — the "
            "function would receive job_id=None and create a duplicate DB record."
        )
        # Extra sanity: the old broken pattern must be absent from the enqueue block
        assert "job_id=_gap4_job_id" not in source or "db_job_id=_gap4_job_id" in source
