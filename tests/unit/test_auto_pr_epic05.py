"""
TEST-01 / A4: process_fix_pr() — EPIC-05 auto-merge path.

Verifies the auto_merge=True/False branch inside process_fix_pr:
  - auto_merge=True  + auto_merge_pr() returns True  → triageStatus=RESOLVED, post_pr_comment called
  - auto_merge=True  + auto_merge_pr() returns False → triageStatus NOT RESOLVED, no comment
  - auto_merge=False → auto_merge_pr never called, triageStatus stays ACCEPTED

Uses in-memory SQLite — same pattern as test_auto_pr.py.
"""

import pytest
from unittest.mock import MagicMock, patch, AsyncMock
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from src.storage.sql_models import Base, Job, Tenant, Repository, JobStatus, TriageStatus
from src.pipeline.handler import process_fix_pr


# ── DB fixture ────────────────────────────────────────────────────────────────

engine = create_engine("sqlite:///:memory:")
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="function")
def db_session():
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    yield db
    db.close()
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def job_with_doc_updates(db_session):
    """Seed a tenant, repo, and job ready for process_fix_pr."""
    tenant = Tenant(
        id="tenant-epic05",
        name="Epic05 Org",
        githubOrgId="12345",
        installationId="123456",
        appId="789",
        privateKey="enc_pk",
        workflowConfig={"autoMergeMethod": "squash", "autoMergeWaitForCI": True},
    )
    db_session.add(tenant)
    db_session.commit()

    repo = Repository(
        id="repo-epic05",
        tenantId=tenant.id,
        githubRepoId="99",
        name="testrepo",
    )
    db_session.add(repo)
    db_session.commit()

    job = Job(
        id="job-epic05",
        tenantId=tenant.id,
        repositoryId=repo.id,
        prNumber=42,
        status=JobStatus.QUEUED,
        triageStatus=TriageStatus.ACCEPTED,
        result={
            "drift_score": 90,
            "head_sha": "deadbeef",
            "base_ref": "main",
            "repo_full_name": "TestOrg/testrepo",
            "documentation_updates": [
                {"file_path": "docs/api.md", "content": "# Updated API docs"}
            ],
        },
    )
    db_session.add(job)
    db_session.commit()
    return job


# ── common patches ────────────────────────────────────────────────────────────

def _base_patches(db_session, committer_mock):
    """Return the common patch stack for process_fix_pr tests."""
    return [
        patch("src.pipeline.job_manager.get_db", side_effect=lambda: iter([db_session])),
        patch("src.github.app.get_installation_token", return_value="fake-gh-token"),
        patch("src.security.encryption.decrypt_credential", return_value="fake-pk"),
        patch("src.github.committer.GitCommitter", return_value=committer_mock),
        patch("src.pipeline.handler.job_manager"),  # suppress update_status/complete_job side-effects
    ]


def _make_committer(auto_merge_result: bool = True, branch_name: str = "docugardener/fix-42-abc"):
    mock = MagicMock()
    mock.apply_and_push.return_value = branch_name
    mock.create_pr.return_value = "https://github.com/TestOrg/testrepo/pull/43"
    mock.auto_merge_pr.return_value = auto_merge_result
    mock.post_pr_comment.return_value = None
    # Dedup guard: return None so the "reuse existing PR" branch is not taken
    mock.find_open_fix_pr.return_value = None
    return mock


# ── tests ─────────────────────────────────────────────────────────────────────

