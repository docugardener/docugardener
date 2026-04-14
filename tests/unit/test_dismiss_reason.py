"""
Tests for the Required Reason on Dismiss feature.

Covers:
1. PATCH /inbox/{id} without dismiss_reason — result unchanged
2. PATCH /inbox/{id} with dismiss_reason — reason persisted to job.result
3. ignore_drift_job includes reason in GitHub check run summary
4. ignore_drift_job with no reason uses default summary
"""

import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from src.main import app
from src.storage.sql_models import Base, Job, Tenant, TriageStatus, JobStatus


# In-memory SQLite DB for all tests in this module
engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(autouse=True)
def db_session():
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    from src.pipeline.job_manager import get_db
    app.dependency_overrides[get_db] = lambda: db
    yield db
    db.close()
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)


def _make_job(db, job_id: str, result: dict | None = None) -> Job:
    job = Job(
        id=job_id,
        tenantId="tenant-1",
        repositoryId="repo-1",
        prNumber=42,
        status=JobStatus.COMPLETED,
        triageStatus=TriageStatus.PENDING,
        result=result or {"check_run_id": "99", "installation_id": "1", "repo_full_name": "org/repo"},
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


# ---------------------------------------------------------------------------
# API-level tests (FastAPI TestClient)
# ---------------------------------------------------------------------------

def test_ignore_without_reason_leaves_result_unchanged(db_session):
    """PATCH without dismiss_reason should not inject the key into job.result."""
    job = _make_job(db_session, "job-no-reason", result={"existing_key": "value"})

    client = TestClient(app)
    with patch("src.worker.queue.get_queue") as mock_queue:
        mock_queue.return_value.enqueue = MagicMock()
        response = client.patch(
            f"/inbox/{job.id}?status=IGNORED",
            headers={"X-Tenant-ID": "tenant-1"},
        )

    assert response.status_code == 200

    db_session.refresh(job)
    assert "dismiss_reason" not in (job.result or {})
    assert job.result.get("existing_key") == "value"


def test_ignore_with_reason_persists_to_result(db_session):
    """PATCH with dismiss_reason should merge the reason into job.result."""
    job = _make_job(db_session, "job-with-reason", result={"existing_key": "value"})

    client = TestClient(app)
    with patch("src.worker.queue.get_queue") as mock_queue:
        mock_queue.return_value.enqueue = MagicMock()
        response = client.patch(
            f"/inbox/{job.id}?status=IGNORED&dismiss_reason=Not+relevant+to+docs",
            headers={"X-Tenant-ID": "tenant-1"},
        )

    assert response.status_code == 200

    db_session.refresh(job)
    assert job.result.get("dismiss_reason") == "Not relevant to docs"
    # Pre-existing keys must be preserved
    assert job.result.get("existing_key") == "value"


# ---------------------------------------------------------------------------
# Worker-level tests (ignore_drift_job)
# ---------------------------------------------------------------------------

def _make_tenant(db) -> Tenant:
    tenant = Tenant(
        id="tenant-1",
        githubOrgId="gh-org-1",
        name="Test Org",
        appId="123",
        privateKey="encrypted-key",
    )
    db.add(tenant)
    db.commit()
    return tenant


def test_ignore_drift_job_includes_reason_in_check_run(db_session):
    """When job.result has dismiss_reason, the GitHub check run summary must include it."""
    _make_tenant(db_session)
    job = _make_job(db_session, "job-reason-gh", result={
        "check_run_id": "55",
        "installation_id": "10",
        "repo_full_name": "org/my-repo",
        "head_sha": "abc1234",
        "dismiss_reason": "Already covered in the ADR",
    })

    with patch("src.pipeline.job_manager.get_db", return_value=iter([db_session])), \
         patch("src.security.encryption.decrypt_credential", return_value="-----BEGIN RSA PRIVATE KEY-----"), \
         patch("src.github.app.get_github_client") as mock_gh_client:

        mock_check_run = MagicMock()
        mock_repo = MagicMock()
        mock_repo.get_check_run.return_value = mock_check_run
        mock_gh_client.return_value.get_repo.return_value = mock_repo

        from src.worker.jobs import ignore_drift_job
        result = ignore_drift_job(job.id)

    assert result["status"] == "success"

    call_kwargs = mock_check_run.edit.call_args.kwargs
    summary = call_kwargs["output"]["summary"]
    assert "Already covered in the ADR" in summary
    assert "**Reason:**" in summary


def test_ignore_drift_job_no_reason_uses_default_summary(db_session):
    """When job.result has no dismiss_reason, the check run summary is the default."""
    _make_tenant(db_session)
    job = _make_job(db_session, "job-no-reason-gh", result={
        "check_run_id": "66",
        "installation_id": "10",
        "repo_full_name": "org/my-repo",
        "head_sha": "abc1234",
    })

    with patch("src.pipeline.job_manager.get_db", return_value=iter([db_session])), \
         patch("src.security.encryption.decrypt_credential", return_value="-----BEGIN RSA PRIVATE KEY-----"), \
         patch("src.github.app.get_github_client") as mock_gh_client:

        mock_check_run = MagicMock()
        mock_repo = MagicMock()
        mock_repo.get_check_run.return_value = mock_check_run
        mock_gh_client.return_value.get_repo.return_value = mock_repo

        from src.worker.jobs import ignore_drift_job
        result = ignore_drift_job(job.id)

    assert result["status"] == "success"

    call_kwargs = mock_check_run.edit.call_args.kwargs
    summary = call_kwargs["output"]["summary"]
    assert "**Reason:**" not in summary
    assert summary.endswith("No changes are required.")
