"""
SCALE-03: Scheduler Manager.

Entry point for the `scheduler` Docker service. Registers the nightly rollup
cron job at 02:00 UTC using APScheduler's BlockingScheduler.

Usage (standalone):
    python -m src.scheduler.manager

Docker service command:
    python -m src.scheduler.manager
"""

import signal
import sys

from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from src.core.logging import get_logger
from src.jobs.nightly_rollup import run_nightly_rollup
from src.jobs.rules_staleness import run_rules_staleness_check
from src.jobs.stale_sweeper import run_stale_job_sweeper

logger = get_logger(__name__)


def build_scheduler() -> BlockingScheduler:
    """
    Create a configured BlockingScheduler with all periodic jobs.

    misfire_grace_time=3600 ensures cron jobs still run if the container
    was briefly down at the scheduled time (up to 1 hour late).
    """
    scheduler = BlockingScheduler(timezone="UTC")

    scheduler.add_job(
        func=run_nightly_rollup,
        trigger=CronTrigger(hour=2, minute=0, timezone="UTC"),
        id="nightly_rollup",
        name="Nightly Drift Rollup (SCALE-03)",
        replace_existing=True,
        misfire_grace_time=3600,
    )

    scheduler.add_job(
        func=run_rules_staleness_check,
        trigger=CronTrigger(hour=3, minute=0, timezone="UTC"),
        id="rules_staleness_check",
        name="Rules Artifact Staleness Check (RULES-01)",
        replace_existing=True,
        misfire_grace_time=3600,
    )

    # RQ-STAB-02: Stale job sweeper — detect and fail PROCESSING jobs older
    # than max_processing_time + 30s. Runs every 60 seconds (≤60s recovery lag
    # for worker-crash scenarios where on_failure callback does not fire).
    scheduler.add_job(
        func=run_stale_job_sweeper,
        trigger=IntervalTrigger(seconds=60),
        id="stale_job_sweeper",
        name="Stale Job Sweeper (RQ-STAB-02)",
        replace_existing=True,
        misfire_grace_time=30,
    )

    return scheduler


def run() -> None:
    """Start the scheduler. Blocks indefinitely until SIGTERM or SIGINT."""
    scheduler = build_scheduler()

    def _shutdown(signum, frame):  # noqa: ARG001
        logger.info("Scheduler shutdown signal received", signal=signum)
        scheduler.shutdown(wait=False)
        sys.exit(0)

    signal.signal(signal.SIGTERM, _shutdown)
    signal.signal(signal.SIGINT, _shutdown)

    jobs = scheduler.get_jobs()
    logger.info(
        "Nightly rollup scheduler starting",
        jobs=[j.name for j in jobs],
    )
    scheduler.start()


if __name__ == "__main__":
    run()
