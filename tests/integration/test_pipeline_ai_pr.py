"""
TEST-01 / B2: AI-Authored PR → EPIC-05 Bypass (E2E).

When a PR is detected as AI-authored AND the tenant has aiAuthorMode=True in
workflowConfig, process_pull_request should skip the human-review inbox and
immediately enqueue create_fix_pr_job.

Covered:
  - ai_authored=True + aiAuthorMode=True → create_fix_pr_job enqueued
  - job.aiAuthored flag set to True in DB
  - ai_authored=True + aiAuthorMode=False → no fix PR enqueued
  - autoMergeAiDocs=True → enqueue called with auto_merge=True kwarg
"""

import pytest
from contextlib import ExitStack
from unittest.mock import AsyncMock, MagicMock, call, patch

from src.pipeline.handler import process_pull_request
from src.storage.sql_models import Job, Tenant
from src.worker.jobs import create_fix_pr_job

from tests.integration.conftest import (
    INSTALLATION_ID,
    TENANT_ID,
    TestingSessionLocal,
    make_analysis_result,
    pipeline_patch_stack,
)
from src.pipeline import job_manager as jm_module


# ── helpers ───────────────────────────────────────────────────────────────────

_CHANGED_FILES = [
    {"filename": "src/service.py", "status": "modified", "additions": 5, "deletions": 1}
]


def _configure_tenant(ai_author_mode: bool = True, auto_merge: bool = False):
    db = TestingSessionLocal()
    try:
        t = db.query(Tenant).filter(Tenant.id == TENANT_ID).first()
        t.workflowConfig = {
            "aiAuthorMode": ai_author_mode,
            "autoMergeAiDocs": auto_merge,
        }
        db.commit()
    finally:
        db.close()


def _get_job() -> Job | None:
    db = TestingSessionLocal()
    try:
        return db.query(Job).filter(Job.prNumber == 77).first()
    finally:
        db.close()


async def _run_pipeline(analysis_result, ai_authored: bool, extra_patches=()):
    """Run process_pull_request with the standard mock stack + optional extras."""
    with ExitStack() as stack:
        for p in pipeline_patch_stack(analysis_result):
            stack.enter_context(p)
        for p in extra_patches:
            stack.enter_context(p)
        stack.enter_context(
            patch.object(jm_module.job_manager, "_session_factory", TestingSessionLocal)
        )
        await process_pull_request(
            installation_id=INSTALLATION_ID,
            owner="org",
            repo="myrepo",
            pr_number=77,
            action="opened",
            base_sha="aaa",
            head_sha="bbb",
            changed_files=_CHANGED_FILES,
            base_ref="main",
            ai_authored=ai_authored,
        )


# ── tests ─────────────────────────────────────────────────────────────────────

class TestAiPrEpic05Bypass:

    @pytest.mark.asyncio
    async def test_ai_pr_sets_ai_authored_flag_in_db(self, seed_tenant):
        """ai_authored=True → Job.aiAuthored = True written to DB."""
        _configure_tenant(ai_author_mode=False)  # aiAuthorMode off → no fix-PR side effects
        result = make_analysis_result(pr_number=77)

        await _run_pipeline(result, ai_authored=True)

        job = _get_job()
        assert job is not None
        assert job.aiAuthored is True

    @pytest.mark.asyncio
    async def test_ai_pr_bypasses_inbox_when_mode_enabled(self, seed_tenant):
        """ai_authored=True + aiAuthorMode=True → create_fix_pr_job enqueued."""
        _configure_tenant(ai_author_mode=True, auto_merge=False)
        result = make_analysis_result(pr_number=77, doc_updates=1)

        captured_enqueue_calls: list = []
        mock_queue = MagicMock()
        def capture_enqueue(fn, *args, **kwargs):
            captured_enqueue_calls.append((fn, args, kwargs))
            return MagicMock(id="fix-rq-job")
        mock_queue.enqueue = capture_enqueue

        await _run_pipeline(
            result,
            ai_authored=True,
            extra_patches=[
                patch("src.worker.queue.get_queue", return_value=mock_queue),
            ],
        )

        fix_pr_enqueues = [c for c in captured_enqueue_calls if c[0] is create_fix_pr_job]
        assert len(fix_pr_enqueues) == 1, (
            f"Expected create_fix_pr_job to be enqueued once, got: {captured_enqueue_calls}"
        )

    @pytest.mark.asyncio
    async def test_ai_pr_no_bypass_when_mode_disabled(self, seed_tenant):
        """ai_authored=True + aiAuthorMode=False → create_fix_pr_job NOT enqueued."""
        _configure_tenant(ai_author_mode=False)
        result = make_analysis_result(pr_number=77, doc_updates=1)

        captured_enqueue_calls: list = []
        mock_queue = MagicMock()
        def capture_enqueue(fn, *args, **kwargs):
            captured_enqueue_calls.append(fn)
            return MagicMock(id="rq-id")
        mock_queue.enqueue = capture_enqueue

        await _run_pipeline(
            result,
            ai_authored=True,
            extra_patches=[
                patch("src.worker.queue.get_queue", return_value=mock_queue),
            ],
        )

        assert create_fix_pr_job not in captured_enqueue_calls

    @pytest.mark.asyncio
    async def test_ai_pr_auto_merge_called_when_configured(self, seed_tenant):
        """autoMergeAiDocs=True → create_fix_pr_job enqueued with auto_merge=True."""
        _configure_tenant(ai_author_mode=True, auto_merge=True)
        result = make_analysis_result(pr_number=77, doc_updates=1)

        captured_enqueue_calls: list = []
        mock_queue = MagicMock()
        def capture_enqueue(fn, *args, **kwargs):
            captured_enqueue_calls.append((fn, args, kwargs))
            return MagicMock(id="fix-rq-id")
        mock_queue.enqueue = capture_enqueue

        await _run_pipeline(
            result,
            ai_authored=True,
            extra_patches=[
                patch("src.worker.queue.get_queue", return_value=mock_queue),
            ],
        )

        fix_pr_calls = [c for c in captured_enqueue_calls if c[0] is create_fix_pr_job]
        assert len(fix_pr_calls) == 1
        _, _, kwargs = fix_pr_calls[0]
        assert kwargs.get("auto_merge") is True
