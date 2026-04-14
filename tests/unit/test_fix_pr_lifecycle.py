"""
FIX-PR-LIFECYCLE — State machine tests for the FIX_PR_OPEN intermediate state.

Coverage:
  process_fix_pr (handler.py):
    A1  After create_pr() succeeds → triageStatus = FIX_PR_OPEN (not RESOLVED)
    A2  After auto_merge succeeds (skip_reason=None) → triageStatus = RESOLVED + fix_pr_merged_at stamped
    A3  After auto_merge skips (skip_reason != None) → triageStatus stays FIX_PR_OPEN
    A4  Dedup-guard path (existing fix PR) → triageStatus = FIX_PR_OPEN

  handle_fix_pr_merged (webhooks.py):
    B1  docugardener-fix- branch + FIX_PR_OPEN job → RESOLVED + fix_pr_merged_at in result
    B2  docugardener-fix- branch + PENDING job → skipped (only FIX_PR_OPEN transitions)
    B3  docugardener-fix- branch + already RESOLVED → skipped (no double-write)
    B4  fix_pr_merged_at value is a valid ISO-8601 UTC string (ends with Z)
    B5  Non docugardener branch → no state change (existing coverage regression guard)

  inbox.py UTC timestamp fix:
    C1  GET /inbox createdAt values end with "Z"
    C2  GET /inbox completedAt values end with "Z" when set
"""

import pytest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from src.storage.sql_models import Base, Job, Tenant, Repository, JobStatus, TriageStatus


# ── Shared in-memory DB ───────────────────────────────────────────────────────

engine = create_engine("sqlite:///:memory:")
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(autouse=True)
def fresh_schema():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def seed_db():
    """Seed tenant + repo + job with FIX_PR_OPEN status (standard pre-merge state)."""
    db = TestingSessionLocal()
    try:
        tenant = Tenant(
            id="tenant-lc01",
            name="LC Org",
            githubOrgId="77777",
            installationId="88888",
        )
        db.add(tenant)
        db.commit()

        repo = Repository(
            id="repo-lc01",
            tenantId=tenant.id,
            githubRepoId="42",
            name="myrepo",
        )
        db.add(repo)
        db.commit()

        job = Job(
            id="job-lc01",
            tenantId=tenant.id,
            repositoryId=repo.id,
            prNumber=10,
            status=JobStatus.COMPLETED,
            triageStatus=TriageStatus.FIX_PR_OPEN,
            result={
                "drift_score": 75,
                "repo_full_name": "org/myrepo",
                "fixPrUrl": "https://github.com/org/myrepo/pull/11",
            },
        )
        db.add(job)
        db.commit()
        ids = {"tenant_id": tenant.id, "job_id": job.id}
    finally:
        db.close()
    return ids


def _get_job(job_id: str) -> dict:
    """Return a snapshot of the job as a plain dict (avoids detached-instance errors)."""
    db = TestingSessionLocal()
    try:
        job = db.query(Job).filter(Job.id == job_id).first()
        if job is None:
            return {}
        return {
            "triageStatus": job.triageStatus,
            "result": dict(job.result or {}),
        }
    finally:
        db.close()


def _webhook_data(installation_id: int = 88888) -> dict:
    return {"installation": {"id": installation_id}}


# ── Group B: handle_fix_pr_merged ────────────────────────────────────────────

