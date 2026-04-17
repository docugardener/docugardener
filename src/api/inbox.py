# SPDX-License-Identifier: AGPL-3.0-or-later
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from src.pipeline.job_manager import get_db
from src.storage.sql_models import Job, Repository, TriageStatus

router = APIRouter(prefix="/inbox", tags=["inbox"])


@router.get("/")
def get_inbox_jobs(tenant_id: str, repository_id: str | None = None, db: Session = Depends(get_db)):
    """
    Get all jobs that require triage (PENDING status).
    Enriched with repository name, repo owner, and head SHA for LiveCodeBlock rendering.
    """
    from src.storage.sql_models import JobStatus as _JobStatus

    query = db.query(Job).filter(
        Job.tenantId == tenant_id,
        Job.triageStatus == TriageStatus.PENDING,
        Job.status == _JobStatus.COMPLETED,
    )

    if repository_id:
        query = query.filter(Job.repositoryId == repository_id)

    jobs = query.order_by(Job.createdAt.desc()).all()

    # Batch-load repos for enrichment
    repo_ids = list({j.repositoryId for j in jobs})
    repos = {r.id: r for r in db.query(Repository).filter(Repository.id.in_(repo_ids)).all()}

    def _extract_owner(job_result: dict | None) -> str:
        """Extract GitHub org/user from repo_full_name stored in result JSON."""
        full_name = (job_result or {}).get("repo_full_name", "")
        parts = full_name.split("/") if "/" in full_name else []
        return parts[0] if len(parts) == 2 else ""

    return [
        {
            "id": job.id,
            "tenantId": job.tenantId,
            "repositoryId": job.repositoryId,
            "repositoryName": repos[job.repositoryId].name
            if job.repositoryId in repos
            else "Unknown",
            "repoOwner": _extract_owner(job.result),
            "headSha": (job.result or {}).get("head_sha"),
            "prNumber": job.prNumber,
            "status": job.status,
            "triageStatus": job.triageStatus,
            "result": job.result,
            "fixPrUrl": (job.result or {}).get("fixPrUrl"),
            "aiAuthored": bool((job.result or {}).get("ai_authored")),
            "autoFixEnqueued": bool((job.result or {}).get("auto_fix_enqueued", False)),
            "aiSignal": (job.result or {}).get("ai_signal") or None,
            "autoMergeSkipReason": (job.result or {}).get("autoMergeSkipReason") or None,
            # Append Z so browsers parse these as UTC (naive datetime.utcnow() lacks tz info)
            "createdAt": job.createdAt.isoformat() + "Z" if job.createdAt else None,
            "completedAt": job.completedAt.isoformat() + "Z" if job.completedAt else None,
        }
        for job in jobs
    ]


@router.patch("/{job_id}")
def update_job_triage_status(
    job_id: str,
    status: TriageStatus,
    dismiss_reason: str | None = Query(None),
    db: Session = Depends(get_db),
):
    """
    Update the triage status of a specific job.
    """
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    job.triageStatus = status
    job.updatedAt = datetime.utcnow()

    if status == TriageStatus.IGNORED and dismiss_reason:
        result = dict(job.result or {})
        result["dismiss_reason"] = dismiss_reason
        job.result = result

    db.commit()

    if status == TriageStatus.ACCEPTED:
        from rq import Retry

        from src.worker.jobs import _on_job_failure, create_fix_pr_job
        from src.worker.queue import QUEUE_HIGH, get_queue

        queue = get_queue(QUEUE_HIGH)
        queue.enqueue(
            create_fix_pr_job,
            job.id,
            retry=Retry(max=3, interval=[30, 60, 120]),
            result_ttl=3600,
            failure_ttl=604800,
            on_failure=_on_job_failure,
        )

    elif status == TriageStatus.IGNORED:
        from rq import Retry

        from src.worker.jobs import _on_job_failure, ignore_drift_job
        from src.worker.queue import QUEUE_HIGH, get_queue

        queue = get_queue(QUEUE_HIGH)
        queue.enqueue(
            ignore_drift_job,
            job.id,
            retry=Retry(max=3, interval=[30, 60, 120]),
            result_ttl=3600,
            failure_ttl=604800,
            on_failure=_on_job_failure,
        )

    return {"message": f"Job triage status updated to {status}"}


@router.get("/{job_id}")
def get_job(job_id: str, db: Session = Depends(get_db)):
    """
    Get details of a specific job, useful for polling Auto-PR generation.
    """
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    return {
        "id": job.id,
        "tenantId": job.tenantId,
        "repositoryId": job.repositoryId,
        "prNumber": job.prNumber,
        "status": job.status,
        "triageStatus": job.triageStatus,
        "result": job.result,
        "fixPrUrl": job.result.get("fixPrUrl") if isinstance(job.result, dict) else None,
        "createdAt": job.createdAt.isoformat() + "Z" if job.createdAt else None,
        "completedAt": job.completedAt.isoformat() + "Z" if job.completedAt else None,
    }