class TestProcessFixPrEpic05:

    @pytest.mark.asyncio
    async def test_auto_merge_true_calls_auto_merge_pr(self, db_session, job_with_doc_updates):
        """auto_merge=True + branch created → committer.auto_merge_pr() called with the fix PR URL."""
        committer = _make_committer(auto_merge_result=True)

        with _base_patches(db_session, committer)[0], \
             _base_patches(db_session, committer)[1], \
             _base_patches(db_session, committer)[2], \
             _base_patches(db_session, committer)[3], \
             _base_patches(db_session, committer)[4]:
            await process_fix_pr(job_with_doc_updates.id, auto_merge=True)

        committer.auto_merge_pr.assert_called_once()
        call_args = committer.auto_merge_pr.call_args
        assert "https://github.com/TestOrg/testrepo/pull/43" == call_args[0][0]

    @pytest.mark.asyncio
    async def test_auto_merge_true_sets_triage_resolved_on_success(self, db_session, job_with_doc_updates):
        """auto_merge_pr() returns None (success) → job.triageStatus = RESOLVED committed to DB."""
        committer = _make_committer(auto_merge_result=None)

        with _base_patches(db_session, committer)[0], \
             _base_patches(db_session, committer)[1], \
             _base_patches(db_session, committer)[2], \
             _base_patches(db_session, committer)[3], \
             _base_patches(db_session, committer)[4]:
            await process_fix_pr(job_with_doc_updates.id, auto_merge=True)

        db_session.refresh(job_with_doc_updates)
        assert job_with_doc_updates.triageStatus == TriageStatus.RESOLVED

    @pytest.mark.asyncio
    async def test_auto_merge_true_posts_pr_comment_on_success(self, db_session, job_with_doc_updates):
        """auto_merge_pr() returns None (success) → committer.post_pr_comment() called."""
        committer = _make_committer(auto_merge_result=None)

        with _base_patches(db_session, committer)[0], \
             _base_patches(db_session, committer)[1], \
             _base_patches(db_session, committer)[2], \
             _base_patches(db_session, committer)[3], \
             _base_patches(db_session, committer)[4]:
            await process_fix_pr(job_with_doc_updates.id, auto_merge=True)

        committer.post_pr_comment.assert_called_once()
        args = committer.post_pr_comment.call_args[0]
        assert args[0] == 42  # original PR number

    @pytest.mark.asyncio
    async def test_auto_merge_false_skips_auto_merge_pr(self, db_session, job_with_doc_updates):
        """auto_merge=False → committer.auto_merge_pr is never called."""
        committer = _make_committer()

        with _base_patches(db_session, committer)[0], \
             _base_patches(db_session, committer)[1], \
             _base_patches(db_session, committer)[2], \
             _base_patches(db_session, committer)[3], \
             _base_patches(db_session, committer)[4]:
            await process_fix_pr(job_with_doc_updates.id, auto_merge=False)

        committer.auto_merge_pr.assert_not_called()

    @pytest.mark.asyncio
    async def test_auto_merge_false_sets_triage_fix_pr_open(self, db_session, job_with_doc_updates):
        """auto_merge=False → triageStatus is FIX_PR_OPEN (fix PR created, awaiting merge)."""
        committer = _make_committer()

        with _base_patches(db_session, committer)[0], \
             _base_patches(db_session, committer)[1], \
             _base_patches(db_session, committer)[2], \
             _base_patches(db_session, committer)[3], \
             _base_patches(db_session, committer)[4]:
            await process_fix_pr(job_with_doc_updates.id, auto_merge=False)

        db_session.refresh(job_with_doc_updates)
        assert job_with_doc_updates.triageStatus == TriageStatus.FIX_PR_OPEN

    @pytest.mark.asyncio
    async def test_auto_merge_pr_fails_sets_fix_pr_open(self, db_session, job_with_doc_updates):
        """auto_merge_pr() returns a skip reason → triageStatus is FIX_PR_OPEN (fix PR exists,
        merge skipped; webhook will transition to RESOLVED when PR is manually merged)."""
        committer = _make_committer(auto_merge_result="CI timeout")

        with _base_patches(db_session, committer)[0], \
             _base_patches(db_session, committer)[1], \
             _base_patches(db_session, committer)[2], \
             _base_patches(db_session, committer)[3], \
             _base_patches(db_session, committer)[4]:
            await process_fix_pr(job_with_doc_updates.id, auto_merge=True)

        db_session.refresh(job_with_doc_updates)
        assert job_with_doc_updates.triageStatus == TriageStatus.FIX_PR_OPEN

    @pytest.mark.asyncio
    async def test_auto_merge_pr_fails_does_not_post_comment(self, db_session, job_with_doc_updates):
        """auto_merge_pr() returns False → post_pr_comment never called."""
        committer = _make_committer(auto_merge_result=False)

        with _base_patches(db_session, committer)[0], \
             _base_patches(db_session, committer)[1], \
             _base_patches(db_session, committer)[2], \
             _base_patches(db_session, committer)[3], \
             _base_patches(db_session, committer)[4]:
            await process_fix_pr(job_with_doc_updates.id, auto_merge=True)

        committer.post_pr_comment.assert_not_called()
