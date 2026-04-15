from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from src.pipeline.handler import process_fix_pr
from src.storage.sql_models import Base, Job, JobStatus, Repository, Tenant, TriageStatus

# Setup an in-memory SQLite database for testing
engine = create_engine("sqlite:///:memory:")
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="function")
def db_session():
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    yield db
    db.close()
    Base.metadata.drop_all(bind=engine)


@pytest.mark.asyncio
async def test_process_fix_pr_success(db_session):
    # 1. Setup Mock DB Data
    tenant = Tenant(
        id="tenant-123",
        githubOrgId="12345",
        name="Test Org",
        appId="111",
        privateKey="encrypted_key",
    )
    db_session.add(tenant)
    db_session.commit()

    repo = Repository(
        id="repo-456", tenantId=tenant.id, githubRepoId="67890", name="docugardener-test"
    )
    db_session.add(repo)
    db_session.commit()

    job = Job(
        id="job-789",
        tenantId=tenant.id,
        repositoryId=repo.id,
        prNumber=42,
        status=JobStatus.COMPLETED,
        triageStatus=TriageStatus.ACCEPTED,
        result={
            "drift_score": 85,
            "head_sha": "abc123def456",
            "base_ref": "main",
            "repo_full_name": "TestOrg/docugardener-test",
            "documentation_updates": [{"file_path": "docs/README.md", "content": "# Updated Docs"}],
        },
    )
    db_session.add(job)
    db_session.commit()

    # 2. Patch dependencies
    # job_manager is a module-level singleton whose _session_factory was bound
    # at import time to the real Postgres engine. Redirect it to the SQLite
    # engine so update_status / complete_job don't hit real Postgres.
    # Each call gets a fresh session (job_manager closes sessions after use).
    from src.pipeline.job_manager import job_manager as _jm

    _original_factory = _jm._session_factory
    _jm._session_factory = TestingSessionLocal

    with (
        patch("src.pipeline.job_manager.get_db") as mock_get_db,
        patch("src.github.app.get_installation_token") as mock_get_token,
        patch("src.security.encryption.decrypt_credential", return_value="decrypted_key"),
        patch("src.github.committer.GitCommitter") as MockGitCommitter,
    ):
        # Override the get_db generator to yield our test session
        mock_get_db.return_value = iter([db_session])
        mock_get_token.return_value = "mock_github_token"

        # Setup mock GitCommitter instance
        mock_committer_instance = MagicMock()
        mock_committer_instance.find_open_fix_pr.return_value = None  # no existing dedup PR
        mock_committer_instance.apply_and_push.return_value = "docugardener/fix-42-xyz"
        mock_committer_instance.create_pr.return_value = (
            "https://github.com/TestOrg/docugardener-test/pull/43"
        )
        MockGitCommitter.return_value = mock_committer_instance

        # 3. Execute the function
        await process_fix_pr(job.id)

        # 4. Verify the side effects
        # Re-query rather than refresh — job_manager closes its session after
        # committing, which detaches the original instance from db_session.
        from src.storage.sql_models import Job as _Job

        updated_job = db_session.query(_Job).filter(_Job.id == job.id).first()

        # Did GitCommitter get instantiated correctly?
        MockGitCommitter.assert_called_once_with(
            installation_token="mock_github_token", owner="TestOrg", repo="docugardener-test"
        )

        # Were the updates parsed?
        args, kwargs = mock_committer_instance.apply_and_push.call_args
        analysis_result = args[0]
        assert analysis_result.pr_number == 42
        assert len(analysis_result.documentation_updates) == 1
        assert analysis_result.documentation_updates[0].file_path == "docs/README.md"
        assert analysis_result.documentation_updates[0].content == "# Updated Docs"

        # Was the PR created? (check positional args; kwargs may include extras)
        mock_committer_instance.create_pr.assert_called_once()
        pr_args, pr_kwargs = mock_committer_instance.create_pr.call_args
        assert pr_args[:3] == ("docugardener/fix-42-xyz", 42, "main")

        # Was the database updated?
        assert updated_job.fixPrUrl == "https://github.com/TestOrg/docugardener-test/pull/43"

    # Restore original factory so other tests are not affected
    _jm._session_factory = _original_factory


@pytest.mark.asyncio
async def test_process_fix_pr_tenant_missing_org(db_session):
    # Setup job with NO repository result (simulating a broken state)
    tenant = Tenant(id="tenant-bad", githubOrgId="123", name="Bad Tenant")
    db_session.add(tenant)
    db_session.commit()

    repo = Repository(id="repo-1", tenantId=tenant.id, githubRepoId="1", name="repo")
    db_session.add(repo)
    db_session.commit()

    job = Job(
        id="job-bad",
        tenantId=tenant.id,
        repositoryId=repo.id,
        prNumber=1,
        status=JobStatus.QUEUED,
        result={},
    )
    db_session.add(job)
    db_session.commit()

    with (
        patch("src.pipeline.handler.job_manager") as mock_jm,
        patch("src.pipeline.job_manager.get_db") as mock_get_db,
    ):
        mock_get_db.return_value = iter([db_session])

        # Manually trigger the failure side effect on the mock or capture it
        def side_effect_fail(jid, err):
            job.status = JobStatus.FAILED
            job.error = err
            db_session.commit()

        mock_jm.fail_job.side_effect = side_effect_fail

        await process_fix_pr(job.id)

        db_session.refresh(job)
        assert job.status == JobStatus.FAILED
        assert "Missing analysis results" in job.error


@pytest.mark.asyncio
async def test_process_fix_pr_committer_fails(db_session):
    tenant = Tenant(
        id="tenant-fail", githubOrgId="123", name="Org", appId="111", privateKey="enc-key"
    )
    db_session.add(tenant)
    db_session.commit()

    repo = Repository(id="repo-fail", tenantId=tenant.id, githubRepoId="1", name="repo")
    db_session.add(repo)
    db_session.commit()

    job = Job(
        id="job-fail",
        tenantId=tenant.id,
        repositoryId=repo.id,
        prNumber=1,
        status=JobStatus.QUEUED,
        result={
            "repo_full_name": "Org/repo",
            "head_sha": "123",
            "base_ref": "main",
            "documentation_updates": [{"file_path": "a.md", "content": "b"}],
        },
    )
    db_session.add(job)
    db_session.commit()

    with (
        patch("src.pipeline.handler.job_manager") as mock_jm,
        patch("src.pipeline.job_manager.get_db") as mock_get_db,
        patch("src.github.app.get_installation_token") as mock_get_token,
        patch("src.security.encryption.decrypt_credential", return_value="decrypted"),
        patch("src.github.committer.GitCommitter") as MockGitCommitter,
    ):
        mock_get_db.return_value = iter([db_session])
        mock_get_token.return_value = "token"

        def side_effect_fail(jid, err):
            job.status = JobStatus.FAILED
            job.error = err
            db_session.commit()

        mock_jm.fail_job.side_effect = side_effect_fail

        mock_committer = MagicMock()
        mock_committer.find_open_fix_pr.return_value = None  # skip dedup guard
        mock_committer.apply_and_push.side_effect = Exception("Git error")
        MockGitCommitter.return_value = mock_committer

        # GAP-3: process_fix_pr now re-raises after fail_job so RQ sees the failure
        with pytest.raises(Exception, match="Git error|Auto-PR generation error"):
            await process_fix_pr(job.id)

        db_session.refresh(job)
        assert job.status == JobStatus.FAILED
        assert "Auto-PR generation error" in job.error