class TestHandleFixPrMergedLifecycle:

    @pytest.mark.asyncio
    async def test_b1_fix_pr_open_job_set_to_resolved(self, seed_db):
        """B1: FIX_PR_OPEN job → RESOLVED after fix PR merge webhook."""
        from src.api.webhooks import handle_fix_pr_merged

        with patch("src.pipeline.job_manager.SessionLocal", TestingSessionLocal):
            result = await handle_fix_pr_merged(
                _webhook_data(), head_ref="docugardener-fix-10-abc123"
            )

        assert result["status"] == "resolved"
        snap = _get_job(seed_db["job_id"])
        assert snap["triageStatus"] == TriageStatus.RESOLVED

    @pytest.mark.asyncio
    async def test_b2_pending_job_not_touched(self, seed_db):
        """B2: Job in PENDING state is not promoted by fix PR merge webhook."""
        from src.api.webhooks import handle_fix_pr_merged

        # Put job back in PENDING
        db = TestingSessionLocal()
        try:
            job = db.query(Job).filter(Job.id == seed_db["job_id"]).first()
            job.triageStatus = TriageStatus.PENDING
            db.commit()
        finally:
            db.close()

        with patch("src.pipeline.job_manager.SessionLocal", TestingSessionLocal):
            result = await handle_fix_pr_merged(
                _webhook_data(), head_ref="docugardener-fix-10-abc123"
            )

        # Job was not in FIX_PR_OPEN → should be skipped (no job found matching filter)
        assert result["status"] == "skipped"
        snap = _get_job(seed_db["job_id"])
        assert snap["triageStatus"] == TriageStatus.PENDING

    @pytest.mark.asyncio
    async def test_b3_already_resolved_not_double_written(self, seed_db):
        """B3: Already RESOLVED job is not touched again."""
        from src.api.webhooks import handle_fix_pr_merged

        db = TestingSessionLocal()
        try:
            job = db.query(Job).filter(Job.id == seed_db["job_id"]).first()
            job.triageStatus = TriageStatus.RESOLVED
            db.commit()
        finally:
            db.close()

        with patch("src.pipeline.job_manager.SessionLocal", TestingSessionLocal):
            result = await handle_fix_pr_merged(
                _webhook_data(), head_ref="docugardener-fix-10-abc123"
            )

        assert result["status"] == "skipped"

    @pytest.mark.asyncio
    async def test_b4_fix_pr_merged_at_is_utc_iso_string(self, seed_db):
        """B4: fix_pr_merged_at stamped in result is a valid UTC ISO-8601 string ending with Z."""
        from src.api.webhooks import handle_fix_pr_merged

        with patch("src.pipeline.job_manager.SessionLocal", TestingSessionLocal):
            await handle_fix_pr_merged(
                _webhook_data(), head_ref="docugardener-fix-10-xyz"
            )

        snap = _get_job(seed_db["job_id"])
        merged_at = snap["result"].get("fix_pr_merged_at")
        assert merged_at is not None, "fix_pr_merged_at should be stamped in result"
        assert isinstance(merged_at, str)
        assert merged_at.endswith("Z"), f"Expected UTC string ending with Z, got {merged_at!r}"
        # Must be parseable as datetime
        parsed = datetime.fromisoformat(merged_at.replace("Z", "+00:00"))
        assert parsed.tzinfo is not None

    @pytest.mark.asyncio
    async def test_b5_non_docugardener_branch_noop(self, seed_db):
        """B5: Regular feature branch → triageStatus unchanged (regression guard)."""
        from src.api.webhooks import handle_fix_pr_merged

        with patch("src.pipeline.job_manager.SessionLocal", TestingSessionLocal):
            result = await handle_fix_pr_merged(
                _webhook_data(), head_ref="feature/my-feature"
            )

        assert result["status"] == "skipped"
        snap = _get_job(seed_db["job_id"])
        assert snap["triageStatus"] == TriageStatus.FIX_PR_OPEN


# ── Group A: process_fix_pr state transitions ────────────────────────────────

