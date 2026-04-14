"""Unit tests for the pipeline components."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from src.pipeline.analyzer import (
    FileChange,
    PRAnalysisResult,
    PRAnalyzer,
)
from src.pipeline.reporter import (
    format_drift_report,
    format_check_run_output,
    SEVERITY_EMOJI,
    CHECK_RUN_CONCLUSION,
)
from src.agents.verifier import DriftAnalysis, DocumentationDraft, VerificationResult


class TestFileChange:
    """Tests for FileChange dataclass."""
    
    def test_create_file_change(self):
        """Test creating a file change."""
        change = FileChange(
            path="src/main.py",
            status="modified",
            additions=10,
            deletions=5,
        )
        
        assert change.path == "src/main.py"
        assert change.status == "modified"
        assert change.additions == 10


class TestPRAnalysisResult:
    """Tests for PRAnalysisResult dataclass."""
    
    def test_successful_result(self):
        """Test a successful analysis result."""
        result = PRAnalysisResult(
            pr_number=42,
            repo_full_name="owner/repo",
            drift_analysis=DriftAnalysis(
                drift_score=25,
                severity="moderate",
                required_updates=[],
                block_merge=False,
                summary="Moderate drift",
            ),
            processing_time_ms=1500,
        )
        
        assert result.success
        assert result.drift_score == 25
        assert not result.should_block
    
    def test_failed_result(self):
        """Test a failed analysis result."""
        result = PRAnalysisResult(
            pr_number=42,
            repo_full_name="owner/repo",
            error="Analysis failed",
        )
        
        assert not result.success
        assert result.drift_score == 0
    
    def test_blocking_result(self):
        """Test a result that should block merge."""
        result = PRAnalysisResult(
            pr_number=42,
            repo_full_name="owner/repo",
            drift_analysis=DriftAnalysis(
                drift_score=85,
                severity="critical",
                required_updates=[],
                block_merge=True,
                summary="Critical drift",
            ),
        )
        
        assert result.should_block


class TestFormatDriftReport:
    """Tests for drift report formatting."""
    
    def test_format_successful_report(self):
        """Test formatting a successful report."""
        result = PRAnalysisResult(
            pr_number=42,
            repo_full_name="owner/repo",
            drift_analysis=DriftAnalysis(
                drift_score=30,
                severity="moderate",
                required_updates=[],
                block_merge=False,
                summary="Some docs need updating",
            ),
            processing_time_ms=1000,
        )
        
        report = format_drift_report(result)
        
        assert "DocuGardener" in report
        assert "30/100" in report
        assert "MODERATE" in report
        assert "1000ms" in report
    
    def test_format_failed_report(self):
        """Test formatting a failed report."""
        result = PRAnalysisResult(
            pr_number=42,
            repo_full_name="owner/repo",
            error="Connection timeout",
        )
        
        report = format_drift_report(result)
        
        assert "Analysis Failed" in report
        assert "Connection timeout" in report
    
    def test_format_blocking_report(self):
        """Test formatting a blocking report."""
        result = PRAnalysisResult(
            pr_number=42,
            repo_full_name="owner/repo",
            drift_analysis=DriftAnalysis(
                drift_score=90,
                severity="critical",
                required_updates=[
                    {"file": "docs/api.md", "section": "Auth", "reason": "API changed"},
                ],
                block_merge=True,
                summary="Critical API changes undocumented",
            ),
            processing_time_ms=2000,
        )
        
        report = format_drift_report(result)
        
        assert "blocked" in report.lower()
        assert "docs/api.md" in report
        assert "CRITICAL" in report
    
    def test_format_with_doc_updates(self):
        """Test formatting with documentation updates."""
        result = PRAnalysisResult(
            pr_number=42,
            repo_full_name="owner/repo",
            drift_analysis=DriftAnalysis(
                drift_score=50,
                severity="significant",
                required_updates=[],
                block_merge=False,
                summary="Updates suggested",
            ),
            documentation_updates=[
                DocumentationDraft(
                    entity_name="my_function",
                    file_path="docs/test/my_function.md",
                    content="## my_function\n\nUpdated docs.",
                    verification=VerificationResult(
                        verdict="ACCURATE",
                        confidence=0.95,
                    ),
                ),
            ],
            processing_time_ms=3000,
        )
        
        report = format_drift_report(result)
        
        assert "my_function" in report
        assert "Verified" in report


class TestFormatCheckRunOutput:
    """Tests for Check Run output formatting."""
    
    def test_success_output(self):
        """Test formatting success output."""
        result = PRAnalysisResult(
            pr_number=42,
            repo_full_name="owner/repo",
            drift_analysis=DriftAnalysis(
                drift_score=10,
                severity="minor",
                required_updates=[],
                block_merge=False,
                summary="Minor changes",
            ),
        )
        
        output = format_check_run_output(result)
        
        assert output["conclusion"] == "success"
        assert "10/100" in output["title"]
    
    def test_failure_output(self):
        """Test formatting failure output."""
        result = PRAnalysisResult(
            pr_number=42,
            repo_full_name="owner/repo",
            drift_analysis=DriftAnalysis(
                drift_score=85,
                severity="critical",
                required_updates=[],
                block_merge=True,
                summary="Critical issues",
            ),
        )
        
        output = format_check_run_output(result)
        
        assert output["conclusion"] == "failure"
    
    def test_error_output(self):
        """Test formatting error output."""
        result = PRAnalysisResult(
            pr_number=42,
            repo_full_name="owner/repo",
            error="Analysis failed",
        )
        
        output = format_check_run_output(result)
        
        assert output["conclusion"] == "failure"
        assert "Failed" in output["title"]


class TestSeverityConstants:
    """Tests for severity constants."""
    
    def test_severity_emoji_coverage(self):
        """Test that all severities have emojis."""
        severities = ["none", "minor", "moderate", "significant", "critical"]
        for severity in severities:
            assert severity in SEVERITY_EMOJI
    
    def test_check_run_conclusion_coverage(self):
        """Test that all severities have conclusions."""
        severities = ["none", "minor", "moderate", "significant", "critical"]
        for severity in severities:
            assert severity in CHECK_RUN_CONCLUSION
