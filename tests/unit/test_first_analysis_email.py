# SPDX-License-Identifier: AGPL-3.0-or-later
"""
Unit tests for src/notifications/first_analysis_email.py

Tests cover:
- Email sent when job count == 1
- Email NOT sent when job count > 1
- Job completion unaffected when email send fails
- Email NOT sent when RESEND_API_KEY is absent
"""
from __future__ import annotations

from contextlib import contextmanager
from typing import Any, Generator
from unittest.mock import MagicMock, patch

import httpx
import pytest

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_TENANT_ID = "tenant_abc123"
_CORRELATION_ID = "corr-xyz-001"
_PR_NUMBER = 42
_REPO = "acme-org/backend"
_SCORE = 0.65
_SUMMARY = "Several API endpoints are missing parameter descriptions."
_APP_URL = "https://app.docugardener.dev"
_ADMIN_EMAILS = ["alice@example.com", "bob@example.com"]
_API_KEY = "re_test_key_123"


# ---------------------------------------------------------------------------
# Mock helpers
# ---------------------------------------------------------------------------


def _make_count_cm(count: int):
    """Return a context-manager mock whose session returns *count* from scalar_one()."""
    session = MagicMock()
    session.execute.return_value.scalar_one.return_value = count

    @contextmanager
    def _cm() -> Generator[Any, None, None]:
        yield session

    return _cm


def _make_rows_cm(emails: list[str]):
    """Return a context-manager mock whose session returns email rows from all()."""
    session = MagicMock()
    session.execute.return_value.all.return_value = [(e,) for e in emails]

    @contextmanager
    def _cm() -> Generator[Any, None, None]:
        yield session

    return _cm


def _make_session_factory(job_count: int, admin_emails: list[str]):
    """
    Return a callable that acts as SessionLocal(), returning:
      - first call:  count context manager
      - second call: email rows context manager
    """
    calls = [0]
    count_cm = _make_count_cm(job_count)
    rows_cm = _make_rows_cm(admin_emails)

    def factory():
        calls[0] += 1
        if calls[0] == 1:
            return count_cm()
        return rows_cm()

    return factory


def _make_ok_response() -> MagicMock:
    resp = MagicMock()
    resp.raise_for_status.return_value = None
    return resp


def _common_kwargs(**overrides: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "tenant_id": _TENANT_ID,
        "pr_number": _PR_NUMBER,
        "repo_full_name": _REPO,
        "drift_score": _SCORE,
        "summary_text": _SUMMARY,
        "correlation_id": _CORRELATION_ID,
    }
    base.update(overrides)
    return base


# ---------------------------------------------------------------------------
# _severity_label
# ---------------------------------------------------------------------------


class TestSeverityLabel:
    def test_significant(self) -> None:
        from src.notifications.first_analysis_email import _severity_label

        assert _severity_label(0.8) == "significant"

    def test_significant_at_boundary(self) -> None:
        from src.notifications.first_analysis_email import _severity_label

        assert _severity_label(0.7) == "significant"

    def test_moderate(self) -> None:
        from src.notifications.first_analysis_email import _severity_label

        assert _severity_label(0.5) == "moderate"

    def test_moderate_at_boundary(self) -> None:
        from src.notifications.first_analysis_email import _severity_label

        assert _severity_label(0.4) == "moderate"

    def test_minor(self) -> None:
        from src.notifications.first_analysis_email import _severity_label

        assert _severity_label(0.2) == "minor"

    def test_minor_at_boundary(self) -> None:
        from src.notifications.first_analysis_email import _severity_label

        assert _severity_label(0.1) == "minor"

    def test_none(self) -> None:
        from src.notifications.first_analysis_email import _severity_label

        assert _severity_label(0.0) == "none"

    def test_none_below_threshold(self) -> None:
        from src.notifications.first_analysis_email import _severity_label

        assert _severity_label(0.05) == "none"


# ---------------------------------------------------------------------------
# _build_email_html
# ---------------------------------------------------------------------------


