# SPDX-License-Identifier: AGPL-3.0-or-later
"""
First-analysis email notification.

Sends a one-time "Your first drift report is ready" email to all admin users
of a tenant when their first drift analysis completes successfully.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

import httpx
from sqlalchemy import func, select

from src.core.config import settings
from src.pipeline.job_manager import SessionLocal
from src.storage.sql_models import Job, JobStatus, User

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)

_RESEND_EMAILS_URL = "https://api.resend.com/emails"
_FROM_ADDRESS = "DocuGardener <noreply@docugardener.dev>"

# ---------------------------------------------------------------------------
# Severity helpers
# ---------------------------------------------------------------------------


def _severity_label(score: float) -> str:
    """Return human-readable severity label for a drift score."""
    if score >= 0.7:
        return "significant"
    if score >= 0.4:
        return "moderate"
    if score >= 0.1:
        return "minor"
    return "none"


def _severity_color(score: float) -> str:
    """Return badge background colour matching the severity."""
    if score >= 0.7:
        return "#ef4444"  # red-500
    if score >= 0.4:
        return "#f97316"  # orange-500
    if score >= 0.1:
        return "#eab308"  # yellow-500
    return "#22c55e"  # green-500


# ---------------------------------------------------------------------------
# HTML builder
# ---------------------------------------------------------------------------


def _build_email_html(
    pr_number: int,
    repo_full_name: str,
    drift_score: float,
    summary_text: str,
    app_url: str,
    is_first_drift: bool = False,
) -> str:
    """Build the HTML body for the first-analysis email."""
    severity = _severity_label(drift_score)
    badge_color = _severity_color(drift_score)
    score_pct = f"{drift_score:.0%}"
    # Truncate summary to 200 chars
    summary = summary_text[:200] + ("…" if len(summary_text) > 200 else "")
    inbox_url = f"{app_url.rstrip('/')}/dashboard/inbox"
    settings_url = f"{app_url.rstrip('/')}/dashboard/settings"

    title = (
        "🎉 Your first documentation drift is detected!"
        if is_first_drift and drift_score > 0
        else "Your first drift report is ready"
    )
    celebration_banner = (
        """<tr>
            <td style="background-color:#166534;border-radius:8px;padding:12px 16px;margin-bottom:20px;text-align:center;">
              <p style="margin:0;font-size:14px;color:#bbf7d0;font-weight:600;">
                🎉 Welcome! DocuGardener just caught its first documentation drift in your repository.
              </p>
            </td>
          </tr>
          <tr><td style="height:20px;"></td></tr>"""
        if is_first_drift and drift_score > 0
        else ""
    )

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your first drift report is ready — DocuGardener</title>
</head>
<body style="margin:0;padding:0;background-color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0f172a;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
          <!-- Header -->
          <tr>
            <td style="padding:0 0 32px 0;text-align:center;">
              <span style="font-size:24px;font-weight:700;color:#4ade80;letter-spacing:-0.5px;">DocuGardener</span>
            </td>
          </tr>
          <!-- Card -->
          <tr>
            <td style="background-color:#1e293b;border-radius:12px;padding:40px;border:1px solid #334155;">
              {celebration_banner}
              <!-- Title -->
              <p style="margin:0 0 8px 0;font-size:26px;font-weight:700;color:#f1f5f9;line-height:1.3;">
                {title}
              </p>
              <!-- Subtitle -->
              <p style="margin:0 0 28px 0;font-size:15px;color:#94a3b8;line-height:1.5;">
                DocuGardener analysed PR&nbsp;<strong style="color:#e2e8f0;">#{pr_number}</strong>
                in&nbsp;<strong style="color:#e2e8f0;">{repo_full_name}</strong>
              </p>
              <!-- Drift score badge -->
              <table cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr>
                  <td style="background-color:{badge_color};border-radius:8px;padding:10px 20px;text-align:center;">
                    <span style="font-size:22px;font-weight:700;color:#ffffff;">{score_pct}</span>
                    <span style="font-size:13px;color:rgba(255,255,255,0.85);margin-left:8px;text-transform:uppercase;letter-spacing:0.5px;">{severity} drift</span>
                  </td>
                </tr>
              </table>
              <!-- Summary -->
              <p style="margin:0 0 32px 0;font-size:15px;color:#cbd5e1;line-height:1.6;background-color:#0f172a;border-radius:8px;padding:16px;border-left:3px solid #4ade80;">
                {summary}
              </p>
              <!-- CTA button -->
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="border-radius:8px;background-color:#4ade80;">
                    <a href="{inbox_url}"
                       style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:600;color:#0f172a;text-decoration:none;border-radius:8px;">
                      View report &#x2192;
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:24px 0 0 0;text-align:center;">
              <p style="margin:0;font-size:13px;color:#475569;line-height:1.6;">
                This is a one-time notification. You won&apos;t receive automated emails unless you configure
                <a href="{settings_url}" style="color:#64748b;text-decoration:underline;">Slack notifications</a>.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


# ---------------------------------------------------------------------------
# DB helpers
# ---------------------------------------------------------------------------


def _is_first_completed_job(tenant_id: str) -> bool:
    """Return True if this is exactly the first COMPLETED job for the tenant."""
    with SessionLocal() as session:
        count: int = session.execute(
            select(func.count())
            .select_from(Job)
            .where(
                Job.tenantId == tenant_id,
                Job.status == JobStatus.COMPLETED,
            )
        ).scalar_one()
    return count == 1


def is_first_drift_for_tenant(tenant_id: str, drift_score: float) -> bool:
    """Return True when this is the first time drift was detected for the tenant.

    Defined as: drift_score > 0 AND this is the first COMPLETED job for the
    tenant (the most common onboarding scenario — first PR analysed has drift).
    """
    if drift_score <= 0:
        return False
    return _is_first_completed_job(tenant_id)


def _get_admin_emails(tenant_id: str) -> list[str]:
    """Return email addresses of all ADMIN users for the tenant."""
    with SessionLocal() as session:
        rows = session.execute(
            select(User.email).where(
                User.tenantId == tenant_id,
                User.role == "ADMIN",
            )
        ).all()
    return [row[0] for row in rows if row[0]]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def maybe_send_first_analysis_email(
    *,
    tenant_id: str,
    pr_number: int,
    repo_full_name: str,
    drift_score: float,
    summary_text: str,
    correlation_id: str,
    is_first_drift: bool = False,
) -> None:
    """Send the first-analysis email if this is the tenant's first completed job.

    Fire-and-forget: any failure is logged as a warning and never propagated.
    Job completion must not be affected by email delivery errors.
    """
    try:
        _send_first_analysis_email(
            tenant_id=tenant_id,
            pr_number=pr_number,
            repo_full_name=repo_full_name,
            drift_score=drift_score,
            summary_text=summary_text,
            correlation_id=correlation_id,
            is_first_drift=is_first_drift,
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "first_analysis_email: failed to send notification (non-fatal)",
            extra={
                "correlation_id": correlation_id,
                "tenant_id": tenant_id,
                "error": str(exc),
            },
        )


def _send_first_analysis_email(
    *,
    tenant_id: str,
    pr_number: int,
    repo_full_name: str,
    drift_score: float,
    summary_text: str,
    correlation_id: str,
    is_first_drift: bool = False,
) -> None:
    """Internal implementation — may raise; callers must handle exceptions."""
    api_key: str | None = settings.resend_api_key
    if not api_key:
        logger.debug(
            "first_analysis_email: RESEND_API_KEY not configured, skipping",
            extra={"correlation_id": correlation_id, "tenant_id": tenant_id},
        )
        return

    if not _is_first_completed_job(tenant_id):
        logger.debug(
            "first_analysis_email: not first completed job, skipping",
            extra={"correlation_id": correlation_id, "tenant_id": tenant_id},
        )
        return

    admin_emails = _get_admin_emails(tenant_id)
    if not admin_emails:
        logger.warning(
            "first_analysis_email: no admin emails found for tenant",
            extra={"correlation_id": correlation_id, "tenant_id": tenant_id},
        )
        return

    app_url: str = getattr(settings, "app_url", None) or "https://docugardener.dev"
    html = _build_email_html(
        pr_number=pr_number,
        repo_full_name=repo_full_name,
        drift_score=drift_score,
        summary_text=summary_text,
        app_url=app_url,
        is_first_drift=is_first_drift,
    )

    subject = (
        "🎉 First documentation drift detected — DocuGardener"
        if is_first_drift and drift_score > 0
        else "Your first drift report is ready — DocuGardener"
    )
    payload = {
        "from": _FROM_ADDRESS,
        "to": admin_emails,
        "subject": subject,
        "html": html,
    }

    response = httpx.post(
        _RESEND_EMAILS_URL,
        json=payload,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        timeout=10.0,
    )
    response.raise_for_status()

    logger.info(
        "first_analysis_email: sent successfully",
        extra={
            "correlation_id": correlation_id,
            "tenant_id": tenant_id,
            "recipients": admin_emails,
            "pr_number": pr_number,
            "repo_full_name": repo_full_name,
        },
    )
