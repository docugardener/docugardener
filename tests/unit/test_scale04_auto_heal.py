"""
SCALE-04: Auto-Healing (Ape Fights Ape) — process_pull_request() enqueue tests.

When:
  - workflow_config.autoHeal == True
  - result.drift_score >= autoHealAbove (default 80)
  - result.documentation_updates is non-empty

process_pull_request() must enqueue create_fix_pr_job(job_id) via RQ.

All other paths (autoHeal=False, low drift, no updates, enqueue error) must
NOT enqueue and must NOT raise — the auto-heal block is fire-and-forget.
"""

import contextlib
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.pipeline.handler import process_pull_request
from src.worker.context import TenantContext

# ── Constants ─────────────────────────────────────────────────────────────────

_INSTALL_ID = 99
_OWNER = "acme"
_REPO = "api"
_PR = 7
_BASE_SHA = "base-sha"
_HEAD_SHA = "head-sha"
_BASE_REF = "main"
_JOB_ID = "job-abc"

_CHANGED_FILES = [
    {
        "filename": "src/orders.py",
        "status": "modified",
        "additions": 10,
        "deletions": 2,
        "patch": "@@ -1 +1 @@\n+def fn(): pass",
    }
]


# ── Helpers ───────────────────────────────────────────────────────────────────


def _make_tenant_ctx(workflow_config=None) -> TenantContext:
    return TenantContext(
        tenant_id="t-1",
        app_id="123456",  # must be numeric — int() conversion in handler
        private_key="pk",
        llm_config=None,
        notification_config=None,
        workflow_config=workflow_config,
    )


def _make_result(drift_score: int = 90, has_updates: bool = True) -> MagicMock:
    """Build a mock PRAnalysisResult."""
    result = MagicMock()
    result.success = True
    result.error = None
    result.drift_score = drift_score
    result.documentation_updates = (
        [MagicMock(file_path="docs/api.md", content="# Updated")] if has_updates else []
    )

    da = MagicMock()
    da.drift_score = drift_score
    da.severity = "significant"
    da.summary = "Logic changed"
    da.required_updates = []  # empty → skip NotificationDispatcher path
    da.items = []
    result.drift_analysis = da

    return result


@contextlib.contextmanager
def _run_handler(tenant_ctx: TenantContext, analysis_result: MagicMock, mock_queue: MagicMock):
    """
    Patch all heavy external I/O, yield (mock_jm, mock_analyzer) for assertion.
    """
    mock_jm = MagicMock()
    mock_jm.get_or_create_repo.return_value = "repo-id"
    mock_jm.create_job.return_value = _JOB_ID

    mock_analyzer_instance = MagicMock()
    mock_analyzer_instance.analyze_pr = AsyncMock(return_value=analysis_result)
    mock_analyzer_cls = MagicMock(return_value=mock_analyzer_instance)

    mock_reporter_instance = MagicMock()
    mock_reporter_instance.report_to_pr = AsyncMock()
    mock_reporter_cls = MagicMock(return_value=mock_reporter_instance)

    with (
        patch("src.pipeline.handler.get_installation_token", return_value="token"),
        patch("src.pipeline.handler.load_repo_config", return_value={}),
        patch("src.pipeline.handler.get_tenant_context", return_value=tenant_ctx),
        patch("src.pipeline.handler.set_tenant_id"),
        patch(
            "src.pipeline.handler.create_initial_check_run",
            new=AsyncMock(return_value=123),
        ),
        patch("src.pipeline.handler.job_manager", mock_jm),
        patch("src.pipeline.handler.PRAnalyzer", mock_analyzer_cls),
        patch("src.pipeline.handler.GitHubReporter", mock_reporter_cls),
        patch("src.pipeline.handler.NotificationDispatcher"),
        patch("src.worker.queue.get_queue", return_value=mock_queue),
        patch("src.worker.jobs.create_fix_pr_job"),
    ):
        yield mock_jm, mock_analyzer_instance


# ── Tests ─────────────────────────────────────────────────────────────────────