class TestBuildEmailHtml:
    def _html(self, **kwargs: Any) -> str:
        from src.notifications.first_analysis_email import _build_email_html

        defaults = {
            "pr_number": 99,
            "repo_full_name": "org/repo",
            "drift_score": 0.5,
            "summary_text": "Test summary.",
            "app_url": _APP_URL,
        }
        defaults.update(kwargs)
        return _build_email_html(**defaults)

    def test_contains_pr_number(self) -> None:
        assert "#99" in self._html(pr_number=99)

    def test_contains_repo(self) -> None:
        assert "org/repo" in self._html()

    def test_contains_headline(self) -> None:
        assert "first drift report" in self._html()

    def test_summary_short_not_truncated(self) -> None:
        html = self._html(summary_text="Short text.")
        assert "Short text." in html
        assert "…" not in html

    def test_summary_long_truncated_at_200(self) -> None:
        long_text = "A" * 300
        html = self._html(summary_text=long_text)
        assert "A" * 200 in html
        assert "A" * 201 not in html
        assert "…" in html

    def test_cta_link_points_to_inbox(self) -> None:
        html = self._html(app_url="https://app.example.com/")
        assert "https://app.example.com/dashboard/inbox" in html

    def test_footer_one_time_notice(self) -> None:
        assert "one-time notification" in self._html()

    def test_severity_significant_red_badge(self) -> None:
        html = self._html(drift_score=0.8)
        assert "#ef4444" in html

    def test_severity_none_green_badge(self) -> None:
        html = self._html(drift_score=0.0)
        assert "#22c55e" in html


# ---------------------------------------------------------------------------
# _is_first_completed_job
# ---------------------------------------------------------------------------


class TestIsFirstCompletedJob:
    def test_returns_true_when_count_is_1(self) -> None:
        from src.notifications.first_analysis_email import _is_first_completed_job

        with patch(
            "src.notifications.first_analysis_email.SessionLocal",
            side_effect=_make_count_cm(1),
        ):
            assert _is_first_completed_job(_TENANT_ID) is True

    def test_returns_false_when_count_is_0(self) -> None:
        from src.notifications.first_analysis_email import _is_first_completed_job

        with patch(
            "src.notifications.first_analysis_email.SessionLocal",
            side_effect=_make_count_cm(0),
        ):
            assert _is_first_completed_job(_TENANT_ID) is False

    def test_returns_false_when_count_is_5(self) -> None:
        from src.notifications.first_analysis_email import _is_first_completed_job

        with patch(
            "src.notifications.first_analysis_email.SessionLocal",
            side_effect=_make_count_cm(5),
        ):
            assert _is_first_completed_job(_TENANT_ID) is False


# ---------------------------------------------------------------------------
# maybe_send_first_analysis_email — public API
# ---------------------------------------------------------------------------


