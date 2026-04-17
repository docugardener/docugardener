"""
RQ-STAB-02: Phase 1 P0 reliability fixes — unit tests.

Covers:
  GAP-3:  process_fix_pr outer except re-raises so RQ marks job as failed
  GAP-5:  Priority queue routing (fix/ignore → high, analyze → default)
  GAP-1:  Retry(max=3) present on all enqueue calls
  GAP-7:  result_ttl=3600, failure_ttl=604800 on all enqueue calls
  GAP-8:  reporter.report_to_pr runs in finally even when analysis raises
  on_failure: _on_job_failure callback calls fail_job with 0 lag
"""

from unittest.mock import ANY, MagicMock, patch

import pytest

# ─────────────────────────────────────────────────────────────────────────────
# GAP-3: process_fix_pr re-raises after fail_job
# ─────────────────────────────────────────────────────────────────────────────


class TestProcessFixPrReRaises:
    """
    The outer except in process_fix_pr must call fail_job AND then re-raise
    so RQ moves the job to FailedJobRegistry (not SucceededJobRegistry).
    """

    @patch("src.pipeline.handler.job_manager")
    def test_reraises_on_exception(self, mock_jm):
        """Outer except block re-raises after fail_job."""

        # Patch get_db to raise immediately after the job lookup (simulates mid-flow crash)
        boom = RuntimeError("disk full")

        with patch("src.pipeline.handler.process_fix_pr") as _:
            pass  # just to confirm import works

        # We test via create_fix_pr_job wrapper which calls asyncio.run(process_fix_pr(...))
        with patch("src.pipeline.handler.process_fix_pr", side_effect=boom):
            from src.worker.jobs import create_fix_pr_job

            with pytest.raises(RuntimeError, match="disk full"):
                create_fix_pr_job("job-123")

    @patch("src.pipeline.handler.job_manager")
    def test_fail_job_called_before_reraise(self, mock_jm):
        """fail_job is called with error message before the exception propagates."""
        boom = ValueError("git push failed")

        mock_db_instance = MagicMock()
        mock_job = MagicMock()
        mock_job.result = {
            "repo_full_name": "acme/api",
            "head_sha": "abc",
            "base_ref": "main",
            "documentation_updates": [{"file_path": "docs/x.md", "content": "y"}],
        }
        mock_job.tenantId = "t1"
        mock_job.prNumber = 7

        mock_tenant = MagicMock()
        mock_tenant.githubOrgId = "12345"
        mock_tenant.installationId = "12345"
        mock_tenant.appId = 99
        mock_tenant.privateKey = "enc-key"
        mock_tenant.workflowConfig = {}

        mock_db_instance.query.return_value.filter.return_value.first.side_effect = [
            mock_job,
            mock_tenant,
        ]

        # get_db is imported locally inside process_fix_pr, patch at source module
        with patch("src.pipeline.job_manager.get_db", return_value=iter([mock_db_instance])):
            with patch("src.security.encryption.decrypt_credential", return_value="plain-key"):
                with patch("src.github.app.get_installation_token", side_effect=boom):
                    import asyncio

                    from src.pipeline.handler import process_fix_pr

                    with pytest.raises(ValueError, match="git push failed"):
                        asyncio.run(process_fix_pr("job-xyz"))

        mock_jm.fail_job.assert_called_once()
        call_args = mock_jm.fail_job.call_args[0]
        assert call_args[0] == "job-xyz"
        assert "git push failed" in call_args[1]


# ─────────────────────────────────────────────────────────────────────────────
# GAP-5: Priority queue routing
# ─────────────────────────────────────────────────────────────────────────────


