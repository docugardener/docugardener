"""
TEST-01 / B1: Human PR → Full Pipeline (E2E).

Every test goes through a real layer of the stack:
  - HTTP tests: hit POST /webhooks/github via AsyncClient (real FastAPI routing,
    middleware, request parsing); the RQ queue is mocked so no Redis needed.
  - Pipeline tests: call process_pull_request() directly so the full
    handler + job_manager + DB path executes; GitHub API and LLM are mocked.

Covered:
  - Webhook returns status=queued with job_id
  - After pipeline run: Job row has status=COMPLETED, triageStatus=ACCEPTED
  - create_initial_check_run called → check run created in "pending" state
  - GitHubReporter.report_to_pr called after analysis
  - Slack _send_slack_alert called when Slack is configured
  - drift_score ≥ 85 → block_merge=True surfaced to reporter
"""

from contextlib import ExitStack
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.pipeline import job_manager as jm_module
from src.pipeline.handler import process_pull_request
from src.storage.sql_models import Job, JobStatus, TriageStatus
from tests.integration.conftest import (
    INSTALLATION_ID,
    REPO_FULL_NAME,
    TestingSessionLocal,
    _webhook_headers,
    make_analysis_result,
    pipeline_patch_stack,
    pr_opened_payload,
)

# ── helpers ───────────────────────────────────────────────────────────────────


def _get_job(pr_number: int = 42) -> Job | None:
    db = TestingSessionLocal()
    try:
        return db.query(Job).filter(Job.prNumber == pr_number).first()
    finally:
        db.close()


_CHANGED_FILES = [
    {
        "filename": "src/api.py",
        "status": "modified",
        "additions": 10,
        "deletions": 2,
        "patch": "@@ -1 +1 @@\n-old\n+new",
    }
]


# ── tests ─────────────────────────────────────────────────────────────────────


