"""
QUALITY-01: Unit tests for src/pipeline/reporter.py

Covers format_drift_report() and format_check_run_output().
All tests are pure-Python — no network, DB, or GitHub client required.
"""

from dataclasses import dataclass, field

import pytest

from src.pipeline.reporter import format_drift_report, format_check_run_output
from src.pipeline.analyzer import PRAnalysisResult
from src.agents.verifier import DriftAnalysis, DocumentationDraft, VerificationResult


# ── Helpers ───────────────────────────────────────────────────────────────────

def _drift(
    score: int = 30,
    severity: str = "minor",
    summary: str = "Minor drift detected",
    required_updates: list | None = None,
    block_merge: bool = False,
    confidence: float = 1.0,
) -> DriftAnalysis:
    return DriftAnalysis(
        drift_score=score,
        severity=severity,
        required_updates=required_updates or [],
        block_merge=block_merge,
        summary=summary,
        confidence_score=confidence,
    )


def _result(
    pr_number: int = 42,
    repo: str = "org/repo",
    drift: DriftAnalysis | None = None,
    updates: list | None = None,
    error: str | None = None,
    processing_time_ms: int = 1500,
) -> PRAnalysisResult:
    return PRAnalysisResult(
        pr_number=pr_number,
        repo_full_name=repo,
        drift_analysis=drift,
        documentation_updates=updates or [],
        processing_time_ms=processing_time_ms,
        error=error,
    )


def _draft(entity: str = "MyClass", verified: bool = True) -> DocumentationDraft:
    vr = VerificationResult(verdict="ACCURATE", confidence=0.9, issues=[], suggestions=[])
    return DocumentationDraft(
        entity_name=entity,
        file_path=f"docs/{entity}.md",
        content=f"## {entity}\n\nDocs here.",
        verification=vr if verified else None,
    )


# ── format_drift_report — failed analysis ─────────────────────────────────────

class TestFormatDriftReportFailed:

    def test_failed_analysis_shows_error(self):
        result = _result(error="LLM timeout")
        report = format_drift_report(result)

        assert "Analysis Failed" in report
        assert "LLM timeout" in report

    def test_failed_analysis_has_header(self):
        result = _result(error="bad token")
        report = format_drift_report(result)

        assert "DocuGardener" in report

    def test_no_drift_analysis_returns_placeholder(self):
        result = _result(drift=None)
        report = format_drift_report(result)

        assert "DocuGardener" in report
        assert "No drift analysis" in report


# ── format_drift_report — clean repo (no drift) ───────────────────────────────

class TestFormatDriftReportNoDrift:

    def test_header_present(self):
        result = _result(drift=_drift(score=0, severity="none", summary="All good."))
        report = format_drift_report(result)

        assert "DocuGardener" in report

    def test_severity_in_report(self):
        result = _result(drift=_drift(score=0, severity="none"))
        report = format_drift_report(result)

        assert "NONE" in report

    def test_no_required_updates_section_when_empty(self):
        result = _result(drift=_drift(required_updates=[]))
        report = format_drift_report(result)

        assert "Required Documentation Updates" not in report

    def test_processing_time_in_footer(self):
        result = _result(drift=_drift(), processing_time_ms=2345)
        report = format_drift_report(result)

        assert "2345ms" in report

    def test_no_block_notice_when_not_blocking(self):
        result = _result(drift=_drift(block_merge=False))
        report = format_drift_report(result)

        assert "blocked" not in report.lower()


# ── format_drift_report — high drift ──────────────────────────────────────────

class TestFormatDriftReportHighDrift:

    def test_required_updates_section_shown(self):
        updates = [{"file": "src/api.py", "section": "ApiClient", "reason": "New param"}]
        result = _result(drift=_drift(score=85, severity="critical", required_updates=updates))
        report = format_drift_report(result)

        assert "Required Documentation Updates" in report
        assert "src/api.py" in report

    def test_block_notice_shown_when_blocking(self):
        result = _result(drift=_drift(score=90, severity="critical", block_merge=True))
        report = format_drift_report(result)

        assert "blocked" in report.lower()

    def test_drift_score_value_present(self):
        result = _result(drift=_drift(score=78, severity="significant"))
        report = format_drift_report(result)

        assert "78" in report

    def test_summary_text_present(self):
        result = _result(drift=_drift(summary="Authentication module changed significantly."))
        report = format_drift_report(result)

        assert "Authentication module changed significantly." in report


