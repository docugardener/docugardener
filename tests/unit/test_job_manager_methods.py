# SPDX-License-Identifier: AGPL-3.0-or-later
"""
Unit tests for JobManager methods using an in-memory SQLite DB.

Covers get_or_create_repo, create_job, update_status, fail_job, patch_result
without requiring a real Postgres connection.
"""

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from src.pipeline.job_manager import JobManager
from src.storage.sql_models import Base, Job, JobStatus, Repository, Tenant

# ── SQLite fixture ─────────────────────────────────────────────────────────────


@pytest.fixture(scope="function")
def sqlite_factory():
    """Return a sessionmaker backed by an in-memory SQLite DB."""
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
    """JobManager wired to the SQLite test DB."""
    manager = JobManager()
    manager._session_factory = sqlite_factory
    return manager


@pytest.fixture
def tenant(sqlite_factory):
    """Insert a minimal Tenant row and return it."""
    db = sqlite_factory()
    t = Tenant(id="t-001", name="Test Org", githubOrgId="12345")
    db.add(t)
    db.commit()
    db.close()
    return t


# ── get_or_create_repo ────────────────────────────────────────────────────────


class TestGetOrCreateRepo:
    def test_creates_repo_on_first_call(self, jm, sqlite_factory):
        repo_id = jm.get_or_create_repo("t-001", "repo-gh-1", "org/repo")
        assert repo_id.startswith("repo-")
        db = sqlite_factory()
        repo = db.query(Repository).filter_by(id=repo_id).first()
        assert repo is not None
        assert repo.name == "org/repo"
        db.close()

    def test_returns_existing_repo_on_second_call(self, jm):
        r1 = jm.get_or_create_repo("t-001", "repo-gh-2", "org/repo2")
        r2 = jm.get_or_create_repo("t-001", "repo-gh-2", "org/repo2")
        assert r1 == r2


# ── create_job ────────────────────────────────────────────────────────────────


class TestCreateJob:
    def test_creates_job_in_queued_state(self, jm, sqlite_factory):
        repo_id = jm.get_or_create_repo("t-001", "repo-gh-3", "org/repo3")
        job_id = jm.create_job("t-001", repo_id, 42)
        assert job_id.startswith("job-")
        db = sqlite_factory()
        job = db.query(Job).filter_by(id=job_id).first()
        assert job is not None
        assert job.status == JobStatus.QUEUED
        assert job.prNumber == 42
        db.close()


# ── update_status ─────────────────────────────────────────────────────────────


class TestUpdateStatus:
    def _make_job(self, jm, sqlite_factory) -> str:
        repo_id = jm.get_or_create_repo("t-001", "repo-gh-4", "org/repo4")
        return jm.create_job("t-001", repo_id, 10)

    def test_update_to_processing(self, jm, sqlite_factory):
        job_id = self._make_job(jm, sqlite_factory)
        jm.update_status(job_id, JobStatus.PROCESSING)
        db = sqlite_factory()
        job = db.query(Job).filter_by(id=job_id).first()
        assert job.status == JobStatus.PROCESSING
        assert job.startedAt is not None
        db.close()

    def test_update_to_completed_with_result(self, jm, sqlite_factory):
        job_id = self._make_job(jm, sqlite_factory)
        jm.update_status(job_id, JobStatus.COMPLETED, result={"drift_score": 42})
        db = sqlite_factory()
        job = db.query(Job).filter_by(id=job_id).first()
        assert job.status == JobStatus.COMPLETED
        assert job.result == {"drift_score": 42}
        assert job.completedAt is not None
        db.close()


# ── fail_job ──────────────────────────────────────────────────────────────────


