"""
RQ-STAB-02: Stale job sweeper (GAP-8 / on_failure complement).

Runs every 60 seconds from the scheduler service.
Detects PROCESSING jobs whose startedAt is older than max_processing_time + 30s
and marks them as FAILED.

This covers the worker-crash scenario where the on_failure callback never fires
(worker process killed by OOM / SIGKILL before RQ can call the callback).
The 60-second interval keeps recovery lag well below the previous 5-minute baseline.
"""

from datetime import datetime, timezone, timedelta

from src.core.config import settings
from src.core.logging import get_logger
from src.pipeline.job_manager import SessionLocal, job_manager
from src.storage.sql_models import Job, JobStatus

logger = get_logger(__name__)

# Grace period added on top of max_processing_time before we declare a job stale.
_GRACE_SECONDS: int = 30


def run_stale_job_sweeper() -> None:
    """
    Detect PROCESSING jobs that have been running longer than expected and
    mark them as FAILED so they leave the active-jobs view and are retried
    by RQ's Retry mechanism on the next enqueue cycle.

    Safe to run concurrently — fail_job is idempotent (PROCESSING → FAILED only;
    already-COMPLETED/FAILED rows are unaffected by status filter).
    """
    threshold_seconds = settings.max_processing_time + _GRACE_SECONDS
    cutoff = datetime.now(timezone.utc) - timedelta(seconds=threshold_seconds)

    db = SessionLocal()
    try:
        stale_jobs = (
            db.query(Job)
            .filter(
                Job.status == JobStatus.PROCESSING,
                Job.startedAt < cutoff,
            )
            .all()
        )
    finally:
        db.close()

    if not stale_jobs:
        return

    logger.warning(
        "Stale job sweeper: found stale PROCESSING jobs",
        count=len(stale_jobs),
        threshold_seconds=threshold_seconds,
    )

    for job in stale_jobs:
        try:
            job_manager.fail_job(
                job.id,
                f"Stale job detected by sweeper: started_at={job.startedAt}, "
                f"threshold={threshold_seconds}s",
            )
            logger.info("Sweeper: marked job as FAILED", job_id=job.id)
        except Exception as e:
            # Must not abort sweep — log and continue to next job
            logger.error("Sweeper: fail_job raised", job_id=job.id, error=str(e))
