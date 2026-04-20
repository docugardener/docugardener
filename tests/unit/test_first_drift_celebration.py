# SPDX-License-Identifier: AGPL-3.0-or-later
"""
EPIC-01-GAP-05: Unit tests for "first drift detected" celebration moment.

Covers:
  1. is_first_drift_for_tenant() helper
  2. format_drift_report() celebration banner rendering
  3. Email subject / HTML update when is_first_drift=True
"""

from unittest.mock import patch

import pytest

from src.notifications.first_analysis_email import (
    _build_email_html,
    is_first_drift_for_tenant,
)
from src.agents.verifier import DriftAnalysis
from src.pipeline.analyzer import PRAnalysisResult
from src.pipeline.reporter import format_drift_report


# ── is_first_drift_for_tenant ─────────────────────────────────────────────────


class TestIsFirstDriftForTenant:
    def test_returns_true_when_first_completed_job_has_drift(self):
        with patch(
            "src.notifications.first_analysis_email._is_first_completed_job",
            return_value=True,
        ):
            assert is_first_drift_for_tenant("tenant-1", drift_score=45.0) is True

    def test_returns_false_when_drift_score_is_zero(self):
        with patch(
            "src.notifications.first_analysis_email._is_first_completed_job",
            return_value=True,
        ):
            assert is_first_drift_for_tenant("tenant-1", drift_score=0.0) is False

    def test_returns_false_when_drift_score_negative(self):
        # defensive: negative drift_score treated as no drift
        with patch(
            "src.notifications.first_analysis_email._is_first_completed_job",
            return_value=True,
        ):
            assert is_first_drift_for_tenant("tenant-1", drift_score=-1.0) is False

    def test_returns_false_when_not_first_completed_job(self):
        with patch(
            "src.notifications.first_analysis_email._is_first_completed_job",
            return_value=False,
        ):
            assert is_first_drift_for_tenant("tenant-1", drift_score=50.0) is False

    def test_returns_false_when_not_first_job_and_no_drift(self):
        with patch(
            "src.notifications.first_analysis_email._is_first_completed_job",
            return_value=False,
        ):
            assert is_first_drift_for_tenant("tenant-1", drift_score=0.0) is False


# ── format_drift_report — celebration banner ──────────────────────────────────

def _make_result(drift_score: int = 45) -> PRAnalysisResult:
    drift = DriftAnalysis(
        drift_score=drift_score,
        severity="moderate" if drift_score >= 40 else "none",
        summary="Some docs are outdated.",
        required_updates=[],
        block_merge=False,
    )
    return PRAnalysisResult(
        pr_number=42,
        repo_full_name="org/repo",
        drift_analysis=drift,
    )


class TestCelebrationBannerInPRComment:
    def test_celebration_shown_when_first_drift_and_has_drift(self):
        result = _make_result(drift_score=45)
        report = format_drift_report(result, is_first_drift=True)
        assert "🎉" in report
        assert "first documentation drift" in report.lower()

    def test_celebration_not_shown_when_is_first_drift_false(self):
        result = _make_result(drift_score=45)
        report = format_drift_report(result, is_first_drift=False)
        assert "🎉" not in report

    def test_celebration_not_shown_when_drift_score_zero(self):
        result = _make_result(drift_score=0)
        report = format_drift_report(result, is_first_drift=True)
        assert "🎉" not in report

    def test_report_still_has_standard_sections(self):
        result = _make_result(drift_score=45)
        report = format_drift_report(result, is_first_drift=True)
        # Standard header must be present even with celebration
        assert "## 🌱 DocuGardener Analysis" in report
        assert "Documentation Drift" in report

    def test_celebration_appears_before_drift_section(self):
        result = _make_result(drift_score=45)
        report = format_drift_report(result, is_first_drift=True)
        celebration_pos = report.index("🎉")
        drift_pos = report.index("Documentation Drift")
        assert celebration_pos < drift_pos


# ── _build_email_html — celebration wording ────────────────────────────────────


class TestCelebrationEmail:
    def test_celebration_header_in_html_when_is_first_drift(self):
        html = _build_email_html(
            pr_number=1,
            repo_full_name="org/repo",
            drift_score=0.5,
            summary_text="Some docs need updating.",
            app_url="https://app.docugardener.dev",
            is_first_drift=True,
        )
        assert "🎉" in html
        assert "first documentation drift" in html.lower()

    def test_no_celebration_header_when_is_first_drift_false(self):
        html = _build_email_html(
            pr_number=1,
            repo_full_name="org/repo",
            drift_score=0.5,
            summary_text="Some docs need updating.",
            app_url="https://app.docugardener.dev",
            is_first_drift=False,
        )
        # Default title, no celebration banner
        assert "Your first drift report is ready" in html
        assert "#166534" not in html  # celebration banner bg colour not present

    def test_celebration_title_when_is_first_drift_and_has_drift(self):
        html = _build_email_html(
            pr_number=1,
            repo_full_name="org/repo",
            drift_score=0.5,
            summary_text="Docs outdated.",
            app_url="https://app.docugardener.dev",
            is_first_drift=True,
        )
        assert "first documentation drift is detected" in html.lower()

    def test_no_celebration_when_drift_zero_even_if_is_first_drift_true(self):
        html = _build_email_html(
            pr_number=1,
            repo_full_name="org/repo",
            drift_score=0.0,
            summary_text="No drift.",
            app_url="https://app.docugardener.dev",
            is_first_drift=True,
        )
        # drift_score == 0 means no real drift → use default title
        assert "Your first drift report is ready" in html