class TestFailJob:
    def test_fail_preserves_existing_result(self, jm, sqlite_factory):
        repo_id = jm.get_or_create_repo("t-001", "repo-gh-5", "org/repo5")
        job_id = jm.create_job("t-001", repo_id, 7)
        # Set some result first
        jm.update_status(job_id, JobStatus.PROCESSING)
        jm.update_status(job_id, JobStatus.COMPLETED, result={"drift_score": 55})
        # Now fail it (unusual but tests the merge logic)
        jm.fail_job(job_id, "something went wrong")
        db = sqlite_factory()
        job = db.query(Job).filter_by(id=job_id).first()
        assert job.status == JobStatus.FAILED
        assert job.result["error"] == "something went wrong"
        assert job.result["drift_score"] == 55  # preserved
        db.close()

    def test_fail_job_with_no_prior_result(self, jm, sqlite_factory):
        repo_id = jm.get_or_create_repo("t-001", "repo-gh-6", "org/repo6")
        job_id = jm.create_job("t-001", repo_id, 8)
        jm.fail_job(job_id, "init error")
        db = sqlite_factory()
        job = db.query(Job).filter_by(id=job_id).first()
        assert job.status == JobStatus.FAILED
        assert job.result["error"] == "init error"
        db.close()

    # BUG-4 regression tests

    def test_fail_job_sets_fix_pr_failed_triage_status(self, jm, sqlite_factory):
        """BUG-4: fail_job with triage_status='FIX_PR_FAILED' must stamp the triage status."""
        from src.storage.sql_models import TriageStatus

        repo_id = jm.get_or_create_repo("t-001", "repo-gh-bug4a", "org/repo-bug4a")
        job_id = jm.create_job("t-001", repo_id, 11)
        # Simulate user accepted triage — set to ACCEPTED first
        db = sqlite_factory()
        job = db.query(Job).filter_by(id=job_id).first()
        job.triageStatus = TriageStatus.ACCEPTED
        db.commit()
        db.close()

        jm.fail_job(job_id, "push failed", triage_status="FIX_PR_FAILED")

        db = sqlite_factory()
        job = db.query(Job).filter_by(id=job_id).first()
        assert job.status == JobStatus.FAILED
        assert job.triageStatus == TriageStatus.FIX_PR_FAILED
        assert job.result["error"] == "push failed"
        db.close()

    def test_fail_job_without_triage_status_leaves_it_unchanged(self, jm, sqlite_factory):
        """BUG-4: fail_job without triage_status must NOT touch the existing triage status."""
        from src.storage.sql_models import TriageStatus

        repo_id = jm.get_or_create_repo("t-001", "repo-gh-bug4b", "org/repo-bug4b")
        job_id = jm.create_job("t-001", repo_id, 12)

        jm.fail_job(job_id, "analysis error")

        db = sqlite_factory()
        job = db.query(Job).filter_by(id=job_id).first()
        assert job.status == JobStatus.FAILED
        # Default triageStatus from create_job is PENDING — must stay PENDING
        assert job.triageStatus == TriageStatus.PENDING
        db.close()

    def test_fail_job_fix_pr_failed_preserves_analysis_result(self, jm, sqlite_factory):
        """BUG-4: analysis data (drift_score) must survive the FIX_PR_FAILED transition."""
        from src.storage.sql_models import TriageStatus

        repo_id = jm.get_or_create_repo("t-001", "repo-gh-bug4c", "org/repo-bug4c")
        job_id = jm.create_job("t-001", repo_id, 13)
        jm.update_status(
            job_id, JobStatus.COMPLETED, result={"drift_score": 72, "repo": "org/repo"}
        )

        jm.fail_job(job_id, "Git push rejected", triage_status="FIX_PR_FAILED")

        db = sqlite_factory()
        job = db.query(Job).filter_by(id=job_id).first()
        assert job.triageStatus == TriageStatus.FIX_PR_FAILED
        assert job.result["drift_score"] == 72  # analysis data preserved
        assert job.result["error"] == "Git push rejected"
        db.close()


# ── patch_result ──────────────────────────────────────────────────────────────


class TestPatchResult:
    def test_merges_extra_fields(self, jm, sqlite_factory):
        repo_id = jm.get_or_create_repo("t-001", "repo-gh-7", "org/repo7")
        job_id = jm.create_job("t-001", repo_id, 9)
        jm.update_status(job_id, JobStatus.COMPLETED, result={"drift_score": 10})
        jm.patch_result(job_id, {"extra_field": "value"})
        db = sqlite_factory()
        job = db.query(Job).filter_by(id=job_id).first()
        assert job.result["drift_score"] == 10
        assert job.result["extra_field"] == "value"
        db.close()

    def test_patch_result_no_op_for_missing_job(self, jm):
        """patch_result on a non-existent job should not raise."""
        jm.patch_result("non-existent-job", {"key": "val"})