# ── format_drift_report — documentation drafts ────────────────────────────────

class TestFormatDriftReportDrafts:

    def test_drafts_section_shown_when_present(self):
        result = _result(
            drift=_drift(),
            updates=[_draft("UserService", verified=True)],
        )
        report = format_drift_report(result)

        assert "Suggested Documentation Updates" in report
        assert "UserService" in report

    def test_verified_draft_shows_verified_label(self):
        result = _result(drift=_drift(), updates=[_draft("MyClass", verified=True)])
        report = format_drift_report(result)

        assert "Verified" in report

    def test_unverified_draft_shows_unverified_label(self):
        result = _result(drift=_drift(), updates=[_draft("MyClass", verified=False)])
        report = format_drift_report(result)

        assert "Unverified" in report

    def test_no_drafts_section_when_empty(self):
        result = _result(drift=_drift(), updates=[])
        report = format_drift_report(result)

        assert "Suggested Documentation Updates" not in report


# ── format_drift_report — custom template ─────────────────────────────────────

class TestFormatDriftReportTemplate:

    def test_template_variables_substituted(self):
        updates = [{"file": "src/auth.py", "section": "login", "reason": "Param added"}]
        result = _result(
            drift=_drift(score=55, summary="Auth drift"),
            updates=[_draft("login")],
        )
        template = "Score: {{drift_score}} | Summary: {{summary}}"
        report = format_drift_report(result, template=template)

        assert "Score: 55" in report
        assert "Summary: Auth drift" in report

    def test_empty_template_falls_back_to_default(self):
        result = _result(drift=_drift(score=10))
        report = format_drift_report(result, template="   ")

        assert "DocuGardener" in report

    def test_none_template_uses_default(self):
        result = _result(drift=_drift(score=10))
        report = format_drift_report(result, template=None)

        assert "DocuGardener" in report

    def test_template_files_list_placeholder(self):
        updates = [{"file": "docs/api.md", "section": "Endpoint", "reason": ""}]
        result = _result(drift=_drift(required_updates=updates))
        template = "Updates: {{files_list}}"
        report = format_drift_report(result, template=template)

        assert "docs/api.md" in report


# ── format_check_run_output ───────────────────────────────────────────────────

class TestFormatCheckRunOutput:

    def test_failed_result_returns_failure_conclusion(self):
        result = _result(error="timeout")
        output = format_check_run_output(result)

        assert output["conclusion"] == "failure"
        assert "Analysis Failed" in output["title"]

    def test_no_drift_analysis_returns_neutral(self):
        result = _result(drift=None)
        output = format_check_run_output(result)

        assert output["conclusion"] == "neutral"

    def test_none_severity_maps_to_success(self):
        result = _result(drift=_drift(score=0, severity="none"))
        output = format_check_run_output(result)

        assert output["conclusion"] == "success"

    def test_critical_severity_maps_to_failure(self):
        result = _result(drift=_drift(score=95, severity="critical", block_merge=True))
        output = format_check_run_output(result)

        assert output["conclusion"] == "failure"

    def test_moderate_severity_maps_to_neutral(self):
        result = _result(drift=_drift(score=50, severity="moderate"))
        output = format_check_run_output(result)

        assert output["conclusion"] == "neutral"

    def test_title_contains_score(self):
        result = _result(drift=_drift(score=67, severity="significant"))
        output = format_check_run_output(result)

        assert "67" in output["title"]

    def test_details_block_present(self):
        result = _result(drift=_drift(score=40, severity="minor"))
        output = format_check_run_output(result)

        assert "details" in output
        assert output["details"]["drift_score"] == 40