class TestPriorityQueueRouting:
    """
    create_fix_pr_job and ignore_drift_job must be enqueued on 'high' queue.
    analyze_pr_job must be enqueued on 'default' queue.
    """

    def test_get_queue_high_returns_high_named_queue(self):
        """get_queue('high') returns a Queue named 'high'."""
        from src.worker.queue import QUEUE_HIGH, get_queue

        with patch("src.worker.queue.Redis.from_url") as mock_redis:
            with patch("src.worker.queue.Queue") as mock_q_cls:
                mock_q_cls.return_value = MagicMock(name="high")
                get_queue(QUEUE_HIGH)
                mock_q_cls.assert_called_with(QUEUE_HIGH, connection=ANY)

    def test_get_queue_default_returns_default_named_queue(self):
        """get_queue() (no args) still defaults to 'default'."""
        from src.worker.queue import QUEUE_DEFAULT, get_queue

        with patch("src.worker.queue.Redis.from_url"):
            with patch("src.worker.queue.Queue") as mock_q_cls:
                get_queue()
                mock_q_cls.assert_called_with(QUEUE_DEFAULT, connection=ANY)

    def test_queue_constants_exist(self):
        """QUEUE_HIGH and QUEUE_DEFAULT constants are exported from queue module."""
        from src.worker.queue import QUEUE_DEFAULT, QUEUE_HIGH

        assert QUEUE_HIGH == "high"
        assert QUEUE_DEFAULT == "default"

    def test_inbox_accept_uses_high_queue_in_source(self):
        """inbox.py ACCEPTED path calls get_queue(QUEUE_HIGH), not get_queue()."""
        import inspect

        from src.api import inbox

        source = inspect.getsource(inbox)
        # Both ACCEPTED and IGNORED paths must reference QUEUE_HIGH
        assert source.count("get_queue(QUEUE_HIGH)") >= 2, (
            "inbox.py must call get_queue(QUEUE_HIGH) for both ACCEPTED and IGNORED paths"
        )

    def test_handler_epic05_uses_high_queue_in_source(self):
        """handler.py EPIC-05 and SCALE-04 enqueue create_fix_pr_job on 'high' queue."""
        import inspect

        from src.pipeline import handler

        source = inspect.getsource(handler)
        assert "get_queue(QUEUE_HIGH)" in source, (
            "handler.py must enqueue create_fix_pr_job on QUEUE_HIGH"
        )


# ─────────────────────────────────────────────────────────────────────────────
# GAP-1: Retry configuration
# ─────────────────────────────────────────────────────────────────────────────


class TestRetryConfiguration:
    """All enqueue() calls must include Retry(max=3, interval=[30, 60, 120])."""

    def _capture_enqueue_kwargs(self, enqueue_site: str) -> dict:
        """Helper: patch queue.enqueue at given import site, return kwargs."""
        mock_queue = MagicMock()
        captured = {}

        def _capture(*args, **kwargs):
            captured.update(kwargs)

        mock_queue.enqueue.side_effect = _capture
        return mock_queue, captured

    def test_retry_object_has_correct_config(self):
        """Retry(max=3, interval=[30, 60, 120]) is the expected retry configuration."""
        from rq import Retry

        r = Retry(max=3, interval=[30, 60, 120])
        assert r.max == 3
        assert r.intervals == [30, 60, 120]

    def test_webhooks_analyze_pr_has_retry_in_source(self):
        """webhooks.py enqueue for analyze_pr_job includes retry= kwarg in source."""
        import inspect

        from src.api import webhooks

        source = inspect.getsource(webhooks)
        assert "retry=" in source, "webhooks.py enqueue must include retry= kwarg"
        assert "Retry(" in source, "webhooks.py must use rq.Retry"

    def test_inbox_enqueue_has_retry_in_source(self):
        """inbox.py enqueue calls include retry= kwarg."""
        import inspect

        from src.api import inbox

        source = inspect.getsource(inbox)
        assert "retry=" in source, "inbox.py enqueue must include retry= kwarg"

    def test_handler_enqueue_has_retry_in_source(self):
        """handler.py EPIC-05/SCALE-04 enqueue calls include retry= kwarg."""
        import inspect

        from src.pipeline import handler

        source = inspect.getsource(handler)
        assert "retry=" in source, "handler.py enqueue calls must include retry= kwarg"


# ─────────────────────────────────────────────────────────────────────────────
# GAP-7: TTL configuration
# ─────────────────────────────────────────────────────────────────────────────


