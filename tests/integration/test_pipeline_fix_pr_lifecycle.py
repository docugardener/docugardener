"""
TEST-01 / B3: Fix PR Merged → Resolution Lifecycle (E2E).

Tests go through the REAL HTTP layer: POST /webhooks/github with a merged
pull_request event whose branch name follows the docugardener-fix-* pattern.
The router dispatches to handle_fix_pr_merged() which updates the DB.

Covered:
  - Fix PR merged → job.triageStatus = RESOLVED (HTTP + DB)
  - Non-fix branch merged → triageStatus unchanged (skipped)
  - Jira configured → post_jira_lifecycle_comment called with correct ticket key
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.storage.sql_models import Job, JobStatus, Repository, Tenant, TriageStatus
from tests.integration.conftest import (
    REPO_NAME,
    TENANT_ID,
    TestingSessionLocal,
    _webhook_headers,
    pr_merged_payload,
    signed_body,
)

# ── DB helpers ────────────────────────────────────────────────────────────────


def _get_triage_status(pr_number: int = 42) -> TriageStatus | None:
    db = TestingSessionLocal()
    try:
        job = db.query(Job).filter(Job.prNumber == pr_number).first()
        return job.triageStatus if job else None
    finally:
        db.close()


@pytest.fixture()
def seed_job(seed_tenant):
    """Seed a repo + job in COMPLETED/ACCEPTED state for the fix-PR lifecycle tests."""
    db = TestingSessionLocal()
    try:
        repo = Repository(
            id="repo-b3",
            tenantId=TENANT_ID,
            githubRepoId="55",
            name=REPO_NAME,
        )
        db.add(repo)
        db.commit()

        job = Job(
            id="job-b3",
            tenantId=TENANT_ID,
            repositoryId="repo-b3",
            prNumber=42,
            status=JobStatus.COMPLETED,
            triageStatus=TriageStatus.FIX_PR_OPEN,
            result={"drift_score": 70, "repo_full_name": "org/myrepo"},
        )
        db.add(job)
        db.commit()
        job_id = job.id
    finally:
        db.close()
    return job_id


@pytest.fixture()
def seed_job_with_jira(seed_tenant):
    """Seed tenant with Jira config + job that has a jira_ticket_key in result."""
    db = TestingSessionLocal()
    try:
        t = db.query(Tenant).filter(Tenant.id == TENANT_ID).first()
        t.workflowConfig = {
            "jira": {
                "host": "https://jira.example.com",
                "email": "bot@example.com",
                "apiToken": "enc-token",
            }
        }
        db.commit()

        repo = Repository(
            id="repo-b3-jira",
            tenantId=TENANT_ID,
            githubRepoId="66",
            name=REPO_NAME,
        )
        db.add(repo)
        db.commit()

        job = Job(
            id="job-b3-jira",
            tenantId=TENANT_ID,
            repositoryId="repo-b3-jira",
            prNumber=42,
            status=JobStatus.COMPLETED,
            triageStatus=TriageStatus.FIX_PR_OPEN,
            result={
                "drift_score": 75,
                "repo_full_name": "org/myrepo",
                "jira_ticket_key": "PROJ-123",
            },
        )
        db.add(job)
        db.commit()
        job_id = job.id
    finally:
        db.close()
    return job_id


# ── tests ─────────────────────────────────────────────────────────────────────


class TestFixPrLifecycle:
    @pytest.mark.asyncio
    async def test_fix_pr_merged_sets_resolved(self, http_client, seed_job):
        """
        POST /webhooks/github with action=closed + merged=True + fix branch
        → HTTP 200, status='resolved', job.triageStatus = RESOLVED.
        """
        with patch("src.pipeline.job_manager.SessionLocal", TestingSessionLocal):
            _body = signed_body(pr_merged_payload(head_ref="docugardener-fix-42-abc123"))
            response = await http_client.post(
                "/webhooks/github",
                content=_body,
                headers=_webhook_headers(body=_body),
            )

        assert response.status_code == 200
        assert response.json()["status"] == "resolved"
        assert _get_triage_status(42) == TriageStatus.RESOLVED

    @pytest.mark.asyncio
    async def test_non_docugardener_pr_merged_is_noop(self, http_client, seed_job):
        """
        POST /webhooks/github with action=closed + merged=True + regular branch
        → HTTP 200, status='skipped', triageStatus unchanged.
        """
        with patch("src.pipeline.job_manager.SessionLocal", TestingSessionLocal):
            _body = signed_body(pr_merged_payload(head_ref="feature/my-feature"))
            response = await http_client.post(
                "/webhooks/github",
                content=_body,
                headers=_webhook_headers(body=_body),
            )

        # The closed + non-fix branch still returns skipped (no HMAC, no queue needed)
        # handle_pull_request returns skipped for non-fix closed PRs
        assert response.status_code == 200
        assert _get_triage_status(42) == TriageStatus.FIX_PR_OPEN  # unchanged

    @pytest.mark.asyncio
    async def test_fix_pr_merged_posts_jira_comment(self, http_client, seed_job_with_jira):
        """
        Jira configured + jira_ticket_key in job result → post_jira_lifecycle_comment
        called with 'PROJ-123' and a message containing '✅'.
        """
        mock_dispatcher = MagicMock()
        mock_dispatcher.post_jira_lifecycle_comment = AsyncMock()

        with (
            patch("src.pipeline.job_manager.SessionLocal", TestingSessionLocal),
            patch("src.security.crypto.decrypt", return_value="fake-decrypted"),
            patch(
                "src.notifications.dispatcher.NotificationDispatcher", return_value=mock_dispatcher
            ),
        ):
            _body = signed_body(pr_merged_payload(head_ref="docugardener-fix-42-xyz"))
            response = await http_client.post(
                "/webhooks/github",
                content=_body,
                headers=_webhook_headers(body=_body),
            )

        assert response.status_code == 200
        mock_dispatcher.post_jira_lifecycle_comment.assert_called_once()
        ticket_arg = mock_dispatcher.post_jira_lifecycle_comment.call_args[0][0]
        assert ticket_arg == "PROJ-123"
        comment_arg = mock_dispatcher.post_jira_lifecycle_comment.call_args[0][1]
        assert "✅" in comment_arg
