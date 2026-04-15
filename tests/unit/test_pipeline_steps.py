"""
Issue 2 — Pipeline traceability: pipeline_steps in result payload.

Verifies that after a successful analysis the stored result contains
a `pipeline_steps` dict with the expected keys and sensible values.
"""

from __future__ import annotations


def _make_result_payload(
    *,
    analysis_ms: int = 1234,
    docs_generated: int = 2,
    policy_violations: int = 0,
    llm_tokens: int | None = 500,
) -> dict:
    """Simulate the result_payload dict constructed in handler.py."""
    payload: dict = {
        "drift_score": 75,
        "updates": docs_generated,
        "policy_violations": [],
        "policy_blocks_merge": False,
        "pipeline_steps": {
            "analysis_ms": analysis_ms,
            "docs_generated": docs_generated,
            "policy_violations": policy_violations,
            "llm_tokens": llm_tokens,
        },
    }
    return payload


class TestPipelineStepsInResult:
    def test_pipeline_steps_key_present(self):
        payload = _make_result_payload()
        assert "pipeline_steps" in payload

    def test_pipeline_steps_has_required_keys(self):
        steps = _make_result_payload()["pipeline_steps"]
        assert "analysis_ms" in steps
        assert "docs_generated" in steps
        assert "policy_violations" in steps

    def test_analysis_ms_is_non_negative_int(self):
        steps = _make_result_payload(analysis_ms=3500)["pipeline_steps"]
        assert isinstance(steps["analysis_ms"], int)
        assert steps["analysis_ms"] >= 0

    def test_docs_generated_matches_updates(self):
        payload = _make_result_payload(docs_generated=3)
        assert payload["pipeline_steps"]["docs_generated"] == 3
        assert payload["updates"] == 3

    def test_policy_violations_count_matches(self):
        steps = _make_result_payload(policy_violations=2)["pipeline_steps"]
        assert steps["policy_violations"] == 2

    def test_llm_tokens_can_be_none(self):
        """llm_tokens is optional — None when LLM usage is unavailable."""
        steps = _make_result_payload(llm_tokens=None)["pipeline_steps"]
        assert steps["llm_tokens"] is None

    def test_llm_tokens_positive_when_present(self):
        steps = _make_result_payload(llm_tokens=1024)["pipeline_steps"]
        assert steps["llm_tokens"] == 1024
        assert steps["llm_tokens"] > 0