class TestProcessFixPrStateTransitions:
    """
    Tests for the process_fix_pr function.
    We mock the GitCommitter and job_manager so we can exercise just the state machine.
    """

    def _seed_job_for_fix_pr(self, triageStatus=TriageStatus.ACCEPTED) -> str:
        """Seed a job ready for fix PR creation, return job_id."""
        db = TestingSessionLocal()
        try:
            tenant = Tenant(
                id="tenant-fp01",
                name="FP Org",
                githubOrgId="99991",
                installationId="99992",
                appId="12345",
                privateKey="enc:dummykey",
                workflowConfig={"autoMergeMethod": "squash", "autoMergeWaitForCI": False},
            )
            db.add(tenant)
            db.commit()

            repo = Repository(
                id="repo-fp01",
                tenantId=tenant.id,
                githubRepoId="77",
                name="testrepo",
            )
            db.add(repo)
            db.commit()

            job = Job(
                id="job-fp01",
                tenantId=tenant.id,
                repositoryId=repo.id,
                prNumber=20,
                status=JobStatus.COMPLETED,
                triageStatus=triageStatus,
                result={
                    "drift_score": 80,
                    "repo_full_name": "org/testrepo",
                    "head_sha": "abc123",
                    "base_ref": "main",
                    "documentation_updates": [
                        {"file_path": "README.md", "content": "# Updated docs"},
                    ],
                },
            )
            db.add(job)
            db.commit()
        finally:
            db.close()
        return "job-fp01"

    def _make_mock_committer(self, pr_url="https://github.com/org/testrepo/pull/21"):
        mock = MagicMock()
        mock.find_open_fix_pr.return_value = None  # no existing fix PR
        mock.apply_and_push.return_value = "docugardener-fix-20-aaaa"
        mock.create_pr.return_value = pr_url
        mock.auto_merge_pr.return_value = None  # None = success
        mock.post_pr_comment.return_value = None
        return mock

    def _patch_process_fix_pr(self, mock_committer):
        """Return a context-manager stack that wires the test DB + mock committer."""
        from contextlib import ExitStack
        stack = ExitStack()
        # process_fix_pr opens its own session via: from src.pipeline.job_manager import get_db
        # and also uses SessionLocal directly for the dedup-guard path.
        stack.enter_context(patch("src.pipeline.job_manager.SessionLocal", TestingSessionLocal))
        # Override get_db so `db = next(get_db())` returns a test session
        def _test_get_db():
            db = TestingSessionLocal()
            try:
                yield db
            finally:
                db.close()
        stack.enter_context(patch("src.pipeline.job_manager.get_db", _test_get_db))
        stack.enter_context(patch("src.github.app.get_installation_token", return_value="tok"))
        stack.enter_context(patch("src.security.encryption.decrypt_credential", return_value="privkey"))
        stack.enter_context(patch("src.github.committer.GitCommitter", return_value=mock_committer))
        mock_jm = MagicMock()
        mock_jm.update_status.return_value = None
        mock_jm.complete_job.return_value = None
        mock_jm.fail_job.return_value = None
        stack.enter_context(patch("src.pipeline.handler.job_manager", mock_jm))
        return stack

    @pytest.mark.asyncio
    async def test_a1_process_fix_pr_sets_fix_pr_open_not_resolved(self):
        """A1: After create_pr() succeeds, triageStatus = FIX_PR_OPEN (not RESOLVED)."""
        job_id = self._seed_job_for_fix_pr()
        mock_committer = self._make_mock_committer()

        from src.pipeline.handler import process_fix_pr
        with self._patch_process_fix_pr(mock_committer):
            await process_fix_pr(job_id, auto_merge=False)

        snap = _get_job(job_id)
        assert snap["triageStatus"] == TriageStatus.FIX_PR_OPEN, (
            f"Expected FIX_PR_OPEN after create_pr, got {snap['triageStatus']}"
        )
        assert snap["result"].get("fixPrUrl") is not None

    @pytest.mark.asyncio
    async def test_a2_auto_merge_success_sets_resolved_with_merged_at(self):
        """A2: auto_merge=True + skip_reason=None → RESOLVED + fix_pr_merged_at stamped."""
        job_id = self._seed_job_for_fix_pr()
        mock_committer = self._make_mock_committer()
        mock_committer.auto_merge_pr.return_value = None  # success

        from src.pipeline.handler import process_fix_pr
        with self._patch_process_fix_pr(mock_committer):
            await process_fix_pr(job_id, auto_merge=True)

        snap = _get_job(job_id)
        assert snap["triageStatus"] == TriageStatus.RESOLVED, (
            f"Expected RESOLVED after auto_merge success, got {snap['triageStatus']}"
        )
        merged_at = snap["result"].get("fix_pr_merged_at")
        assert merged_at is not None, "fix_pr_merged_at should be stamped when auto_merge succeeds"
        assert merged_at.endswith("Z"), f"Expected UTC string, got {merged_at!r}"

    @pytest.mark.asyncio
    async def test_a3_auto_merge_skip_stays_fix_pr_open(self):
        """A3: auto_merge=True but skip_reason != None → stays FIX_PR_OPEN (not RESOLVED)."""
        job_id = self._seed_job_for_fix_pr()
        mock_committer = self._make_mock_committer()
        mock_committer.auto_merge_pr.return_value = "ci_failed"  # skipped

        from src.pipeline.handler import process_fix_pr
        with self._patch_process_fix_pr(mock_committer):
            await process_fix_pr(job_id, auto_merge=True)

        snap = _get_job(job_id)
        assert snap["triageStatus"] == TriageStatus.FIX_PR_OPEN, (
            f"Expected FIX_PR_OPEN when auto_merge skipped, got {snap['triageStatus']}"
        )
        assert snap["result"].get("fix_pr_merged_at") is None, (
            "fix_pr_merged_at should NOT be stamped when auto_merge is skipped"
        )

    @pytest.mark.asyncio
    async def test_a4_dedup_guard_existing_fix_pr_sets_fix_pr_open(self):
        """A4: Dedup guard (existing open fix PR reused) → triageStatus = FIX_PR_OPEN."""
        job_id = self._seed_job_for_fix_pr()
        existing_url = "https://github.com/org/testrepo/pull/99"
        mock_committer = self._make_mock_committer()
        mock_committer.find_open_fix_pr.return_value = existing_url  # existing PR found

        from src.pipeline.handler import process_fix_pr
        with self._patch_process_fix_pr(mock_committer):
            await process_fix_pr(job_id, auto_merge=False)

        snap = _get_job(job_id)
        assert snap["triageStatus"] == TriageStatus.FIX_PR_OPEN, (
            f"Expected FIX_PR_OPEN for dedup-guard path, got {snap['triageStatus']}"
        )
        assert snap["result"].get("fixPrUrl") == existing_url


