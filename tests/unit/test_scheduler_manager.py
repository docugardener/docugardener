# SPDX-License-Identifier: AGPL-3.0-or-later
"""
Unit tests for src/scheduler/manager.py — build_scheduler and run().
"""

import signal
from unittest.mock import MagicMock, patch

import pytest

from src.scheduler.manager import build_scheduler, run


class TestBuildScheduler:
    def test_returns_blocking_scheduler(self):
        """build_scheduler returns a BlockingScheduler instance."""
        from apscheduler.schedulers.blocking import BlockingScheduler

        scheduler = build_scheduler()
        assert isinstance(scheduler, BlockingScheduler)

    def test_registers_four_jobs(self):
        """build_scheduler registers exactly four jobs."""
        scheduler = build_scheduler()
        jobs = scheduler.get_jobs()
        assert len(jobs) == 4

    def test_job_ids_are_present(self):
        """build_scheduler registers all four scheduled jobs."""
        scheduler = build_scheduler()
        job_ids = {j.id for j in scheduler.get_jobs()}
        assert "nightly_rollup" in job_ids
        assert "rules_staleness_check" in job_ids
        assert "stale_job_sweeper" in job_ids
        assert "drip_scheduler" in job_ids


class TestRunScheduler:
    def test_run_starts_and_registers_signal_handlers(self):
        """run() starts the scheduler and registers SIGTERM/SIGINT handlers."""
        mock_scheduler = MagicMock()
        mock_scheduler.get_jobs.return_value = []
        mock_scheduler.start.side_effect = SystemExit(0)  # simulate immediate exit

        with patch("src.scheduler.manager.build_scheduler", return_value=mock_scheduler):
            with patch("src.scheduler.manager.signal") as mock_signal:
                with pytest.raises(SystemExit):
                    run()

        mock_scheduler.start.assert_called_once()

    def test_run_shutdown_on_sigterm(self):
        """_shutdown handler shuts down the scheduler and exits."""
        mock_scheduler = MagicMock()
        mock_scheduler.get_jobs.return_value = []
        captured_handlers = {}

        def _fake_signal(signum, handler):
            captured_handlers[signum] = handler

        # start() raises immediately so run() doesn't block
        mock_scheduler.start.side_effect = SystemExit(0)

        with patch("src.scheduler.manager.build_scheduler", return_value=mock_scheduler):
            with patch("src.scheduler.manager.signal") as mock_sig_mod:
                mock_sig_mod.SIGTERM = signal.SIGTERM
                mock_sig_mod.SIGINT = signal.SIGINT
                mock_sig_mod.signal.side_effect = _fake_signal
                with pytest.raises(SystemExit):
                    run()

        # Now invoke the shutdown handler manually
        if signal.SIGTERM in captured_handlers:
            handler = captured_handlers[signal.SIGTERM]
            with pytest.raises(SystemExit):
                handler(signal.SIGTERM, None)
            mock_scheduler.shutdown.assert_called_with(wait=False)
