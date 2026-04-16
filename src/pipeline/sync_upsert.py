# SPDX-License-Identifier: AGPL-3.0-or-later
"""BUG-1 fix: upsert helpers for pull_request synchronize events.

When GitHub fires a ``pull_request: synchronize`` webhook (a new commit has
been pushed to an open PR) the old behaviour was to call ``create_job()``
unconditionally, producing a duplicate inbox row for every push to the same PR.

This module provides testable helper functions used by the upsert logic
that is inlined into ``webhooks.py``:

* ``find_open_job()``              — query for an existing in-flight / untriaged job.
* ``reset_job_for_reanalysis()``   — reset status/triage on the existing job row.

The ``webhooks.py`` GAP-4 block uses these helpers for ``synchronize`` events:

1. Call ``find_open_job(db, tenant_id, repo_id, pr_number)``.
2. If found (NEEDS_REVIEW): call ``reset_job_for_reanalysis(db, job)`` and
   re-use the existing job ID — no new DB row created.
3. If not found: fall through to ``job_manager.create_job()`` as before.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from src.storage.sql_models import Job, JobStatus, TriageStatus

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


def find_open_job(
    db: Session,
    tenant_id: str,
    repo_id: str,
    pr_number: int,
) -> Job | None:
    """Return the most-recent job awaiting triage for (tenant_id, repo_id, pr_number).

    "Awaiting triage" = analysis completed (status=COMPLETED) but the user
    has not yet acted (triageStatus=PENDING).  QUEUED / PROCESSING jobs are
    excluded — they are in-flight and should not be reset while a worker may
    be running.

    Args:
        db: Active SQLAlchemy session — caller owns the lifecycle.
        tenant_id: Scope constraint; never leaks cross-tenant data.
        repo_id: Internal repository DB ID (CUID), not the GitHub numeric ID.
        pr_number: GitHub pull-request number.

    Returns:
        The most-recent matching Job ORM row, or ``None``.
    """
    job: Job | None = (
        db.query(Job)
        .filter(
            Job.tenantId == tenant_id,
            Job.repositoryId == repo_id,
            Job.prNumber == pr_number,
            Job.triageStatus == TriageStatus.PENDING,
            Job.status == JobStatus.COMPLETED,
        )
        .order_by(Job.createdAt.desc())
        .first()
    )
    logger.debug(
        "find_open_job result",
        extra={
            "tenant_id": tenant_id,
            "repo_id": repo_id,
            "pr_number": pr_number,
            "found_job_id": job.id if job else None,
        },
    )
    return job


def reset_job_for_reanalysis(
    db: Session,
    job: Job,
) -> Job:
    """Reset an existing COMPLETED/PENDING (awaiting triage) job so it can be re-analysed.

    Called when a ``pull_request: synchronize`` event arrives and an open job
    already exists for the same (tenant, repo, pr_number).  Instead of
    creating a duplicate inbox row we update the existing row in place:

    * ``status``        → QUEUED  (ready for worker to pick up)
    * ``triageStatus``  → PENDING (cleared so inbox hides it until analysis done)
    * ``updatedAt``     → now(UTC)

    Args:
        db: Active SQLAlchemy session — caller owns the lifecycle.
        job: The Job ORM row to reset.

    Returns:
        The mutated Job row (same object, changes committed to DB).
    """
    job.status = JobStatus.QUEUED
    job.triageStatus = TriageStatus.PENDING
    job.updatedAt = datetime.now(UTC)
    db.add(job)
    db.commit()
    db.refresh(job)
    logger.info(
        "job reset for reanalysis (synchronize upsert)",
        extra={
            "job_id": job.id,
            "tenant_id": job.tenantId,
            "repo_id": job.repositoryId,
            "pr_number": job.prNumber,
        },
    )
    return job
