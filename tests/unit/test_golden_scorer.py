# SPDX-License-Identifier: AGPL-3.0-or-later
"""
EPIC-13 TDD — Golden scorer tests.

The GoldenScorer is an offline keyword-coverage rubric evaluator.
No LLM is invoked.  A generated doc string is scored against
expected_keywords.json + rubric.yaml from a fixture case.

  GS-01  All cases load without error
  GS-02  Rubric parses weights correctly
  GS-03  Perfect output scores >= pass_threshold on case_01
  GS-04  Deliberately poor output scores below pass_threshold on case_01
  GS-05  must_not_contain hit penalises the score
  GS-06  Missing required keyword lowers required_coverage
  GS-07  Score is clamped to [0.0, 1.0]
"""

from __future__ import annotations

from pathlib import Path

from scripts.score_golden import GoldenCase, GoldenScorer

FIXTURES_DIR = Path(__file__).resolve().parents[2] / "tests" / "fixtures" / "golden"


# ---------------------------------------------------------------------------
# GS-01  All cases load
# ---------------------------------------------------------------------------


class TestCaseLoading:
    def test_gs01_all_cases_load(self):
        """GS-01: Every case directory in fixtures/golden loads without error."""
        scorer = GoldenScorer(FIXTURES_DIR)
        cases = scorer.load_cases()
        assert len(cases) >= 3  # at least the 3 seeded cases
        for case in cases:
            assert isinstance(case, GoldenCase)
            assert case.case_id
            assert case.required_keywords
            assert case.rubric_weights


# ---------------------------------------------------------------------------
# GS-02  Rubric parsing
# ---------------------------------------------------------------------------


class TestRubricParsing:
    def test_gs02_rubric_weights_sum_to_one(self):
        """GS-02: Weights in every rubric sum to 1.0 (within float tolerance)."""
        scorer = GoldenScorer(FIXTURES_DIR)
        cases = scorer.load_cases()
        for case in cases:
            total = sum(case.rubric_weights.values())
            assert abs(total - 1.0) < 1e-6, f"{case.case_id} weights sum to {total}"


# ---------------------------------------------------------------------------
# GS-03  Perfect output passes
# ---------------------------------------------------------------------------


class TestScoringPasses:
    def test_gs03_perfect_output_passes_case_01(self):
        """GS-03: Output containing all required+preferred keywords scores >= pass_threshold."""
        scorer = GoldenScorer(FIXTURES_DIR)
        case = scorer.load_case("case_01_stale_params")

        # Craft output that hits every required keyword
        perfect_output = (
            "The `create_webhook` function now accepts three parameters: "
            "`url` (str), `secret` (str — the HMAC signing secret), and "
            "`event_types` (list[str]) specifying which events to subscribe to. "
            "Returns a webhook config dict."
        )

        result = scorer.score(case, perfect_output)
        assert result.score >= case.pass_threshold, (
            f"Expected score >= {case.pass_threshold}, got {result.score:.3f}\n"
            f"Breakdown: {result.breakdown}"
        )

    def test_gs03b_perfect_output_passes_case_02(self):
        """GS-03b: case_02 — output with correct new name passes."""
        scorer = GoldenScorer(FIXTURES_DIR)
        case = scorer.load_case("case_02_renamed_function")

        perfect_output = (
            "## fetch_user\n\n"
            "Fetch a user by their unique identifier (`user_id`).\n\n"
            "**Parameters**\n"
            "- `user_id` (str): The user's ID.\n"
            "- `include_roles` (bool): If True, attach the user's roles.\n\n"
            "**Returns** dict with optional `roles` key."
        )

        result = scorer.score(case, perfect_output)
        assert result.score >= case.pass_threshold


# ---------------------------------------------------------------------------
# GS-04  Poor output fails
# ---------------------------------------------------------------------------


class TestScoringFails:
    def test_gs04_poor_output_fails_case_01(self):
        """GS-04: Output missing required keywords scores below pass_threshold."""
        scorer = GoldenScorer(FIXTURES_DIR)
        case = scorer.load_case("case_01_stale_params")

        # Stale output — mentions only the old single-param signature
        poor_output = "The `create_webhook` function creates a webhook given a URL."

        result = scorer.score(case, poor_output)
        assert result.score < case.pass_threshold, (
            f"Expected score < {case.pass_threshold}, got {result.score:.3f}"
        )


# ---------------------------------------------------------------------------
# GS-05  must_not_contain penalty
# ---------------------------------------------------------------------------


class TestMustNotPenalty:
    def test_gs05_must_not_hit_lowers_score(self):
        """GS-05: Output containing a must_not_contain phrase is penalised."""
        scorer = GoldenScorer(FIXTURES_DIR)
        case = scorer.load_case("case_02_renamed_function")

        # Output that references the old (wrong) name
        bad_output = (
            "## get_user\n\n"
            "Retrieve a user. Includes fetch_user and include_roles parameters and returns roles dict."
        )

        result = scorer.score(case, bad_output)
        assert result.must_not_hits >= 1
        # Score penalised vs equivalent output without the bad phrase
        clean_output = (
            "## fetch_user\n\n"
            "Retrieve a user. Includes fetch_user and include_roles parameters and returns roles dict."
        )
        clean_result = scorer.score(case, clean_output)
        assert result.score < clean_result.score


# ---------------------------------------------------------------------------
# GS-06  Missing required keyword
# ---------------------------------------------------------------------------


class TestRequiredKeywordCoverage:
    def test_gs06_missing_required_keyword_lowers_required_coverage(self):
        """GS-06: Each missing required keyword reduces required_coverage proportionally."""
        scorer = GoldenScorer(FIXTURES_DIR)
        case = scorer.load_case("case_01_stale_params")

        # Hit 1 of 4 required keywords (secret only)
        partial_output = "The function now requires a secret parameter for HMAC authentication."
        result = scorer.score(case, partial_output)

        assert result.breakdown["required_coverage"] < 1.0


# ---------------------------------------------------------------------------
# GS-07  Score clamping
# ---------------------------------------------------------------------------


class TestScoreClamping:
    def test_gs07_score_clamped_to_zero_one(self):
        """GS-07: Score never goes below 0.0 or above 1.0 regardless of input."""
        scorer = GoldenScorer(FIXTURES_DIR)
        case = scorer.load_case("case_01_stale_params")

        result_empty = scorer.score(case, "")
        assert 0.0 <= result_empty.score <= 1.0

        result_perfect = scorer.score(
            case,
            "secret event_types HMAC signing list str subscribe webhook url",
        )
        assert 0.0 <= result_perfect.score <= 1.0