# ── Group C: inbox UTC timestamps ─────────────────────────────────────────────

class TestInboxUtcTimestamps:

    def _seed_inbox_job(self, completed_at=None) -> str:
        db = TestingSessionLocal()
        try:
            tenant = Tenant(
                id="tenant-utc01",
                name="UTC Org",
                githubOrgId="utc001",
                installationId="utc002",
            )
            db.add(tenant)
            db.commit()

            repo = Repository(
                id="repo-utc01",
                tenantId=tenant.id,
                githubRepoId="utc01",
                name="utcrepo",
            )
            db.add(repo)
            db.commit()

            job = Job(
                id="job-utc01",
                tenantId=tenant.id,
                repositoryId=repo.id,
                prNumber=1,
                status=JobStatus.COMPLETED,
                triageStatus=TriageStatus.PENDING,
                result={"drift_score": 50, "repo_full_name": "org/utcrepo"},
                completedAt=completed_at or datetime.utcnow(),
            )
            db.add(job)
            db.commit()
        finally:
            db.close()
        return "job-utc01"

    def _call_inbox(self, tenant_id: str) -> list:
        """Call the inbox API function directly (bypasses FastAPI middleware)."""
        from src.api.inbox import get_inbox_jobs

        db = TestingSessionLocal()
        try:
            return get_inbox_jobs(tenant_id=tenant_id, repository_id=None, db=db)
        finally:
            db.close()

    def test_c1_inbox_created_at_ends_with_z(self):
        """C1: GET /inbox response createdAt values must end with Z (UTC marker)."""
        self._seed_inbox_job()
        items = self._call_inbox("tenant-utc01")
        assert len(items) > 0
        for item in items:
            created_at = item.get("createdAt", "")
            assert isinstance(created_at, str), f"createdAt should be str, got {type(created_at)}"
            assert created_at.endswith("Z"), (
                f"createdAt must end with Z (UTC), got {created_at!r}"
            )

    def test_c2_inbox_completed_at_ends_with_z_when_set(self):
        """C2: completedAt in inbox response ends with Z when the field is non-null."""
        self._seed_inbox_job(completed_at=datetime(2026, 3, 31, 12, 0, 0))
        items = self._call_inbox("tenant-utc01")
        for item in items:
            if item.get("completedAt"):
                assert item["completedAt"].endswith("Z"), (
                    f"completedAt must end with Z, got {item['completedAt']!r}"
                )
