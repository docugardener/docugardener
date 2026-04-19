# SPDX-License-Identifier: AGPL-3.0-or-later
"""
EPIC-01-GAP-02: Welcome email drip sequence.

Sends 4 time-based emails to the ADMIN user of each tenant after install:
  Day 0 — install confirmation   (within 24h of createdAt)
  Day 1 — first analysis tips    (only if no analysis run yet)
  Day 3 — upgrade nudge          (only if still on FREE plan)
  Day 7 — weekly check-in

Sent state is stored in tenant.workflowConfig["drip_sent"] to prevent
resending.  All sends are non-fatal — a failure logs and moves on.

Transport: Google Workspace SMTP via smtplib (SMTP_HOST in settings).
If SMTP is not configured the job logs a warning and exits silently.
"""

from __future__ import annotations

import smtplib
import ssl
from datetime import UTC, datetime, timedelta
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any

from src.core.config import settings
from src.core.logging import get_logger
from src.pipeline.job_manager import SessionLocal
from src.storage.sql_models import Job, JobStatus, Repository, Tenant, User

logger = get_logger(__name__)

APP_URL = settings.app_url or "https://docugardener.dev"


# ── SMTP transport ────────────────────────────────────────────────────────────

def _send_smtp(to: str, subject: str, html: str, text: str) -> None:
    """Send via configured SMTP server. Raises on failure."""
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = settings.email_from
    msg["To"] = to
    msg.attach(MIMEText(text, "plain"))
    msg.attach(MIMEText(html, "html"))

    port = settings.smtp_port
    if settings.smtp_secure or port == 465:
        ctx = ssl.create_default_context()
        with smtplib.SMTP_SSL(settings.smtp_host, port, context=ctx) as srv:
            srv.login(settings.smtp_user, settings.smtp_pass)
            srv.sendmail(settings.email_from, to, msg.as_string())
    else:
        with smtplib.SMTP(settings.smtp_host, port) as srv:
            srv.ehlo()
            srv.starttls()
            srv.login(settings.smtp_user, settings.smtp_pass)
            srv.sendmail(settings.email_from, to, msg.as_string())


def send_drip_email(to: str, subject: str, html: str, text: str) -> bool:
    """Send a drip email. Returns True on success, False on any failure."""
    if not settings.smtp_host:
        logger.warning("drip: SMTP not configured — skipping email", to=to, subject=subject)
        return False
    try:
        _send_smtp(to, subject, html, text)
        logger.info("drip: email sent", to=to, subject=subject)
        return True
    except Exception as exc:
        logger.error("drip: send failed", to=to, subject=subject, error=str(exc))
        return False


# ── Template helpers ──────────────────────────────────────────────────────────

def _wrap_html(body_html: str) -> str:
    return f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:sans-serif;background:#f9fafb;padding:40px 0;margin:0">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #e5e7eb;padding:40px">
    <h1 style="font-size:22px;font-weight:900;color:#111;margin:0 0 8px">DocuGardener</h1>
    <p style="color:#6b7280;font-size:14px;margin:0 0 32px">Automated Documentation Drift Detection</p>
    {body_html}
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:32px 0 16px">
    <p style="color:#9ca3af;font-size:11px;margin:0">{APP_URL}</p>
  </div>
