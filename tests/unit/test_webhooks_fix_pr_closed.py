# SPDX-License-Identifier: AGPL-3.0-or-later
"""Unit tests for handle_fix_pr_closed — BUG-8 FIX_PR_CANCELLED transition."""

from __future__ import annotations

from unittest.mock import patch

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from src.api.webhooks import handle_fix_pr_closed
from src.storage.sql_models import Base, Job, JobStatus, Repository, Tenant, TriageStatus

# ---------------------------------------------------------------------------
# DB setup — SQLite in-memory, matches pattern in test_webhooks_fix_pr_merged.py
# ---------------------------------------------------------------------------

engine = create_engine("sqlite:///:memory:")
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(autouse=True)
def fresh_schema():
    """Create all tables before each test and drop them after."""
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def seed_db():
    """Seed tenant + repo + job in FIX_PR_OPEN state."""
    db = TestingSessionLocal()
    try:
        tenant = Tenant(
            id="tenant-bug8",
            name="BUG8 Org",
            githubOrgId="22222",
            installationId="88888",
        )
        db.add(tenant)
        db.commit()

        repo = Repository(
            id="repo-bug8",
            tenantId=tenant.id,
            githubRepoId="66",
            name="myrepo",
        )
        db.add(repo)
        db.commit()

        job = Job(
            id="job-bug8",
            tenantId=tenant.id,
            repositoryId=repo.id,
            prNumber=42,
            status=JobStatus.COMPLETED,
            triageStatus=TriageStatus.FIX_PR_OPEN,
            result={"drift_score": 70},
        )
        db.add(job)
        db.commit()

        ids = {"tenant_id": tenant.id, "job_id": job.id}
    finally:
        db.close()

    return ids


def _get_job(job_id: str) -> Job | None:
    db = TestingSessionLocal()
    try:
        return db.query(Job).filter(Job.id == job_id).first()
    finally:
        db.close()


def _webhook_data(installation_id: int = 88888) -> dict:
    return {"installation": {"id": installation_id}}


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_fix_pr_closed_transitions_to_cancelled(seed_db):
    """Job with FIX_PR_OPEN is transitioned to FIX_PR_CANCELLED."""
    with patch("src.pipeline.job_manager.SessionLocal", TestingSessionLocal):
        result = await handle_fix_pr_closed(
            _webhook_data(),
            head_ref="docugardener-fix-42-abc123",
        )

    assert result["status"] == "cancelled"
    assert result["jobs_updated"] == 1

    job = _get_job(seed_db["job_id"])
    assert job.triageStatus == TriageStatus.FIX_PR_CANCELLED


@pytest.mark.asyncio
async def test_fix_pr_closed_no_op_when_no_matching_job(seed_db):
    """Returns skipped when there are no FIX_PR_OPEN jobs for the PR number."""
    # PR number 99 has no jobs — only PR 42 does
    with patch("src.pipeline.job_manager.SessionLocal", TestingSessionLocal):
        result = await handle_fix_pr_closed(
            _webhook_data(),
            head_ref="docugardener-fix-99-abc123",
        )

    assert result["status"] == "skipped"
    assert result["reason"] == "no_matching_jobs"

    # Original job is untouched
    job = _get_job(seed_db["job_id"])
    assert job.triageStatus == TriageStatus.FIX_PR_OPEN


@pytest.mark.asyncio
async def test_fix_pr_closed_stamps_closed_at_in_result(seed_db):
    """fix_pr_closed_at ISO timestamp is written into job.result."""
    with patch("src.pipeline.job_manager.SessionLocal", TestingSessionLocal):
        await handle_fix_pr_closed(
            _webhook_data(),
            head_ref="docugardener-fix-42-slug",
        )

    job = _get_job(seed_db["job_id"])
    assert "fix_pr_closed_at" in job.result
    ts = job.result["fix_pr_closed_at"]
    assert isinstance(ts, str) and len(ts) > 10


@pytest.mark.asyncio
async def test_fix_pr_closed_ignores_non_fix_branch():
    """Branch NOT matching docugardener-fix-{N}- returns skipped immediately."""
    result = await handle_fix_pr_closed(
        _webhook_data(),
        head_ref="feature/something-else",
    )

    assert result["status"] == "skipped"
    assert result["reason"] == "branch_parse_failed"
