"""
EPIC-05: AI Author Mode bypass — process_pull_request() enqueue tests.

When:
  - ai_authored=True
  - workflow_config.aiAuthorMode == True
  - result.documentation_updates is non-empty

process_pull_request() must enqueue create_fix_pr_job(job_id, auto_merge=...).

All other paths (aiAuthorMode=False, ai_authored=False, no updates, enqueue
error) must NOT enqueue and must NOT raise — the bypass block is fire-and-forget.

Also verifies EPIC-05 and SCALE-04 do NOT both enqueue (double-enqueue guard).
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.pipeline.handler import process_pull_request
from src.worker.context import TenantContext

# ── Constants ─────────────────────────────────────────────────────────────────

_INSTALL_ID = 42
_OWNER = "acme"
_REPO = "api"
_PR = 11
_BASE_SHA = "base-sha"
_HEAD_SHA = "head-sha"
_BASE_REF = "main"
_JOB_ID = "job-ai-001"

_CHANGED_FILES = [
    {
        "filename": "src/auth.py",
        "status": "modified",
        "additions": 20,
        "deletions": 5,
        "patch": "@@ -1 +1 @@\n+def login(): pass",
    }
]


# ── Helpers ───────────────────────────────────────────────────────────────────


def _null_session():
    """
    Return a mock DB session whose query().filter().first() returns None.

    Used to neutralise the defense-in-depth idempotency check in handler.py so
    it doesn't find a spurious MagicMock as a "pre-existing job" (which would
    bypass create_job and break the _JOB_ID assertion).
    """
    sess = MagicMock()
    sess.query.return_value.filter.return_value.first.return_value = None
    sess.query.return_value.filter.return_value.order_by.return_value.first.return_value = None
    sess.__enter__ = MagicMock(return_value=sess)
    sess.__exit__ = MagicMock(return_value=False)
    sess.close = MagicMock()
    sess.commit = MagicMock()
    sess.rollback = MagicMock()
    return sess


def _make_tenant_ctx(workflow_config=None) -> TenantContext:
    return TenantContext(
        tenant_id="t-epic05",
        app_id="123456",  # must be numeric — int() conversion in handler
        private_key="pk",
        llm_config=None,
        notification_config=None,
        workflow_config=workflow_config,
    )


def _make_result(drift_score: int = 85, has_updates: bool = True) -> MagicMock:
    result = MagicMock()
    result.success = True
    result.error = None
    result.drift_score = drift_score
    result.documentation_updates = (
        [MagicMock(file_path="docs/auth.md", content="# Updated Auth")] if has_updates else []
    )
    da = MagicMock()
    da.drift_score = drift_score
    da.severity = "significant"
    da.summary = "Auth API changed"
    da.required_updates = []
    da.items = []
    result.drift_analysis = da
    return result


def _handler_patches(tenant_ctx: TenantContext, analysis_result: MagicMock, mock_queue: MagicMock):
    """Return context manager that patches all external I/O for process_pull_request."""
    mock_jm = MagicMock()
    mock_jm.get_or_create_repo.return_value = "repo-id"
    mock_jm.create_job.return_value = _JOB_ID

    mock_analyzer_instance = MagicMock()
    mock_analyzer_instance.analyze_pr = AsyncMock(return_value=analysis_result)
    mock_analyzer_cls = MagicMock(return_value=mock_analyzer_instance)

    mock_reporter_instance = MagicMock()
    mock_reporter_instance.report_to_pr = AsyncMock()
    mock_reporter_cls = MagicMock(return_value=mock_reporter_instance)

    return patch.multiple(
        "src.pipeline.handler",
        get_installation_token=MagicMock(return_value="token"),
        load_repo_config=MagicMock(return_value={}),
        get_tenant_context=MagicMock(return_value=tenant_ctx),
        set_tenant_id=MagicMock(),
        create_initial_check_run=AsyncMock(return_value=123),
        job_manager=mock_jm,
        PRAnalyzer=mock_analyzer_cls,
        GitHubReporter=mock_reporter_cls,
        NotificationDispatcher=MagicMock(),
        **{
            "src.worker.queue.get_queue": MagicMock(return_value=mock_queue),
        }
        if False
        else {},  # queue patched separately below
    )


async def _run(workflow_config, analysis_result, mock_queue, ai_authored=True):
    """Run process_pull_request with standard test parameters."""
    tenant_ctx = _make_tenant_ctx(workflow_config)
    mock_jm = MagicMock()
    mock_jm.get_or_create_repo.return_value = "repo-id"
    mock_jm.create_job.return_value = _JOB_ID
    mock_analyzer_instance = MagicMock()
    mock_analyzer_instance.analyze_pr = AsyncMock(return_value=analysis_result)
    mock_reporter_instance = MagicMock()
    mock_reporter_instance.report_to_pr = AsyncMock()

    with (
        patch("src.pipeline.handler.get_installation_token", return_value="token"),
        patch("src.pipeline.handler.load_repo_config", return_value={}),
        patch("src.pipeline.handler.get_tenant_context", return_value=tenant_ctx),
        patch("src.pipeline.handler.set_tenant_id"),
        patch("src.pipeline.handler.create_initial_check_run", new=AsyncMock(return_value=123)),
        patch("src.pipeline.handler.job_manager", mock_jm),
        patch("src.pipeline.handler.PRAnalyzer", MagicMock(return_value=mock_analyzer_instance)),
        patch(
            "src.pipeline.handler.GitHubReporter", MagicMock(return_value=mock_reporter_instance)
        ),
        patch("src.pipeline.handler.NotificationDispatcher"),
        patch("src.worker.queue.get_queue", return_value=mock_queue),
        patch("src.worker.jobs.create_fix_pr_job"),
        # Suppress DB session calls (aiAuthored update + defense-in-depth idem check).
        # Returning None from first() ensures the defense-in-depth guard does NOT
        # find a pre-existing job, so create_job() is called and _JOB_ID is used.
        patch(
            "src.pipeline.job_manager.SessionLocal",
            return_value=_null_session(),
        ),
    ):
        return await process_pull_request(
            installation_id=_INSTALL_ID,
            owner=_OWNER,
            repo=_REPO,
            pr_number=_PR,
            action="opened",
            base_sha=_BASE_SHA,
            head_sha=_HEAD_SHA,
            changed_files=_CHANGED_FILES,
            base_ref=_BASE_REF,
            ai_authored=ai_authored,
        )


# ── Tests ─────────────────────────────────────────────────────────────────────


class TestEpic05AiBypass:
    @pytest.mark.asyncio
    async def test_ai_authored_with_mode_enabled_enqueues(self):
        """
        ai_authored=True + aiAuthorMode=True + doc updates → enqueue called once.
        """
        wf = {"aiAuthorMode": True}
        result = _make_result(has_updates=True)
        queue = MagicMock()

        await _run(wf, result, queue, ai_authored=True)

        queue.enqueue.assert_called_once()
        call_kwargs = queue.enqueue.call_args
        # Second positional arg is the job_id
        assert call_kwargs.args[1] == _JOB_ID

    @pytest.mark.asyncio
    async def test_auto_merge_false_by_default(self):
        """
        autoMergeAiDocs not set → auto_merge kwarg must be False.
        """
        wf = {"aiAuthorMode": True}
        result = _make_result(has_updates=True)
        queue = MagicMock()

        await _run(wf, result, queue, ai_authored=True)

        call_kwargs = queue.enqueue.call_args
        assert call_kwargs.kwargs.get("auto_merge") is False

    @pytest.mark.asyncio
    async def test_auto_merge_true_when_configured(self):
        """
        autoMergeAiDocs=True → auto_merge=True passed to the enqueued job.
        """
        wf = {"aiAuthorMode": True, "autoMergeAiDocs": True}
        result = _make_result(has_updates=True)
        queue = MagicMock()

        await _run(wf, result, queue, ai_authored=True)

        call_kwargs = queue.enqueue.call_args
        assert call_kwargs.kwargs.get("auto_merge") is True

    @pytest.mark.asyncio
    async def test_ai_mode_disabled_does_not_enqueue(self):
        """
        aiAuthorMode=False → no enqueue even for AI-authored PR.
        """
        wf = {"aiAuthorMode": False}
        result = _make_result(has_updates=True)
        queue = MagicMock()

        await _run(wf, result, queue, ai_authored=True)

        queue.enqueue.assert_not_called()

    @pytest.mark.asyncio
    async def test_human_authored_pr_not_bypassed(self):
        """
        ai_authored=False → EPIC-05 block skipped entirely.
        """
        wf = {"aiAuthorMode": True}
        result = _make_result(has_updates=True)
        queue = MagicMock()

        await _run(wf, result, queue, ai_authored=False)

        # queue may be called by SCALE-04 if autoHeal is set, but not by EPIC-05
        # Since autoHeal is not in wf here, no enqueue at all.
        queue.enqueue.assert_not_called()

    @pytest.mark.asyncio
    async def test_no_doc_updates_does_not_enqueue(self):
        """
        ai_authored=True + aiAuthorMode=True but NO documentation_updates → no enqueue.
        """
        wf = {"aiAuthorMode": True}
        result = _make_result(has_updates=False)
        queue = MagicMock()

        await _run(wf, result, queue, ai_authored=True)

        queue.enqueue.assert_not_called()

    @pytest.mark.asyncio
    async def test_enqueue_exception_does_not_raise(self):
        """
        If enqueue() raises, the exception is swallowed.
        Main PR analysis result must still be returned successfully.
        """
        wf = {"aiAuthorMode": True}
        result = _make_result(has_updates=True)
        queue = MagicMock()
        queue.enqueue.side_effect = RuntimeError("Redis down")

        returned = await _run(wf, result, queue, ai_authored=True)

        assert returned.success is True  # Main flow completed

    @pytest.mark.asyncio
    async def test_epic05_prevents_scale04_double_enqueue(self):
        """
        When EPIC-05 enqueues a fix PR, SCALE-04 must NOT also enqueue.
        Both conditions are met (ai_authored=True, aiAuthorMode=True, autoHeal=True,
        drift_score >= autoHealAbove) — only ONE enqueue call must happen.
        """
        wf = {
            "aiAuthorMode": True,
            "autoHeal": True,
            "autoHealAbove": 80,
        }
        result = _make_result(drift_score=90, has_updates=True)
        queue = MagicMock()

        await _run(wf, result, queue, ai_authored=True)

        # Exactly ONE enqueue — EPIC-05, not SCALE-04
        assert queue.enqueue.call_count == 1
        call_kwargs = queue.enqueue.call_args
        # EPIC-05 passes auto_merge kwarg; SCALE-04 does not
        assert "auto_merge" in call_kwargs.kwargs
