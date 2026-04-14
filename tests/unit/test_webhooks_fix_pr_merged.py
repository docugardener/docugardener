"""
TEST-01 / A5: handle_fix_pr_merged() — webhook lifecycle unit tests.

Covers:
  - docugardener-fix- branch → matching job triageStatus = RESOLVED
  - Non-docugardener branch → no-op (triageStatus unchanged)
  - Job has jira_ticket_key in result → post_jira_lifecycle_comment called
  - Job has no jira_ticket_key → no Jira dispatcher instantiated
  - No job found for that PR number → returns "skipped" without error
  - No tenant found for installation_id → returns "skipped" without error

Implementation note: handle_fix_pr_merged creates its own DB session via
SessionLocal() and calls db.close() when done. Tests patch SessionLocal
with the test factory (not a fixed instance) and open a fresh verify session
for assertions — this avoids SQLAlchemy detached-object errors.
"""

import pytest
from unittest.mock import MagicMock, patch, AsyncMock
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from src.storage.sql_models import Base, Job, Tenant, Repository, JobStatus, TriageStatus
from src.api.webhooks import handle_fix_pr_merged


# ── DB setup ──────────────────────────────────────────────────────────────────

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
    """Seed tenant + repo + job and return their IDs."""
    db = TestingSessionLocal()
    try:
        tenant = Tenant(
            id="tenant-lfpm",
            name="LFPM Org",
            githubOrgId="11111",
            installationId="99999",
        )
        db.add(tenant)
        db.commit()

        repo = Repository(
            id="repo-lfpm",
            tenantId=tenant.id,
            githubRepoId="55",
            name="myrepo",
        )
        db.add(repo)
        db.commit()

        job = Job(
            id="job-lfpm",
            tenantId=tenant.id,
            repositoryId=repo.id,
            prNumber=42,
            status=JobStatus.COMPLETED,
            # FIX_PR_OPEN is the correct pre-merge state: fix PR created, not yet merged.
            triageStatus=TriageStatus.FIX_PR_OPEN,
            result={"drift_score": 80, "repo_full_name": "org/myrepo"},
        )
        db.add(job)
        db.commit()

        # Capture IDs while session is open — expire_on_commit=True (default)
        # means attribute access after db.close() would trigger a refresh
        # on a detached instance and raise DetachedInstanceError.
        ids = {"tenant_id": tenant.id, "job_id": job.id}
    finally:
        db.close()

    return ids


def _get_job_triage_status(job_id: str) -> TriageStatus:
    """Open a fresh session and return the current triageStatus for job_id."""
    db = TestingSessionLocal()
    try:
        job = db.query(Job).filter(Job.id == job_id).first()
        return job.triageStatus if job else None
    finally:
        db.close()


def _webhook_data(installation_id: int = 99999) -> dict:
    return {"installation": {"id": installation_id}}


# ── tests ─────────────────────────────────────────────────────────────────────

class TestHandleFixPrMerged:

    @pytest.mark.asyncio
    async def test_docugardener_branch_sets_resolved(self, seed_db):
        """docugardener-fix-42-abc branch → job triageStatus = RESOLVED."""
        with patch("src.pipeline.job_manager.SessionLocal", TestingSessionLocal):
            result = await handle_fix_pr_merged(
                _webhook_data(), head_ref="docugardener-fix-42-abc123"
            )

        assert result["status"] == "resolved"
        assert _get_job_triage_status(seed_db["job_id"]) == TriageStatus.RESOLVED

    @pytest.mark.asyncio
    async def test_non_docugardener_branch_is_noop(self, seed_db):
        """A regular feature branch → triageStatus unchanged, status=skipped."""
        with patch("src.pipeline.job_manager.SessionLocal", TestingSessionLocal):
            result = await handle_fix_pr_merged(
                _webhook_data(), head_ref="feature/my-feature"
            )

        assert result["status"] == "skipped"
        assert _get_job_triage_status(seed_db["job_id"]) == TriageStatus.FIX_PR_OPEN

    @pytest.mark.asyncio
    async def test_posts_jira_comment_when_ticket_key_present(self, seed_db):
        """Job result contains jira_ticket_key → post_jira_lifecycle_comment called."""
        # Plant a Jira key in the job result + configure the tenant
        db = TestingSessionLocal()
        try:
            job = db.query(Job).filter(Job.id == seed_db["job_id"]).first()
            job.result = {**job.result, "jira_ticket_key": "PROJ-1"}
            tenant = db.query(Tenant).filter(Tenant.id == seed_db["tenant_id"]).first()
            tenant.workflowConfig = {
                "jira": {"host": "https://jira.example.com", "email": "a@b.com", "apiToken": "enc"}
            }
            db.commit()
        finally:
            db.close()

        mock_dispatcher = MagicMock()
        mock_dispatcher.post_jira_lifecycle_comment = AsyncMock()

        with patch("src.pipeline.job_manager.SessionLocal", TestingSessionLocal), \
             patch("src.notifications.dispatcher.NotificationDispatcher", return_value=mock_dispatcher):
            await handle_fix_pr_merged(
                _webhook_data(), head_ref="docugardener-fix-42-xyz"
            )

        mock_dispatcher.post_jira_lifecycle_comment.assert_called_once()
        ticket_arg = mock_dispatcher.post_jira_lifecycle_comment.call_args[0][0]
        assert ticket_arg == "PROJ-1"

    @pytest.mark.asyncio
    async def test_skips_jira_when_no_ticket_key(self, seed_db):
        """Job result has no jira_ticket_key → no Jira-related activity."""
        with patch("src.pipeline.job_manager.SessionLocal", TestingSessionLocal), \
             patch("src.notifications.dispatcher.NotificationDispatcher") as mock_cls:
            await handle_fix_pr_merged(
                _webhook_data(), head_ref="docugardener-fix-42-nojira"
            )

        mock_cls.assert_not_called()

    @pytest.mark.asyncio
    async def test_returns_skipped_when_no_matching_job(self, seed_db):
        """PR number 999 has no job in DB → returns skipped/job-not-found."""
        with patch("src.pipeline.job_manager.SessionLocal", TestingSessionLocal):
            result = await handle_fix_pr_merged(
                _webhook_data(), head_ref="docugardener-fix-999-abc"
            )

        assert result["status"] == "skipped"
        assert "job" in result.get("reason", "").lower()

    @pytest.mark.asyncio
    async def test_returns_skipped_when_tenant_not_found(self, seed_db):
        """installation_id that matches no tenant → skipped, no crash."""
        with patch("src.pipeline.job_manager.SessionLocal", TestingSessionLocal):
            result = await handle_fix_pr_merged(
                {"installation": {"id": 0}},
                head_ref="docugardener-fix-42-abc",
            )

        assert result["status"] == "skipped"
