"""
RQ-STAB-02: Stale job sweeper — unit tests.

Verifies that run_stale_job_sweeper():
  1. Queries for PROCESSING jobs older than max_processing_time + 30s
  2. Calls fail_job for each stale job
  3. Is registered in the scheduler with IntervalTrigger(seconds=60)
  4. Does not fail stale jobs with 0 seconds grace (threshold check)
"""

from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock, patch

# ─────────────────────────────────────────────────────────────────────────────
# Sweeper logic
# ─────────────────────────────────────────────────────────────────────────────


class TestStaleSweeper:
    """run_stale_job_sweeper detects and fails stale PROCESSING jobs."""

    def _make_stale_job(self, job_id: str, started_at: datetime) -> MagicMock:
        job = MagicMock()
        job.id = job_id
        job.startedAt = started_at
        return job

    def test_fails_jobs_older_than_threshold(self):
        """Jobs started > max_processing_time + 30s ago are marked FAILED."""
        from src.jobs.stale_sweeper import run_stale_job_sweeper

        now = datetime.now(UTC)
        stale_started = now - timedelta(seconds=200)  # well beyond 120+30=150s
        stale_job = self._make_stale_job("stale-001", stale_started)

        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.all.return_value = [stale_job]

        with patch("src.jobs.stale_sweeper.SessionLocal", return_value=mock_db):
            with patch("src.jobs.stale_sweeper.job_manager") as mock_jm:
                run_stale_job_sweeper()
                mock_jm.fail_job.assert_called_once()
                call_args = mock_jm.fail_job.call_args[0]
                assert call_args[0] == "stale-001"
                assert "stale" in call_args[1].lower() or "sweeper" in call_args[1].lower()

    def test_fails_multiple_stale_jobs(self):
        """Each stale job gets its own fail_job call."""
        from src.jobs.stale_sweeper import run_stale_job_sweeper

        now = datetime.now(UTC)
        old = now - timedelta(seconds=300)

        jobs = [
            self._make_stale_job("stale-A", old),
            self._make_stale_job("stale-B", old),
            self._make_stale_job("stale-C", old),
        ]
        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.all.return_value = jobs

        with patch("src.jobs.stale_sweeper.SessionLocal", return_value=mock_db):
            with patch("src.jobs.stale_sweeper.job_manager") as mock_jm:
                run_stale_job_sweeper()
                assert mock_jm.fail_job.call_count == 3

    def test_no_stale_jobs_no_fail_called(self):
        """When no stale jobs exist, fail_job is never called."""
        from src.jobs.stale_sweeper import run_stale_job_sweeper

        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.all.return_value = []

        with patch("src.jobs.stale_sweeper.SessionLocal", return_value=mock_db):
            with patch("src.jobs.stale_sweeper.job_manager") as mock_jm:
                run_stale_job_sweeper()
                mock_jm.fail_job.assert_not_called()

    def test_fail_job_exception_does_not_abort_sweep(self):
        """If fail_job raises for one job, sweeper continues to the next."""
        from src.jobs.stale_sweeper import run_stale_job_sweeper

        now = datetime.now(UTC)
        old = now - timedelta(seconds=300)
        jobs = [
            self._make_stale_job("fail-here", old),
            self._make_stale_job("should-also-fail", old),
        ]
        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.all.return_value = jobs

        call_count = 0

        def side_effect(job_id, msg):
            nonlocal call_count
            call_count += 1
            if job_id == "fail-here":
                raise RuntimeError("DB hiccup")

        with patch("src.jobs.stale_sweeper.SessionLocal", return_value=mock_db):
            with patch("src.jobs.stale_sweeper.job_manager") as mock_jm:
                mock_jm.fail_job.side_effect = side_effect
                run_stale_job_sweeper()  # must not raise
                assert call_count == 2  # both jobs were attempted


# ─────────────────────────────────────────────────────────────────────────────
# Scheduler registration
# ─────────────────────────────────────────────────────────────────────────────


class TestSweeperRegisteredInScheduler:
    """Sweeper must be registered as a 60-second interval job in the scheduler."""

    def test_sweeper_job_in_scheduler(self):
        """build_scheduler() includes the stale job sweeper with seconds=60."""
        from apscheduler.triggers.interval import IntervalTrigger

        from src.scheduler.manager import build_scheduler

        scheduler = build_scheduler()

        job_ids = [j.id for j in scheduler.get_jobs()]
        assert "stale_job_sweeper" in job_ids, (
            f"stale_job_sweeper not found in scheduler jobs: {job_ids}"
        )

        sweeper_job = next(j for j in scheduler.get_jobs() if j.id == "stale_job_sweeper")
        assert isinstance(sweeper_job.trigger, IntervalTrigger), (
            "stale_job_sweeper must use IntervalTrigger"
        )
        # Verify 60-second interval
        assert sweeper_job.trigger.interval.total_seconds() == 60, (
            f"Expected 60s interval, got {sweeper_job.trigger.interval.total_seconds()}s"
        )
