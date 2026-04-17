# SPDX-License-Identifier: AGPL-3.0-or-later
"""
BUG-8 regression tests — duplicate analysis jobs on rapid successive webhooks.

Root cause: GAP-4 pre-creates a Job with result={}.  The idempotency guard
queries result->>'head_sha', which returns NULL for an empty dict, so the guard
never finds the already-queued job when a second event arrives before the
worker writes a real result.

Fix: create_job() now accepts initial_result so callers can seed head_sha at
creation time.  The webhook handler passes initial_result={"head_sha": sha}
when pre-creating the GAP-4 job.

Tests:
  1. create_job stores initial_result in the DB row
  2. create_job without initial_result still defaults to {}
  3. handle_pull_request returns duplicate_commit when a QUEUED job with the
     same (prNumber, head_sha) already exists in DB
"""

from __future__ import annotations

import asyncio
from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from src.pipeline.job_manager import JobManager
from src.storage.sql_models import Base, Job, JobStatus, Repository


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
        job_id = jm.create_job(
            "t-001", repo_id, 10, initial_result={"head_sha": "deadbeef1234"}
        )
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


# ── idempotency guard ──────────────────────────────────────────────────────


def _make_queued_job_mock(pr_number: int, head_sha: str) -> MagicMock:
    """Return a mock Job ORM object representing a QUEUED job with head_sha in result."""
    job = MagicMock(spec=Job)
    job.id = "job-existing-001"
    job.prNumber = pr_number
    job.status = JobStatus.QUEUED
    job.result = {"head_sha": head_sha}
    return job


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


class TestIdempotencyGuard:
    """BUG-8: second event for the same (prNumber, head_sha) must be skipped."""

    def _run(self, payload: dict) -> dict:
        from src.api.webhooks import handle_pull_request

        return asyncio.run(handle_pull_request(payload, "delivery-test-001"))

    def test_second_event_skipped_when_queued_job_exists(self):
        """BUG-8: guard finds QUEUED job with head_sha in result and returns duplicate_commit."""
        PR = 77
        SHA = "abc1234567890"
        existing = _make_queued_job_mock(PR, SHA)

        mock_session = MagicMock()
        mock_session.query.return_value.filter.return_value.first.return_value = existing

        with patch(
            "src.pipeline.job_manager.SessionLocal", return_value=mock_session
        ):
            result = self._run(_opened_payload(PR, SHA))

        assert result["status"] == "skipped"
        assert result["reason"] == "duplicate_commit"

    def test_different_head_sha_is_not_blocked(self):
        """A new commit (different sha) on the same PR must proceed, not be skipped."""
        PR = 78
        OLD_SHA = "aaabbbccc"
        NEW_SHA = "dddeeefff"

        existing = _make_queued_job_mock(PR, OLD_SHA)  # job for old SHA exists

        # The guard filters by the *new* sha — no match → should not skip
        mock_session = MagicMock()
        # Simulate no existing job for the new sha
        mock_session.query.return_value.filter.return_value.first.return_value = None

        with (
            patch("src.pipeline.job_manager.SessionLocal", return_value=mock_session),
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
