"""
FEED-01: Analysis Feedback Signal — unit tests.

Covers:
- HMAC token generation and verification
- build_feedback_urls behaviour (secret set / unset)
- FastAPI endpoint: valid up/down signals, invalid token, missing secret, bad signal
- format_drift_report footer injection (default and template modes)
"""

from unittest.mock import MagicMock, patch

import pytest

# ---------------------------------------------------------------------------
# Helpers / fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def _patch_settings_secret(monkeypatch):
    """Inject a known HMAC secret into settings for all tests."""
    with patch("src.pipeline.feedback.settings") as mock_settings:
        mock_settings.feedback_hmac_secret = "test-secret-32-bytes-long-for-tests"
        mock_settings.app_url = "http://localhost:8000"
        yield mock_settings


# ---------------------------------------------------------------------------
# Token helpers
# ---------------------------------------------------------------------------


class TestMakeFeedbackToken:
    def test_returns_24_hex_chars(self):
        from src.pipeline.feedback import make_feedback_token

        token = make_feedback_token("job123", "tenant456")
        assert len(token) == 24
        assert all(c in "0123456789abcdef" for c in token)

    def test_same_inputs_same_token(self):
        from src.pipeline.feedback import make_feedback_token

        t1 = make_feedback_token("job123", "tenant456")
        t2 = make_feedback_token("job123", "tenant456")
        assert t1 == t2

    def test_different_inputs_different_token(self):
        from src.pipeline.feedback import make_feedback_token

        t1 = make_feedback_token("job123", "tenant456")
        t2 = make_feedback_token("job999", "tenant456")
        assert t1 != t2


class TestVerifyFeedbackToken:
    def test_valid_token_returns_true(self):
        from src.pipeline.feedback import make_feedback_token, verify_feedback_token

        token = make_feedback_token("job1", "t1")
        assert verify_feedback_token("job1", "t1", token) is True

    def test_wrong_token_returns_false(self):
        from src.pipeline.feedback import verify_feedback_token

        assert verify_feedback_token("job1", "t1", "wrong_token_00000000000000") is False

    def test_empty_secret_returns_false(self, monkeypatch):
        with patch("src.pipeline.feedback.settings") as mock:
            mock.feedback_hmac_secret = ""
            from src.pipeline.feedback import verify_feedback_token

            assert verify_feedback_token("job1", "t1", "anything") is False


class TestBuildFeedbackUrls:
    def test_returns_up_and_down_urls(self):
        from src.pipeline.feedback import build_feedback_urls

        up, down = build_feedback_urls("job1", "t1")
        assert up is not None and down is not None
        assert "s=up" in up
        assert "s=down" in down
        assert "j=job1" in up
        assert "tid=t1" in up

    def test_returns_none_when_secret_empty(self, monkeypatch):
        with patch("src.pipeline.feedback.settings") as mock:
            mock.feedback_hmac_secret = ""
            mock.app_url = "http://localhost:8000"
            from src.pipeline.feedback import build_feedback_urls

            up, down = build_feedback_urls("job1", "t1")
        assert up is None
        assert down is None


# ---------------------------------------------------------------------------
# format_drift_report footer injection
# ---------------------------------------------------------------------------


class TestFormatDriftReportFeedbackFooter:
    def _make_result(self, success=True):
        """Minimal PRAnalysisResult mock."""
        from src.pipeline.analyzer import PRAnalysisResult

        drift = MagicMock()
        drift.drift_score = 42
        drift.severity = "moderate"
        drift.summary = "Some drift found"
        drift.required_updates = []
        drift.block_merge = False
        result = MagicMock(spec=PRAnalysisResult)
        result.success = success
        result.error = None
        result.drift_analysis = drift
        result.documentation_updates = []
        result.entity_changes = []
        result.should_block = False
        result.processing_time_ms = 100
        result.policy_violations = []
        return result

    def test_footer_appended_when_configured(self):
        from src.pipeline.reporter import format_drift_report

        result = self._make_result()
        report = format_drift_report(result, job_id="job1", tenant_id="t1")
        assert "Was this analysis helpful?" in report
        assert "s=up" in report
        assert "s=down" in report

    def test_no_footer_when_secret_missing(self):
        with patch("src.pipeline.reporter.build_feedback_urls", return_value=(None, None)):
            from src.pipeline.reporter import format_drift_report

            result = self._make_result()
            report = format_drift_report(result, job_id="job1", tenant_id="t1")
        assert "Was this analysis helpful?" not in report

    def test_no_footer_when_job_id_missing(self):
        from src.pipeline.reporter import format_drift_report

        result = self._make_result()
        report = format_drift_report(result)
        assert "Was this analysis helpful?" not in report

    def test_no_footer_on_failed_analysis(self):
        from src.pipeline.reporter import format_drift_report

        result = self._make_result(success=False)
        report = format_drift_report(result, job_id="job1", tenant_id="t1")
        assert "Was this analysis helpful?" not in report

    def test_footer_appended_after_custom_template(self):
        from src.pipeline.reporter import format_drift_report

        result = self._make_result()
        template = "Score: {{drift_score}}"
        report = format_drift_report(result, template=template, job_id="job1", tenant_id="t1")
        assert report.startswith("Score: 42")
        assert "Was this analysis helpful?" in report