class TestMaybeSendFirstAnalysisEmail:
    """Full-stack tests for the public fire-and-forget function."""

    def _run(
        self,
        *,
        api_key: str | None = _API_KEY,
        job_count: int = 1,
        admin_emails: list[str] | None = None,
        httpx_side_effect: Exception | None = None,
        session_side_effect: Exception | None = None,
        **kwarg_overrides: Any,
    ) -> MagicMock:
        """Run maybe_send_first_analysis_email with mocked deps; return mock_post."""
        from src.notifications.first_analysis_email import maybe_send_first_analysis_email

        if admin_emails is None:
            admin_emails = _ADMIN_EMAILS

        mock_settings = MagicMock()
        mock_settings.resend_api_key = api_key
        mock_settings.app_url = _APP_URL

        if session_side_effect is not None:
            session_mock = MagicMock(side_effect=session_side_effect)
        else:
            session_mock = MagicMock(
                side_effect=_make_session_factory(job_count, admin_emails)
            )

        mock_post = MagicMock(return_value=_make_ok_response())
        if httpx_side_effect is not None:
            mock_post.side_effect = httpx_side_effect

        with (
            patch("src.notifications.first_analysis_email.settings", mock_settings),
            patch("src.notifications.first_analysis_email.SessionLocal", session_mock),
            patch("src.notifications.first_analysis_email.httpx.post", mock_post),
        ):
            maybe_send_first_analysis_email(**_common_kwargs(**kwarg_overrides))

        return mock_post

    # ── Core send/skip behaviour ─────────────────────────────────────────────

    def test_email_sent_when_first_job(self) -> None:
        """Email is dispatched when completed job count == 1."""
        mock_post = self._run(job_count=1)
        mock_post.assert_called_once()

    def test_email_not_sent_when_job_count_is_zero(self) -> None:
        """Email is NOT dispatched when count == 0 (should never happen but be safe)."""
        mock_post = self._run(job_count=0)
        mock_post.assert_not_called()

    def test_email_not_sent_when_not_first_job(self) -> None:
        """Email is NOT dispatched when completed job count > 1."""
        mock_post = self._run(job_count=3)
        mock_post.assert_not_called()

    def test_email_not_sent_when_no_api_key(self) -> None:
        """Email is NOT dispatched when RESEND_API_KEY is absent."""
        mock_post = self._run(api_key=None, job_count=1)
        mock_post.assert_not_called()

    def test_email_not_sent_when_no_admin_emails(self) -> None:
        """Email is NOT dispatched when the tenant has no ADMIN users."""
        mock_post = self._run(job_count=1, admin_emails=[])
        mock_post.assert_not_called()

    # ── Resilience: job must complete regardless of email failure ────────────

    def test_job_not_affected_when_httpx_raises_connect_error(self) -> None:
        """Job completion is unaffected when HTTP transport raises."""
        exc = httpx.ConnectError("connection refused")
        # Must not propagate — reaching here is the assertion
        self._run(job_count=1, httpx_side_effect=exc)

    def test_job_not_affected_when_resend_returns_http_error(self) -> None:
        """Job completion is unaffected when Resend returns an HTTP error."""
        exc = httpx.HTTPStatusError(
            "422",
            request=MagicMock(),
            response=MagicMock(status_code=422),
        )
        self._run(job_count=1, httpx_side_effect=exc)

    def test_job_not_affected_when_db_count_raises(self) -> None:
        """Job completion is unaffected when the DB count query raises."""
        self._run(
            job_count=1,
            session_side_effect=RuntimeError("DB connection lost"),
        )

    # ── Payload correctness ──────────────────────────────────────────────────

    def test_recipients_match_admin_emails(self) -> None:
        mock_post = self._run(job_count=1, admin_emails=["ceo@corp.com"])
        assert mock_post.call_args.kwargs["json"]["to"] == ["ceo@corp.com"]

    def test_from_address_is_docugardener(self) -> None:
        mock_post = self._run(job_count=1)
        assert "DocuGardener" in mock_post.call_args.kwargs["json"]["from"]

    def test_subject_mentions_drift_report(self) -> None:
        mock_post = self._run(job_count=1)
        subject = mock_post.call_args.kwargs["json"]["subject"]
        assert "drift report" in subject.lower()

    def test_bearer_token_uses_api_key(self) -> None:
        mock_post = self._run(job_count=1, api_key="re_secret_99")
        headers = mock_post.call_args.kwargs["headers"]
        assert headers["Authorization"] == "Bearer re_secret_99"

    def test_pr_number_appears_in_html(self) -> None:
        mock_post = self._run(job_count=1, pr_number=777)
        html = mock_post.call_args.kwargs["json"]["html"]
        assert "#777" in html

    def test_repo_full_name_appears_in_html(self) -> None:
        mock_post = self._run(job_count=1, repo_full_name="my-org/cool-repo")
        html = mock_post.call_args.kwargs["json"]["html"]
        assert "my-org/cool-repo" in html

    def test_inbox_url_in_html(self) -> None:
        mock_post = self._run(job_count=1)
        html = mock_post.call_args.kwargs["json"]["html"]
        assert "/dashboard/inbox" in html

    def test_one_time_footer_in_html(self) -> None:
        mock_post = self._run(job_count=1)
        html = mock_post.call_args.kwargs["json"]["html"]
        assert "one-time notification" in html

    def test_resend_url_is_correct(self) -> None:
        mock_post = self._run(job_count=1)
        url = mock_post.call_args.args[0] if mock_post.call_args.args else mock_post.call_args.kwargs.get("url", "")
        assert "resend.com/emails" in url

    def test_timeout_set_on_http_call(self) -> None:
        mock_post = self._run(job_count=1)
        timeout = mock_post.call_args.kwargs.get("timeout")
        assert timeout is not None
        assert timeout > 0
