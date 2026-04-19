# SPDX-License-Identifier: AGPL-3.0-or-later
"""
Unit tests for EPIC-01-GAP-02: Welcome email drip sequence.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock, patch

from src.notifications.drip import (
    _get_drip_sent,
    _mark_sent,
    _process_tenant,
    build_day0,
    build_day1,
    build_day3,
    build_day7,
    run_drip_scheduler,
    send_drip_email,
)

# ── Template builders ─────────────────────────────────────────────────────────


class TestBuildDay0:
    def test_subject_and_placeholders(self):
        subject, html, text = build_day0("Alice", "acme/api", 3)
        assert "set up" in subject.lower()
        assert "Alice" in text
        assert "3 repositories" in text
        assert "acme/api" in text

    def test_single_repo_word(self):
        _, _, text = build_day0("Bob", "acme/api", 1)
        assert "1 repository" in text

    def test_html_contains_settings_link(self):
        _, html, _ = build_day0("Alice", "acme/api", 2)
        assert "dashboard/settings" in html


class TestBuildDay1:
    def test_subject_and_repo(self):
        subject, html, text = build_day1("Alice", "acme/api")
        assert "PR" in subject or "result" in subject.lower()
        assert "acme/api" in text

    def test_compare_link_in_html(self):
        _, html, _ = build_day1("Alice", "acme/api")
        assert "github.com/acme/api/compare" in html


class TestBuildDay3:
    def test_subject_contains_name(self):
        subject, _, _ = build_day3("Alice", 12, 1)
        assert "Alice" in subject

    def test_analyses_count_in_text(self):
        _, _, text = build_day3("Alice", 12, 1)
        assert "12 / 50" in text

    def test_billing_link_in_html(self):
        _, html, _ = build_day3("Alice", 5, 1)
        assert "billing" in html


class TestBuildDay7:
    def test_drift_count_in_text(self):
        _, _, text = build_day7("Alice", "acme/api", 7)
        assert "7 drift findings" in text

    def test_singular_finding(self):
        _, _, text = build_day7("Alice", "acme/api", 1)
        assert "1 drift finding" in text

    def test_zero_drift_shows_explanation(self):
        _, html, text = build_day7("Alice", "acme/api", 0)
        assert "0 drift findings" in text
        assert "No PRs opened" in text or "no PRs" in text.lower() or "opened yet" in text

    def test_github_star_link(self):
        _, html, _ = build_day7("Alice", "acme/api", 3)
        assert "github.com/docugardener/docugardener" in html


# ── send_drip_email ───────────────────────────────────────────────────────────


class TestSendDripEmail:
    def test_returns_false_when_smtp_not_configured(self):
        with patch("src.notifications.drip.settings") as mock_settings:
            mock_settings.smtp_host = None
            result = send_drip_email("a@b.com", "subj", "<p>html</p>", "text")
        assert result is False

    def test_returns_true_on_success(self):
        with (
            patch("src.notifications.drip.settings") as mock_settings,
            patch("src.notifications.drip._send_smtp") as mock_smtp,
        ):
            mock_settings.smtp_host = "smtp.gmail.com"
            mock_smtp.return_value = None
            result = send_drip_email("a@b.com", "subj", "<p>html</p>", "text")
        assert result is True

    def test_returns_false_on_smtp_error(self):
        with (
            patch("src.notifications.drip.settings") as mock_settings,
            patch("src.notifications.drip._send_smtp", side_effect=Exception("conn refused")),
        ):
            mock_settings.smtp_host = "smtp.gmail.com"
            result = send_drip_email("a@b.com", "subj", "<p>html</p>", "text")
        assert result is False


# ── Drip state helpers ────────────────────────────────────────────────────────


class TestDripState:
    def _make_tenant(self, workflow_config=None):
        t = MagicMock()
        t.workflowConfig = workflow_config
        return t

    def test_get_drip_sent_empty(self):
        t = self._make_tenant(None)
        assert _get_drip_sent(t) == {}

    def test_get_drip_sent_partial(self):
        t = self._make_tenant({"drip_sent": {"day0": True}})
        assert _get_drip_sent(t) == {"day0": True}

    def test_mark_sent_writes_to_db(self):
        t = self._make_tenant({"other": "value"})
        t.id = "tenant-1"
        db = MagicMock()
        db.query.return_value.filter.return_value.update = MagicMock()
        _mark_sent(db, t, "day0")
        db.commit.assert_called_once()


# ── _process_tenant ───────────────────────────────────────────────────────────


def _make_db(
    tenant_created_days_ago=0,
    plan="FREE",
    has_admin=True,
    first_name="Alice",
    repo_name="acme/api",
    repo_count=1,
    first_job=None,
    completed_jobs=None,
    drip_sent=None,
):
    db = MagicMock()
    now = datetime.now(UTC)

    tenant = MagicMock()
    tenant.id = "t1"
    tenant.name = "Acme"
    tenant.plan = plan
    tenant.createdAt = (now - timedelta(days=tenant_created_days_ago)).replace(tzinfo=None)
    tenant.workflowConfig = {"drip_sent": drip_sent} if drip_sent else {}

    admin = MagicMock() if has_admin else None
    if admin:
        admin.email = "alice@acme.com"
        admin.name = first_name
        admin.role = "ADMIN"

    repo = MagicMock()
    repo.name = repo_name

    # Wire db.query().filter().* chains
    def query_side_effect(model):
        q = MagicMock()
        q.filter.return_value = q
        q.order_by.return_value = q
        q.first.return_value = admin if str(model) == str(type(admin)) else repo
        q.count.return_value = repo_count
        q.all.return_value = completed_jobs or []
        return q

    db.query.side_effect = query_side_effect

    # Simplify: return admin for User queries, repo for Repository, jobs for Job
    from src.storage.sql_models import Job, Repository, User

    def query_dispatch(model):
        q = MagicMock()
        q.filter.return_value = q
        q.order_by.return_value = q
        if model is User:
            q.first.return_value = admin
        elif model is Repository:
            q.first.return_value = repo
            q.count.return_value = repo_count
        elif model is Job:
            q.first.return_value = first_job
            q.all.return_value = completed_jobs or []
            q.count.return_value = len(completed_jobs) if completed_jobs else 0
        return q

    db.query.side_effect = query_dispatch
    return db, tenant, now


class TestProcessTenant:
    def test_skips_tenant_with_no_admin(self):
        db, tenant, now = _make_db(tenant_created_days_ago=0, has_admin=False)
        with patch("src.notifications.drip.send_drip_email") as mock_send:
            _process_tenant(db, tenant, now)
        mock_send.assert_not_called()

    def test_sends_day0_on_install_day(self):
        db, tenant, now = _make_db(tenant_created_days_ago=0)
        with (
            patch("src.notifications.drip.send_drip_email", return_value=True) as mock_send,
            patch("src.notifications.drip._mark_sent"),
        ):
            _process_tenant(db, tenant, now)
        subjects = [c.args[1] for c in mock_send.call_args_list]
        assert any("set up" in s.lower() for s in subjects)

    def test_skips_day0_if_already_sent(self):
        db, tenant, now = _make_db(tenant_created_days_ago=0, drip_sent={"day0": True})
        with (
            patch("src.notifications.drip.send_drip_email", return_value=True) as mock_send,
            patch("src.notifications.drip._mark_sent"),
        ):
            _process_tenant(db, tenant, now)
        subjects = [c.args[1] for c in mock_send.call_args_list]
        assert not any("set up" in s.lower() for s in subjects)

    def test_sends_day1_when_no_jobs(self):
        db, tenant, now = _make_db(tenant_created_days_ago=1, first_job=None)
        with (
            patch("src.notifications.drip.send_drip_email", return_value=True) as mock_send,
            patch("src.notifications.drip._mark_sent"),
        ):
            _process_tenant(db, tenant, now)
        subjects = [c.args[1] for c in mock_send.call_args_list]
        assert any("PR" in s or "result" in s.lower() for s in subjects)

    def test_skips_day1_when_job_exists(self):
        first_job = MagicMock()
        db, tenant, now = _make_db(tenant_created_days_ago=1, first_job=first_job)
        with (
            patch("src.notifications.drip.send_drip_email", return_value=True) as mock_send,
            patch("src.notifications.drip._mark_sent"),
        ):
            _process_tenant(db, tenant, now)
        subjects = [c.args[1] for c in mock_send.call_args_list]
        assert not any("PR" in s or "result" in s.lower() for s in subjects)

    def test_skips_day3_for_paid_plan(self):
        db, tenant, now = _make_db(tenant_created_days_ago=3, plan="PRO")
        with (
            patch("src.notifications.drip.send_drip_email", return_value=True) as mock_send,
            patch("src.notifications.drip._mark_sent"),
        ):
            _process_tenant(db, tenant, now)
        subjects = [c.args[1] for c in mock_send.call_args_list]
        assert not any("missing" in s.lower() or "upgrade" in s.lower() for s in subjects)

    def test_sends_day7_after_one_week(self):
        db, tenant, now = _make_db(tenant_created_days_ago=7)
        with (
            patch("src.notifications.drip.send_drip_email", return_value=True) as mock_send,
            patch("src.notifications.drip._mark_sent"),
        ):
            _process_tenant(db, tenant, now)
        subjects = [c.args[1] for c in mock_send.call_args_list]
        assert any("working for you" in s.lower() for s in subjects)


# ── run_drip_scheduler ────────────────────────────────────────────────────────


class TestRunDripScheduler:
    def test_exits_early_without_smtp(self):
        with (
            patch("src.notifications.drip.settings") as mock_settings,
            patch("src.notifications.drip.SessionLocal") as mock_session,
        ):
            mock_settings.smtp_host = None
            run_drip_scheduler()
        mock_session.assert_not_called()

    def test_processes_all_tenants(self):
        t1, t2 = MagicMock(), MagicMock()
        t1.id = "t1"
        t2.id = "t2"
        t1.createdAt = datetime.now(UTC).replace(tzinfo=None)
        t2.createdAt = datetime.now(UTC).replace(tzinfo=None)
        t1.workflowConfig = {}
        t2.workflowConfig = {}

        db = MagicMock()
        db.query.return_value.all.return_value = [t1, t2]

        with (
            patch("src.notifications.drip.settings") as mock_settings,
            patch("src.notifications.drip.SessionLocal", return_value=db),
            patch("src.notifications.drip._process_tenant") as mock_process,
        ):
            mock_settings.smtp_host = "smtp.gmail.com"
            run_drip_scheduler()

        assert mock_process.call_count == 2
