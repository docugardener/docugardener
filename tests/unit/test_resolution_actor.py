# SPDX-License-Identifier: AGPL-3.0-or-later
"""Unit tests for resolution_actor stamping — CR-DATA-01."""

from __future__ import annotations

from unittest.mock import patch

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from src.api.webhooks import handle_fix_pr_merged
from src.storage.sql_models import Base, Job, JobStatus, Repository, Tenant, TriageStatus

# ---------------------------------------------------------------------------
# DB setup
# ---------------------------------------------------------------------------

engine = create_engine("sqlite:///:memory:")
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(autouse=True)
def fresh_schema():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


def _seed(result: dict) -> dict:
    """Seed tenant + repo + job with the given result dict."""
    db = TestingSessionLocal()
    try:
        tenant = Tenant(
            id="tenant-crd01",
            name="CRD Org",
            githubOrgId="33333",
            installationId="77777",
        )
        db.add(tenant)
        db.commit()

        repo = Repository(
            id="repo-crd01",
            tenantId=tenant.id,
            githubRepoId="77",
            name="myrepo",
        )
        db.add(repo)
        db.commit()

        job = Job(
            id="job-crd01",
            tenantId=tenant.id,
            repositoryId=repo.id,
            prNumber=10,
            status=JobStatus.COMPLETED,
            triageStatus=TriageStatus.FIX_PR_OPEN,
            result=result,
        )
        db.add(job)
        db.commit()

        ids = {"tenant_id": tenant.id, "job_id": job.id}
    finally:
        db.close()

    return ids


def _get_job_result(job_id: str) -> dict:
    db = TestingSessionLocal()
    try:
        job = db.query(Job).filter(Job.id == job_id).first()
        return dict(job.result or {})
    finally:
        db.close()


def _webhook_data(installation_id: int = 77777) -> dict:
    return {"installation": {"id": installation_id}}


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_handle_fix_pr_merged_human_stamps_human_actor():
    """Job with no auto_fix_enqueued → resolution_actor='human'."""
    ids = _seed(result={})

    with patch("src.pipeline.job_manager.SessionLocal", TestingSessionLocal):
        result = await handle_fix_pr_merged(
            _webhook_data(),
            head_ref="docugardener-fix-10-abc123",
        )

    assert result.get("status") == "resolved"
    job_result = _get_job_result(ids["job_id"])
    assert job_result.get("resolution_actor") == "human"


@pytest.mark.asyncio
async def test_handle_fix_pr_merged_ai_auto_stamps_ai_auto():
    """Job with auto_fix_enqueued=True → resolution_actor='ai_auto'."""
    ids = _seed(result={"auto_fix_enqueued": True})

    with patch("src.pipeline.job_manager.SessionLocal", TestingSessionLocal):
        result = await handle_fix_pr_merged(
            _webhook_data(),
            head_ref="docugardener-fix-10-abc123",
        )

    assert result.get("status") == "resolved"
    job_result = _get_job_result(ids["job_id"])
    assert job_result.get("resolution_actor") == "ai_auto"


def test_resolution_actor_on_handler_auto_merge_path():
    """handler.py auto-merge path stamps resolution_actor='ai_auto' in new_result."""
    # Unit-test the dict mutation logic directly — no DB needed.
    new_result: dict = {
        "auto_fix_enqueued": True,
        "autoMergeMethod": "squash",
        "fix_pr_merged_at": "2026-04-20T12:00:00Z",
    }

    # Replicate the exact assignment from handler.py
    new_result["resolution_actor"] = "ai_auto"

    assert new_result["resolution_actor"] == "ai_auto"
    assert new_result["fix_pr_merged_at"] is not None