</body>
</html>"""


def _btn(url: str, label: str) -> str:
    return (
        f'<a href="{url}" style="display:inline-block;background:#111;color:#fff;'
        f'font-size:14px;font-weight:700;padding:12px 28px;border-radius:8px;'
        f'text-decoration:none;margin:8px 0">{label}</a>'
    )


# ── Email builders ────────────────────────────────────────────────────────────

def build_day0(first_name: str, repo_name: str, repo_count: int) -> tuple[str, str, str]:
    """Day 0 — install confirmation."""
    subject = "You're set up — DocuGardener is watching your repos"
    repos_word = "repository" if repo_count == 1 else "repositories"
    text = (
        f"Hi {first_name},\n\n"
        f"DocuGardener is installed and watching {repo_count} {repos_word} including {repo_name}.\n\n"
        "The next time a pull request opens on a connected repo, you'll see a check run "
        "with a drift report — no config needed.\n\n"
        "What happens next:\n"
        "→ Open a PR on any connected repo\n"
        "→ DocuGardener runs automatically\n"
        "→ If docs are out of date, the check fails with a precise report\n"
        "→ One click generates a fix PR\n\n"
        f"Go to Settings: {APP_URL}/dashboard/settings\n\n"
        "Questions? Reply to this email — we read every one.\n\n"
        "— The DocuGardener team"
    )
    html = _wrap_html(
        f"<p style='color:#111;font-size:15px;margin:0 0 16px'>Hi {first_name},</p>"
        f"<p style='color:#374151;font-size:14px;margin:0 0 16px'>"
        f"DocuGardener is installed and watching <strong>{repo_count} {repos_word}</strong>. "
        f"The next time a pull request opens on <strong>{repo_name}</strong>, you'll see a "
        f"check run with a drift report — no config needed.</p>"
        f"<p style='color:#374151;font-size:14px;margin:0 0 8px'><strong>What happens next:</strong></p>"
        f"<ul style='color:#374151;font-size:14px;margin:0 0 24px;padding-left:20px'>"
        f"<li>Open a PR on any connected repo</li>"
        f"<li>DocuGardener runs automatically</li>"
        f"<li>If docs are out of date, the check fails with a precise report</li>"
        f"<li>One click generates a fix PR</li></ul>"
        + _btn(f"{APP_URL}/dashboard/settings", "Go to Settings →")
        + "<p style='color:#6b7280;font-size:13px;margin:24px 0 0'>"
        "Questions? Reply to this email — we read every one.</p>"
    )
    return subject, html, text


def build_day1(first_name: str, repo_name: str) -> tuple[str, str, str]:
    """Day 1 — no analysis yet nudge."""
    subject = "Haven't seen a PR yet — here's how to get your first result"
    compare_url = f"https://github.com/{repo_name}/compare"
    text = (
        f"Hi {first_name},\n\n"
        f"DocuGardener is ready but hasn't seen a pull request yet on {repo_name}.\n\n"
        "The fastest way to test it:\n"
        "1. Create a branch, change a function signature or add a new endpoint\n"
        "2. Open a PR — DocuGardener runs within 30 seconds\n"
        "3. Check the Checks tab on the PR for the drift report\n\n"
        "Already seen a result? Ignore this — you're ahead of schedule.\n\n"
        f"Open a test PR: {compare_url}\n\n"
        "— The DocuGardener team"
    )
    html = _wrap_html(
        f"<p style='color:#111;font-size:15px;margin:0 0 16px'>Hi {first_name},</p>"
        f"<p style='color:#374151;font-size:14px;margin:0 0 16px'>"
        f"DocuGardener is ready but hasn't seen a pull request yet on "
        f"<strong>{repo_name}</strong>.</p>"
        f"<p style='color:#374151;font-size:14px;margin:0 0 8px'><strong>The fastest way to test it:</strong></p>"
        f"<ol style='color:#374151;font-size:14px;margin:0 0 24px;padding-left:20px'>"
        f"<li>Create a branch, change a function signature or add a new endpoint</li>"
        f"<li>Open a PR — DocuGardener runs within 30 seconds</li>"
        f"<li>Check the <strong>Checks</strong> tab for the drift report</li></ol>"
        f"<p style='color:#6b7280;font-size:13px;margin:0 0 24px'>"
        f"Already seen a result? Ignore this — you're ahead of schedule.</p>"
        + _btn(compare_url, "Open a test PR →")
    )
    return subject, html, text


def build_day3(first_name: str, analyses_used: int, repo_count: int) -> tuple[str, str, str]:
    """Day 3 — Free plan upgrade nudge."""
    subject = f"{first_name}, you're on the Free plan — here's what you're missing"
    billing_url = f"{APP_URL}/dashboard/settings?tab=billing"
    text = (
        f"Hi {first_name},\n\n"
        f"You've been using DocuGardener for 3 days — here's where you stand:\n\n"
        f"Analyses used: {analyses_used} / 50 this month\n"
        f"Repos connected: {repo_count} / 1\n\n"
        "When you hit the limit, new PRs won't be checked until next month.\n\n"
        "Pro plan ($29/month) removes those limits and adds:\n"
        "✓ 10 repos, 500 analyses/month\n"
        "✓ AI auto-fix PRs\n"
        "✓ Slack + Jira notifications\n"
        "✓ Priority support\n\n"
        f"Upgrade to Pro: {billing_url}\n\n"
        "Still evaluating? No pressure — Free stays free forever for 1 repo.\n\n"
        "— The DocuGardener team"
    )
    html = _wrap_html(
        f"<p style='color:#111;font-size:15px;margin:0 0 16px'>Hi {first_name},</p>"
        f"<p style='color:#374151;font-size:14px;margin:0 0 16px'>"
        f"You've been using DocuGardener for 3 days. Here's where you stand:</p>"
        f"<table style='width:100%;border-collapse:collapse;margin:0 0 20px'>"
        f"<tr><td style='padding:8px;background:#f9fafb;border:1px solid #e5e7eb;font-size:13px'>Analyses used</td>"
        f"<td style='padding:8px;background:#f9fafb;border:1px solid #e5e7eb;font-size:13px'><strong>{analyses_used} / 50 this month</strong></td></tr>"
        f"<tr><td style='padding:8px;border:1px solid #e5e7eb;font-size:13px'>Repos connected</td>"
        f"<td style='padding:8px;border:1px solid #e5e7eb;font-size:13px'><strong>{repo_count} / 1</strong></td></tr>"
        f"</table>"
        f"<p style='color:#374151;font-size:14px;margin:0 0 8px'>"
        f"<strong>Pro plan ($29/month)</strong> removes those limits and adds:</p>"
        f"<ul style='color:#374151;font-size:14px;margin:0 0 24px;padding-left:20px'>"
        f"<li>10 repos, 500 analyses/month</li>"
        f"<li>AI auto-fix PRs</li>"
        f"<li>Slack + Jira notifications</li>"
        f"<li>Priority support</li></ul>"
        + _btn(billing_url, "Upgrade to Pro →")
        + "<p style='color:#6b7280;font-size:13px;margin:24px 0 0'>"
        "Still evaluating? No pressure — Free stays free forever for 1 repo.</p>"
    )
    return subject, html, text


def build_day7(first_name: str, repo_name: str, drift_count: int) -> tuple[str, str, str]:
    """Day 7 — weekly check-in."""
    subject = "How's DocuGardener working for you?"
    gh_url = "https://github.com/docugardener/docugardener"
    text = (
        f"Hi {first_name},\n\n"
        f"It's been a week. DocuGardener has caught {drift_count} drift "
        f"finding{'s' if drift_count != 1 else ''} on {repo_name} so far.\n\n"
        + (
            "If that number is 0, it could mean:\n"
            "• No PRs opened yet\n"
            "• Docs are already in great shape\n"
            "• The repos connected don't have much documentation yet\n\n"
            if drift_count == 0
            else ""
        )
        + "If you've found it useful, two things that help us a lot:\n"
        f"1. Star the repo → {gh_url}\n"
        "2. Tell a colleague — word of mouth is how we grow\n\n"
        "If something isn't working right, reply to this email. "
        "We fix reported issues within 48 hours.\n\n"
        "— The DocuGardener team"
    )
    html = _wrap_html(
        f"<p style='color:#111;font-size:15px;margin:0 0 16px'>Hi {first_name},</p>"
        f"<p style='color:#374151;font-size:14px;margin:0 0 16px'>"
        f"It's been a week. DocuGardener has caught <strong>{drift_count} drift "
        f"finding{'s' if drift_count != 1 else ''}</strong> on {repo_name} so far.</p>"
        + (
            "<p style='color:#6b7280;font-size:13px;margin:0 0 16px'>"
            "If that number is 0: no PRs opened yet, docs are in great shape, "
            "or the repos don't have much documentation yet.</p>"
            if drift_count == 0
            else ""
        )
        + "<p style='color:#374151;font-size:14px;margin:0 0 8px'>"
        "<strong>If you've found it useful:</strong></p>"
        "<ol style='color:#374151;font-size:14px;margin:0 0 24px;padding-left:20px'>"
        f"<li><a href='{gh_url}' style='color:#111'>Star the repo</a></li>"
        "<li>Tell a colleague — word of mouth is how we grow</li></ol>"
        "<p style='color:#6b7280;font-size:13px;margin:0'>"
        "Something not working right? Reply to this email — we fix reported issues within 48 hours.</p>"
    )
    return subject, html, text


# ── Drip state helpers ────────────────────────────────────────────────────────

def _get_drip_sent(tenant: Tenant) -> dict[str, bool]:
    cfg = tenant.workflowConfig or {}
    return cfg.get("drip_sent", {})


def _mark_sent(db: Any, tenant: Tenant, day: str) -> None:
    cfg = dict(tenant.workflowConfig or {})
    drip = dict(cfg.get("drip_sent", {}))
    drip[day] = True
    cfg["drip_sent"] = drip
    db.query(Tenant).filter(Tenant.id == tenant.id).update(
        {"workflowConfig": cfg}, synchronize_session=False
    )
    db.commit()


# ── Per-tenant drip logic ─────────────────────────────────────────────────────

def _process_tenant(db: Any, tenant: Tenant, now: datetime) -> None:
    """Evaluate and send any due drip emails for a single tenant."""
    # Resolve ADMIN user → email recipient
    admin = (
        db.query(User)
        .filter(User.tenantId == tenant.id, User.role == "ADMIN")
        .order_by(User.createdAt)
        .first()
    )
    if not admin or not admin.email:
        return

    to = admin.email
    first_name = (admin.name or tenant.name or "there").split()[0]

    # Primary repo for template copy
    repo = (
        db.query(Repository)
        .filter(Repository.tenantId == tenant.id)
        .order_by(Repository.createdAt)
        .first()
    )
    repo_name = repo.name if repo else tenant.name
    repo_count = db.query(Repository).filter(Repository.tenantId == tenant.id).count()

    # Derived stats
    first_job = (
        db.query(Job)
        .filter(Job.tenantId == tenant.id)
        .order_by(Job.createdAt)
        .first()
    )
    # drift_score lives in result JSON — fetch once, derive both stats
    completed_jobs = (
        db.query(Job)
        .filter(Job.tenantId == tenant.id, Job.status == JobStatus.COMPLETED)
        .all()
    )
    analyses_used = len(completed_jobs)
    drift_count = sum(
        1 for j in completed_jobs
        if j.result and (j.result.get("drift_score") or 0) > 0
    )

    created = tenant.createdAt.replace(tzinfo=UTC) if tenant.createdAt.tzinfo is None else tenant.createdAt
    age_days = (now - created).days
    sent = _get_drip_sent(tenant)

    # Day 0 — send within 24h of install
    if not sent.get("day0") and age_days <= 1:
        subject, html, text = build_day0(first_name, repo_name, repo_count)
        if send_drip_email(to, subject, html, text):
            _mark_sent(db, tenant, "day0")

    # Day 1 — no analysis yet
    if not sent.get("day1") and age_days >= 1 and first_job is None:
        subject, html, text = build_day1(first_name, repo_name)
        if send_drip_email(to, subject, html, text):
            _mark_sent(db, tenant, "day1")

    # Day 3 — Free plan nudge
    if not sent.get("day3") and age_days >= 3 and tenant.plan == "FREE":
        subject, html, text = build_day3(first_name, analyses_used, repo_count)
        if send_drip_email(to, subject, html, text):
            _mark_sent(db, tenant, "day3")

    # Day 7 — check-in
    if not sent.get("day7") and age_days >= 7:
        subject, html, text = build_day7(first_name, repo_name, drift_count)
        if send_drip_email(to, subject, html, text):
            _mark_sent(db, tenant, "day7")


# ── Public entry point ────────────────────────────────────────────────────────

def run_drip_scheduler() -> None:
    """
    Daily drip job — called by APScheduler at 09:00 UTC.
    Iterates all tenants and sends any due emails.
    """
    if not settings.smtp_host:
        logger.warning("drip: SMTP_HOST not set — skipping drip run")
        return

    now = datetime.now(UTC)
    db = SessionLocal()
    try:
        tenants = db.query(Tenant).all()
        logger.info("drip: starting daily run", tenant_count=len(tenants))
        sent_total = 0
        for tenant in tenants:
            try:
                before = sum(1 for v in _get_drip_sent(tenant).values() if v)
                _process_tenant(db, tenant, now)
                after = sum(1 for v in _get_drip_sent(tenant).values() if v)
                sent_total += after - before
            except Exception as exc:
                logger.error("drip: error processing tenant", tenant_id=tenant.id, error=str(exc))
        logger.info("drip: daily run complete", emails_sent=sent_total)
    finally:
        db.close()