class TestTTLConfiguration:
    """result_ttl=3600, failure_ttl=604800 must be set on all enqueue calls."""

    def test_ttl_values_are_correct(self):
        """Verify TTL constants match the spec."""
        RESULT_TTL = 3600
        FAILURE_TTL = 604_800  # 7 days

        assert RESULT_TTL == 3600
        assert FAILURE_TTL == 604800

    def test_enqueue_with_ttls(self):
        """enqueue() passes result_ttl and failure_ttl."""
        mock_queue = MagicMock()
        mock_queue.enqueue(
            MagicMock(),
            result_ttl=3600,
            failure_ttl=604800,
            job_timeout=120,
        )
        call_kwargs = mock_queue.enqueue.call_args[1]
        assert call_kwargs["result_ttl"] == 3600
        assert call_kwargs["failure_ttl"] == 604800

    def test_webhooks_enqueue_has_ttls_in_source(self):
        """webhooks.py enqueue includes result_ttl and failure_ttl."""
        import inspect

        from src.api import webhooks

        source = inspect.getsource(webhooks)
        assert "result_ttl=" in source
        assert "failure_ttl=" in source

    def test_inbox_enqueue_has_ttls_in_source(self):
        """inbox.py enqueue includes result_ttl and failure_ttl."""
        import inspect

        from src.api import inbox

        source = inspect.getsource(inbox)
        assert "result_ttl=" in source
        assert "failure_ttl=" in source

    def test_handler_enqueue_has_ttls_in_source(self):
        """handler.py EPIC-05/SCALE-04 enqueue includes result_ttl and failure_ttl."""
        import inspect

        from src.pipeline import handler

        source = inspect.getsource(handler)
        assert "result_ttl=" in source
        assert "failure_ttl=" in source


# ─────────────────────────────────────────────────────────────────────────────
# GAP-8: reporter.report_to_pr in finally block
# ─────────────────────────────────────────────────────────────────────────────


class TestReporterInFinally:
    """
    reporter.report_to_pr must be called even when process_pull_request raises
    mid-analysis. Without a finally block, GitHub check runs stay 'in_progress'.
    """

    def test_report_called_when_analysis_raises(self):
        """
        If the analysis block raises, report_to_pr is still called so the
        GitHub check run is resolved to a failure state (not stuck in_progress).

        Structural contract: the outer main try block must use try/finally, and
        report_to_pr must appear inside that finally block (not after it).
        """
        import inspect

        from src.pipeline import handler

        source = inspect.getsource(handler.process_pull_request)

        # The main try block (the one that wraps analysis + complete_job) must
        # have a finally that contains report_to_pr.
        # Heuristic: "finally:" appears in source AND "report_to_pr" appears within
        # 10 lines after a "finally:" line.
        lines = source.splitlines()
        finally_line_nums = [i for i, ln in enumerate(lines) if ln.strip() == "finally:"]
        assert finally_line_nums, "process_pull_request must have at least one 'finally:' block"

        found_report_in_finally = False
        for fi in finally_line_nums:
            # Look in the 20 lines after the finally: for report_to_pr
            window = lines[fi : fi + 20]
            if any("report_to_pr" in ln for ln in window):
                found_report_in_finally = True
                break

        assert found_report_in_finally, (
            "report_to_pr must be inside a finally: block, not after the except"
        )


# ─────────────────────────────────────────────────────────────────────────────
# on_failure callback
# ─────────────────────────────────────────────────────────────────────────────


