# SPDX-License-Identifier: AGPL-3.0-or-later
"""
FEED-01: Analysis Feedback Signal endpoint.

One-click GET endpoint embedded in PR comments.
Verifies the HMAC token, upserts the feedback signal, then redirects the developer
back to the DocuGardener job page with a confirmation parameter.

URL:  GET /api/feedback?j={job_id}&s=up|down&tid={tenant_id}&t={token}
"""

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from src.core.config import settings
from src.core.logging import get_logger
from src.pipeline.feedback import verify_feedback_token
from src.pipeline.job_manager import get_db
from src.storage.sql_models import AnalysisFeedback

router = APIRouter()
logger = get_logger(__name__)

_VALID_SIGNALS = {"up", "down"}


@router.get("/api/feedback", tags=["Feedback"], include_in_schema=False, response_model=None)
def record_feedback(
    j: str = Query(..., description="Job ID"),
    s: str = Query(..., description="Signal: 'up' or 'down'"),
    t: str = Query(..., description="HMAC verification token"),
    tid: str = Query(..., description="Tenant ID"),
    db: Session = Depends(get_db),
) -> RedirectResponse | HTMLResponse:
    """
    Record a developer's analysis feedback signal.

    Verifies HMAC, upserts the feedback row (developer may change up→down),
    and redirects to the DocuGardener job page with ?feedback=<label>.
    """
    # Feature disabled when secret not configured
    if not settings.feedback_hmac_secret:
        logger.warning("FEED-01: feedback endpoint hit but FEEDBACK_HMAC_SECRET not set")
        return HTMLResponse("<p>Feedback not configured.</p>", status_code=503)

    # Validate signal value
    if s not in _VALID_SIGNALS:
        return HTMLResponse("<p>Invalid feedback signal.</p>", status_code=400)

    # Verify HMAC — token signs "job_id:tenant_id"
    if not verify_feedback_token(job_id=j, tenant_id=tid, token=t):
        logger.warning("FEED-01: invalid feedback token", job_id=j, tenant_id=tid)
        return HTMLResponse("<p>Invalid or expired feedback link.</p>", status_code=403)

    # Upsert: developer may change their mind (up → down)
    try:
        stmt = (
            pg_insert(AnalysisFeedback)
            .values(
                id=str(uuid.uuid4()),
                jobId=j,
                tenantId=tid,
                signal=s,
                source="pr_comment",
                createdAt=datetime.utcnow(),
                updatedAt=datetime.utcnow(),
            )
            .on_conflict_do_update(
                index_elements=["jobId", "source"],
                set_={
                    "signal": s,
                    "updatedAt": datetime.utcnow(),
                },
            )
        )
        db.execute(stmt)
        db.commit()
        logger.info("FEED-01: feedback recorded", job_id=j, signal=s, tenant_id=tid)
    except Exception as exc:
        db.rollback()
        logger.error("FEED-01: failed to save feedback", job_id=j, error=str(exc))
        return HTMLResponse("<p>Failed to save feedback. Please try again.</p>", status_code=500)

    # Redirect to the job detail page with a confirmation param.
    # Use frontend_url when set (dev: Next.js on different port); fall back to app_url.
    label = "accurate" if s == "up" else "false-positive"
    base = (settings.frontend_url or settings.app_url).rstrip("/")
    return RedirectResponse(url=f"{base}/dashboard/jobs/{j}?feedback={label}", status_code=302)