class TestScale04AutoHeal:
    @pytest.mark.asyncio
    async def test_autoheal_enabled_high_drift_enqueues(self):
        """
        autoHeal=True and drift_score=90 (>= default 80) with doc updates
        → enqueue called exactly once with the job_id.
        """
        wf_config = {"autoHeal": True}
        tenant_ctx = _make_tenant_ctx(wf_config)
        analysis_result = _make_result(drift_score=90, has_updates=True)
        mock_queue = MagicMock()

        with _run_handler(tenant_ctx, analysis_result, mock_queue):
            await process_pull_request(
                installation_id=_INSTALL_ID,
                owner=_OWNER,
                repo=_REPO,
                pr_number=_PR,
                action="opened",
                base_sha=_BASE_SHA,
                head_sha=_HEAD_SHA,
                changed_files=_CHANGED_FILES,
                base_ref=_BASE_REF,
            )

        mock_queue.enqueue.assert_called_once()
        call_args = mock_queue.enqueue.call_args
        # First positional arg is the job function (create_fix_pr_job)
        # Second positional arg is job_id
        assert call_args.args[1] == _JOB_ID

    @pytest.mark.asyncio
    async def test_autoheal_disabled_does_not_enqueue(self):
        """
        autoHeal=False → enqueue must not be called, even with high drift.
        """
        wf_config = {"autoHeal": False}
        tenant_ctx = _make_tenant_ctx(wf_config)
        analysis_result = _make_result(drift_score=95, has_updates=True)
        mock_queue = MagicMock()

        with _run_handler(tenant_ctx, analysis_result, mock_queue):
            await process_pull_request(
                installation_id=_INSTALL_ID,
                owner=_OWNER,
                repo=_REPO,
                pr_number=_PR,
                action="opened",
                base_sha=_BASE_SHA,
                head_sha=_HEAD_SHA,
                changed_files=_CHANGED_FILES,
                base_ref=_BASE_REF,
            )

        mock_queue.enqueue.assert_not_called()

    @pytest.mark.asyncio
    async def test_autoheal_no_workflow_config_does_not_enqueue(self):
        """
        workflow_config is None → auto-heal block is skipped entirely.
        """
        tenant_ctx = _make_tenant_ctx(workflow_config=None)
        analysis_result = _make_result(drift_score=90, has_updates=True)
        mock_queue = MagicMock()

        with _run_handler(tenant_ctx, analysis_result, mock_queue):
            await process_pull_request(
                installation_id=_INSTALL_ID,
                owner=_OWNER,
                repo=_REPO,
                pr_number=_PR,
                action="opened",
                base_sha=_BASE_SHA,
                head_sha=_HEAD_SHA,
                changed_files=_CHANGED_FILES,
                base_ref=_BASE_REF,
            )

        mock_queue.enqueue.assert_not_called()

    @pytest.mark.asyncio
    async def test_autoheal_drift_below_threshold_does_not_enqueue(self):
        """
        autoHeal=True but drift_score=70 < default threshold 80 → no enqueue.
        """
        wf_config = {"autoHeal": True}
        tenant_ctx = _make_tenant_ctx(wf_config)
        analysis_result = _make_result(drift_score=70, has_updates=True)
        mock_queue = MagicMock()

        with _run_handler(tenant_ctx, analysis_result, mock_queue):
            await process_pull_request(
                installation_id=_INSTALL_ID,
                owner=_OWNER,
                repo=_REPO,
                pr_number=_PR,
                action="opened",
                base_sha=_BASE_SHA,
                head_sha=_HEAD_SHA,
                changed_files=_CHANGED_FILES,
                base_ref=_BASE_REF,
            )

        mock_queue.enqueue.assert_not_called()

    @pytest.mark.asyncio
    async def test_autoheal_no_doc_updates_does_not_enqueue(self):
        """
        autoHeal=True, high drift, but NO documentation_updates → no enqueue.
        The guard `result.documentation_updates` must be checked first.
        """
        wf_config = {"autoHeal": True}
        tenant_ctx = _make_tenant_ctx(wf_config)
        analysis_result = _make_result(drift_score=90, has_updates=False)
        mock_queue = MagicMock()

        with _run_handler(tenant_ctx, analysis_result, mock_queue):
            await process_pull_request(
                installation_id=_INSTALL_ID,
                owner=_OWNER,
                repo=_REPO,
                pr_number=_PR,
                action="opened",
                base_sha=_BASE_SHA,
                head_sha=_HEAD_SHA,
                changed_files=_CHANGED_FILES,
                base_ref=_BASE_REF,
            )

        mock_queue.enqueue.assert_not_called()

    @pytest.mark.asyncio
    async def test_autoheal_custom_threshold_respected(self):
        """
        autoHealAbove=70 and drift_score=75 → threshold met → enqueue called.
        """
        wf_config = {"autoHeal": True, "autoHealAbove": 70}
        tenant_ctx = _make_tenant_ctx(wf_config)
        analysis_result = _make_result(drift_score=75, has_updates=True)
        mock_queue = MagicMock()

        with _run_handler(tenant_ctx, analysis_result, mock_queue):
            await process_pull_request(
                installation_id=_INSTALL_ID,
                owner=_OWNER,
                repo=_REPO,
                pr_number=_PR,
                action="opened",
                base_sha=_BASE_SHA,
                head_sha=_HEAD_SHA,
                changed_files=_CHANGED_FILES,
                base_ref=_BASE_REF,
            )

        mock_queue.enqueue.assert_called_once()

    @pytest.mark.asyncio
    async def test_autoheal_custom_threshold_not_met_does_not_enqueue(self):
        """
        autoHealAbove=90 and drift_score=85 → below threshold → no enqueue.
        """
        wf_config = {"autoHeal": True, "autoHealAbove": 90}
        tenant_ctx = _make_tenant_ctx(wf_config)
        analysis_result = _make_result(drift_score=85, has_updates=True)
        mock_queue = MagicMock()

        with _run_handler(tenant_ctx, analysis_result, mock_queue):
            await process_pull_request(
                installation_id=_INSTALL_ID,
                owner=_OWNER,
                repo=_REPO,
                pr_number=_PR,
                action="opened",
                base_sha=_BASE_SHA,
                head_sha=_HEAD_SHA,
                changed_files=_CHANGED_FILES,
                base_ref=_BASE_REF,
            )

        mock_queue.enqueue.assert_not_called()

    @pytest.mark.asyncio
    async def test_autoheal_enqueue_exception_does_not_raise(self):
        """
        If get_queue().enqueue() raises, the exception must be swallowed —
        auto-heal failures must never fail the main PR analysis flow.
        """
        wf_config = {"autoHeal": True}
        tenant_ctx = _make_tenant_ctx(wf_config)
        analysis_result = _make_result(drift_score=90, has_updates=True)
        mock_queue = MagicMock()
        mock_queue.enqueue.side_effect = RuntimeError("Redis is down")

        # Must not raise
        with _run_handler(tenant_ctx, analysis_result, mock_queue):
            result = await process_pull_request(
                installation_id=_INSTALL_ID,
                owner=_OWNER,
                repo=_REPO,
                pr_number=_PR,
                action="opened",
                base_sha=_BASE_SHA,
                head_sha=_HEAD_SHA,
                changed_files=_CHANGED_FILES,
                base_ref=_BASE_REF,
            )

        assert result.success is True  # Main flow completed

    @pytest.mark.asyncio
    async def test_autoheal_exact_default_threshold_enqueues(self):
        """
        drift_score == autoHealAbove (80 == 80) → condition is >= → enqueue.
        """
        wf_config = {"autoHeal": True}
        tenant_ctx = _make_tenant_ctx(wf_config)
        analysis_result = _make_result(drift_score=80, has_updates=True)
        mock_queue = MagicMock()

        with _run_handler(tenant_ctx, analysis_result, mock_queue):
            await process_pull_request(
                installation_id=_INSTALL_ID,
                owner=_OWNER,
                repo=_REPO,
                pr_number=_PR,
                action="opened",
                base_sha=_BASE_SHA,
                head_sha=_HEAD_SHA,
                changed_files=_CHANGED_FILES,
                base_ref=_BASE_REF,
            )

        mock_queue.enqueue.assert_called_once()