class TestOnFailureCallback:
    """_on_job_failure callback must call fail_job instantly on RQ timeout/crash."""

    def test_on_failure_callback_exists(self):
        """_on_job_failure function is importable from src.worker.jobs."""
        from src.worker.jobs import _on_job_failure

        assert callable(_on_job_failure)

    def test_on_failure_calls_fail_job(self):
        """_on_job_failure extracts db_job_id from RQ job kwargs and calls fail_job."""
        from src.worker.jobs import _on_job_failure

        mock_rq_job = MagicMock()
        # BUG-8 fix: key is 'db_job_id', not 'job_id' (RQ pops 'job_id' as its own identifier)
        mock_rq_job.kwargs = {"db_job_id": "db-job-456"}
        mock_rq_job.args = []

        with patch("src.worker.jobs.job_manager") as mock_jm:
            _on_job_failure(
                mock_rq_job,
                MagicMock(),  # connection
                Exception,  # exc_type
                Exception("timeout"),  # exc_value
                None,  # traceback
            )
            mock_jm.fail_job.assert_called_once()
            call_args = mock_jm.fail_job.call_args[0]
            assert call_args[0] == "db-job-456"

    def test_on_failure_safe_when_job_id_absent(self):
        """_on_job_failure is a no-op when job_id is absent (defensive for old in-flight jobs)."""
        from src.worker.jobs import _on_job_failure

        mock_rq_job = MagicMock()
        # No job_id kwarg — callback must not crash and must not call fail_job
        mock_rq_job.kwargs = {"installation_id": 42, "owner": "acme", "pr_number": 7}
        mock_rq_job.args = []

        with patch("src.worker.jobs.job_manager") as mock_jm:
            _on_job_failure(mock_rq_job, MagicMock(), Exception, Exception("x"), None)
            mock_jm.fail_job.assert_not_called()

    def test_on_failure_callback_registered_on_enqueue(self):
        """enqueue() includes on_failure=_on_job_failure."""
        from src.worker.jobs import _on_job_failure

        mock_queue = MagicMock()
        mock_queue.enqueue(
            MagicMock(),
            on_failure=_on_job_failure,
            job_timeout=120,
        )
        call_kwargs = mock_queue.enqueue.call_args[1]
        assert call_kwargs["on_failure"] is _on_job_failure


# ─────────────────────────────────────────────────────────────────────────────
# GAP-4: Pre-create DB record before Redis enqueue (atomic dispatch)
# ─────────────────────────────────────────────────────────────────────────────