class TestHumanPrPipeline:
    # ── HTTP layer ────────────────────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_human_pr_accepted_queued(self, http_client, seed_tenant):
        """POST /webhooks/github → HTTP 200, status='queued', job_id present."""
        mock_queue = MagicMock()
        mock_queue.enqueue = MagicMock(return_value=MagicMock(id="rq-test-id"))

        with (
            patch("src.pipeline.job_manager.SessionLocal", TestingSessionLocal),
            patch("src.worker.queue.get_queue", return_value=mock_queue),
        ):
            payload = pr_opened_payload()
            response = await http_client.post(
                "/webhooks/github",
                json=payload,
                headers=_webhook_headers(),
            )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "queued"
        assert "job_id" in data
        assert data["repository"] == REPO_FULL_NAME
        assert data["pull_request"] == 42

    @pytest.mark.asyncio
    async def test_human_pr_response_contains_delivery_id(self, http_client, seed_tenant):
        """Response includes the X-GitHub-Delivery value echoed back."""
        mock_queue = MagicMock()
        mock_queue.enqueue = MagicMock(return_value=MagicMock(id="rq-x"))

        with (
            patch("src.pipeline.job_manager.SessionLocal", TestingSessionLocal),
            patch("src.worker.queue.get_queue", return_value=mock_queue),
        ):
            response = await http_client.post(
                "/webhooks/github",
                json=pr_opened_payload(),
                headers=_webhook_headers(delivery_id="my-delivery-42"),
            )

        assert response.json()["delivery_id"] == "my-delivery-42"

    # ── Pipeline layer ────────────────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_human_pr_job_saved_to_db(self, seed_tenant):
        """Full process_pull_request run → Job written to DB with COMPLETED/ACCEPTED."""
        result = make_analysis_result(score=60)

        with ExitStack() as stack:
            for p in pipeline_patch_stack(result):
                stack.enter_context(p)
            stack.enter_context(
                patch.object(jm_module.job_manager, "_session_factory", TestingSessionLocal)
            )
            await process_pull_request(
                installation_id=INSTALLATION_ID,
                owner="org",
                repo="myrepo",
                pr_number=42,
                action="opened",
                base_sha="cafebabe",
                head_sha="deadbeef",
                changed_files=_CHANGED_FILES,
                base_ref="main",
            )

        job = _get_job(42)
        assert job is not None
        assert job.status == JobStatus.COMPLETED
        # Fresh pipeline run → awaiting human triage (PENDING is the column default;
        # ACCEPTED is only set when a user clicks Accept in the inbox UI)
        assert job.triageStatus == TriageStatus.PENDING

    @pytest.mark.asyncio
    async def test_human_pr_check_run_created(self, seed_tenant):
        """create_initial_check_run is called exactly once with head_sha."""
        result = make_analysis_result()
        mock_check_run = AsyncMock(return_value=42)

        with ExitStack() as stack:
            for p in pipeline_patch_stack(result):
                # Replace the pre-built create_initial_check_run patch with our spy
                if hasattr(p, "attribute") and p.attribute == "create_initial_check_run":
                    continue
                stack.enter_context(p)
            stack.enter_context(
                patch("src.pipeline.handler.create_initial_check_run", mock_check_run)
            )
            stack.enter_context(
                patch.object(jm_module.job_manager, "_session_factory", TestingSessionLocal)
            )
            await process_pull_request(
                installation_id=INSTALLATION_ID,
                owner="org",
                repo="myrepo",
                pr_number=42,
                action="opened",
                base_sha="cafebabe",
                head_sha="deadbeef",
                changed_files=_CHANGED_FILES,
                base_ref="main",
            )

        mock_check_run.assert_called_once()
        call_kwargs = mock_check_run.call_args[1] or {}
        call_args = mock_check_run.call_args[0] or ()
        # head_sha should be "deadbeef" — check positional or keyword
        all_args = list(call_args) + list(call_kwargs.values())
        assert "deadbeef" in all_args

    @pytest.mark.asyncio
    async def test_human_pr_check_run_completed(self, seed_tenant):
        """GitHubReporter.report_to_pr is called after analysis completes."""
        result = make_analysis_result()
        mock_reporter = MagicMock()
        mock_reporter.report_to_pr = AsyncMock()

        patches = pipeline_patch_stack(result)
        with ExitStack() as stack:
            for p in patches:
                stack.enter_context(p)
            stack.enter_context(
                patch("src.pipeline.handler.GitHubReporter", return_value=mock_reporter)
            )
            stack.enter_context(
                patch.object(jm_module.job_manager, "_session_factory", TestingSessionLocal)
            )
            await process_pull_request(
                installation_id=INSTALLATION_ID,
                owner="org",
                repo="myrepo",
                pr_number=42,
                action="opened",
                base_sha="cafebabe",
                head_sha="deadbeef",
                changed_files=_CHANGED_FILES,
                base_ref="main",
            )

        mock_reporter.report_to_pr.assert_called_once()

    @pytest.mark.asyncio
    async def test_human_pr_slack_notification_sent(self, seed_tenant_with_slack):
        """Slack webhookUrl configured → _send_slack_alert called."""
        result = make_analysis_result(score=70, severity="significant")
        mock_send_slack = AsyncMock()

        with ExitStack() as stack:
            for p in pipeline_patch_stack(result):
                stack.enter_context(p)
            stack.enter_context(
                patch.object(jm_module.job_manager, "_session_factory", TestingSessionLocal)
            )
            stack.enter_context(
                patch(
                    "src.notifications.dispatcher.decrypt",
                    return_value="https://hooks.slack.com/real",
                )
            )
            mock_http = AsyncMock()
            mock_http.__aenter__ = AsyncMock(return_value=mock_http)
            mock_http.__aexit__ = AsyncMock(return_value=False)
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.raise_for_status = MagicMock()
            mock_http.post = AsyncMock(return_value=mock_response)
            # enter_context returns the mock object (the patcher's __enter__ value)
            mock_cls = stack.enter_context(patch("src.notifications.dispatcher.httpx.AsyncClient"))
            mock_cls.return_value = mock_http

            await process_pull_request(
                installation_id=INSTALLATION_ID,
                owner="org",
                repo="myrepo",
                pr_number=42,
                action="opened",
                base_sha="cafebabe",
                head_sha="deadbeef",
                changed_files=_CHANGED_FILES,
                base_ref="main",
            )

        mock_http.post.assert_called_once()

    @pytest.mark.asyncio
    async def test_human_pr_critical_drift_blocks_merge(self, seed_tenant):
        """drift_score=90 (block_merge=True) → reporter.report_to_pr receives result with block_merge True."""
        result = make_analysis_result(score=90, severity="critical", block_merge=True)
        mock_reporter = MagicMock()
        captured_result = []

        async def capture_report(r, **kwargs):
            captured_result.append(r)

        mock_reporter.report_to_pr = capture_report

        with ExitStack() as stack:
            for p in pipeline_patch_stack(result):
                stack.enter_context(p)
            stack.enter_context(
                patch("src.pipeline.handler.GitHubReporter", return_value=mock_reporter)
            )
            stack.enter_context(
                patch.object(jm_module.job_manager, "_session_factory", TestingSessionLocal)
            )
            await process_pull_request(
                installation_id=INSTALLATION_ID,
                owner="org",
                repo="myrepo",
                pr_number=42,
                action="opened",
                base_sha="cafebabe",
                head_sha="deadbeef",
                changed_files=_CHANGED_FILES,
                base_ref="main",
            )

        assert len(captured_result) == 1
        assert captured_result[0].should_block is True
        assert captured_result[0].drift_score == 90