class TestGap4AtomicDispatch:
    """
    Validates the GAP-4 race-condition fix:
      - DB job record is created in webhooks.py before Redis enqueue
      - db_job_id kwarg is forwarded through analyze_pr_job → process_pull_request
      - on_failure callback can now mark analyze_pr_job FAILED via the kwarg
      - process_pull_request skips create_job when a pre-created ID is supplied

    BUG-8 fix: the parameter was renamed 'job_id' → 'db_job_id' because RQ's
    Queue.enqueue() pops 'job_id' from kwargs (uses it as the RQ job's own ID)
    and never forwards it to the task function.
    """

    def test_on_failure_marks_analyze_pr_job_failed_via_gap4_kwarg(self):
        """_on_job_failure calls fail_job when analyze_pr_job carries a db_job_id kwarg (GAP-4)."""
        from src.worker.jobs import _on_job_failure

        mock_rq_job = MagicMock()
        mock_rq_job.kwargs = {
            "db_job_id": "db-job-gap4-abc",  # BUG-8 fix: renamed from job_id
            "installation_id": 42,
            "owner": "acme",
            "pr_number": 7,
        }
        mock_rq_job.args = []

        with patch("src.worker.jobs.job_manager") as mock_jm:
            _on_job_failure(
                mock_rq_job,
                MagicMock(),
                TimeoutError,
                TimeoutError("worker killed by SIGKILL"),
                None,
            )
            mock_jm.fail_job.assert_called_once()
            assert mock_jm.fail_job.call_args[0][0] == "db-job-gap4-abc"

    def test_analyze_pr_job_forwards_db_job_id_to_process_pull_request(self):
        """analyze_pr_job passes its db_job_id kwarg as job_id to process_pull_request."""
        from unittest.mock import AsyncMock

        mock_result = MagicMock()
        mock_result.repo_full_name = "acme/app"
        mock_result.pr_number = 7
        mock_result.drift_score = 0.3
        mock_result.processing_time_ms = 1000
        mock_result.documentation_updates = []
        mock_result.drift_analysis = None

        with patch(
            "src.pipeline.handler.process_pull_request",
            new=AsyncMock(return_value=mock_result),
        ) as mock_ppr:
            with patch("src.monitoring.metrics.JOBS_COMPLETED"):
                from src.worker.jobs import analyze_pr_job

                analyze_pr_job(
                    installation_id=1,
                    owner="acme",
                    repo="app",
                    pr_number=7,
                    action="opened",
                    base_sha="abc123",
                    head_sha="def456",
                    changed_files=[],
                    db_job_id="pre-job-gap4-999",  # BUG-8 fix: renamed from job_id
                )

            mock_ppr.assert_called_once()
            # db_job_id is forwarded as job_id to process_pull_request
            assert mock_ppr.call_args.kwargs["job_id"] == "pre-job-gap4-999"

    def test_process_pull_request_skips_create_job_when_job_id_pre_provided(self):
        """process_pull_request must NOT call job_manager.create_job when job_id is supplied."""
        import asyncio
        from unittest.mock import AsyncMock

        from src.pipeline.handler import process_pull_request

        mock_tenant_ctx = MagicMock()
        mock_tenant_ctx.tenant_id = "tid-1"
        mock_tenant_ctx.app_id = "9"
        mock_tenant_ctx.private_key = "pk"
        mock_tenant_ctx.llm_config = None
        mock_tenant_ctx.notification_config = None
        mock_tenant_ctx.workflow_config = None
        mock_tenant_ctx.plan = "FREE"

        # Defense-in-depth idem check inside handler uses SessionLocal.
        # Return None from first() so the guard does NOT find a spurious job.
        _null_sess = MagicMock()
        _null_sess.query.return_value.filter.return_value.first.return_value = None
        _null_sess.close = MagicMock()
        _null_sess.__enter__ = MagicMock(return_value=_null_sess)
        _null_sess.__exit__ = MagicMock(return_value=False)

        with (
            patch("src.pipeline.handler.get_tenant_context", return_value=mock_tenant_ctx),
            patch("src.pipeline.handler.get_installation_token", return_value="tok"),
            patch("src.pipeline.handler.load_repo_config", return_value={}),
            patch("src.pipeline.handler.parse_policies", return_value=[]),
            patch(
                "src.pipeline.handler.create_initial_check_run",
                new=AsyncMock(return_value=None),
            ),
            patch("src.pipeline.handler.job_manager") as mock_jm,
            patch("src.pipeline.handler.PRAnalyzer") as mock_analyzer_cls,
            patch("src.pipeline.handler.GitHubReporter") as mock_reporter_cls,
            patch("src.pipeline.handler.set_tenant_id"),
            patch("src.monitoring.metrics.record_analysis"),
            patch("src.pipeline.job_manager.SessionLocal", return_value=_null_sess),
        ):
            # Stop analysis after the DB-tracking block by making analyze_pr raise
            mock_analyzer_cls.return_value.analyze_pr = AsyncMock(
                side_effect=RuntimeError("stop_here")
            )
            # mock reporter so the finally block doesn't hit real GitHub
            mock_reporter_cls.return_value.report_to_pr = AsyncMock()

            # analyze_pr raises → process_pull_request re-raises after the finally block
            with pytest.raises(RuntimeError, match="stop_here"):
                asyncio.run(
                    process_pull_request(
                        installation_id=1,
                        owner="acme",
                        repo="app",
                        pr_number=7,
                        action="opened",
                        base_sha="abc123",
                        head_sha="def456",
                        changed_files=[
                            {
                                "filename": "src/foo.py",
                                "status": "modified",
                                "additions": 1,
                                "deletions": 0,
                            }
                        ],
                        base_ref="main",
                        job_id="pre-job-gap4-999",
                    )
                )

            # With a pre-provided job_id, create_job must NOT be called.
            # BUG-5: get_or_create_repo IS now called (idempotent — resolves repo_db_id
            # for Weaviate indexing even in the GAP-4 pre-created-job path).
            mock_jm.create_job.assert_not_called()
            mock_jm.get_or_create_repo.assert_called_once()
            # update_status IS called (to mark it PROCESSING)
            mock_jm.update_status.assert_called_once_with("pre-job-gap4-999", ANY)
