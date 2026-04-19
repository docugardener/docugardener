#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
"""
EPIC-13: Golden dataset offline scorer.

Scores a generated documentation string against expected_keywords.json +
rubric.yaml from a fixture case.  No LLM is invoked — fully deterministic.

Usage (CLI):
    python scripts/score_golden.py [--fixtures tests/fixtures/golden] [--case case_01_stale_params]

Usage (import):
    from scripts.score_golden import GoldenScorer, GoldenCase
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass
class GoldenCase:
    """A single scored fixture case."""

    case_id: str
    description: str
    required_keywords: list[str]
    preferred_keywords: list[str]
    must_not_contain: list[str]
    rubric_weights: dict[str, float]
    pass_threshold: float
    input_data: dict[str, Any] = field(default_factory=dict)


@dataclass
class ScoreResult:
    """Result of scoring a generated output against a case."""

    case_id: str
    score: float
    passed: bool
    breakdown: dict[str, float]
    must_not_hits: int
    missing_required: list[str]
    missing_preferred: list[str]


# ---------------------------------------------------------------------------
# Scorer
# ---------------------------------------------------------------------------


class GoldenScorer:
    """
    Offline keyword-coverage scorer for fix PR quality regression testing.

    Scoring formula:
        score = (required_coverage  * w_required)
              + (preferred_coverage * w_preferred)
              - (must_not_hits * 0.10 * w_must_not)
        score = clamp(score, 0.0, 1.0)
    """

    def __init__(self, fixtures_dir: Path) -> None:
        self.fixtures_dir = Path(fixtures_dir)

    # ------------------------------------------------------------------
    # Loading
    # ------------------------------------------------------------------

    def load_cases(self) -> list[GoldenCase]:
        """Load all case directories from fixtures_dir."""
        cases = []
        for case_dir in sorted(self.fixtures_dir.iterdir()):
            if not case_dir.is_dir():
                continue
            if not (case_dir / "input.json").exists():
                continue
            try:
                cases.append(self._load_case_dir(case_dir))
            except Exception as e:
                raise ValueError(f"Failed to load case {case_dir.name}: {e}") from e
        return cases

    def load_case(self, case_id: str) -> GoldenCase:
        """Load a single case by ID (directory name)."""
        case_dir = self.fixtures_dir / case_id
        if not case_dir.exists():
            raise FileNotFoundError(f"Case not found: {case_dir}")
        return self._load_case_dir(case_dir)

    def _load_case_dir(self, case_dir: Path) -> GoldenCase:
        input_data = json.loads((case_dir / "input.json").read_text())
        keywords_data = json.loads((case_dir / "expected_keywords.json").read_text())
        rubric_data = yaml.safe_load((case_dir / "rubric.yaml").read_text())

        weights = rubric_data["weights"]
        # Normalise key names: map yaml keys → internal keys
        rubric_weights = {
            "required_keywords": float(weights.get("required_keywords", 0.5)),
            "preferred_keywords": float(weights.get("preferred_keywords", 0.3)),
            "must_not_violations": float(weights.get("must_not_violations", 0.2)),
        }

        return GoldenCase(
            case_id=case_dir.name,
            description=input_data.get("description", ""),
            required_keywords=keywords_data.get("required", []),
            preferred_keywords=keywords_data.get("preferred", []),
            must_not_contain=keywords_data.get("must_not_contain", []),
            rubric_weights=rubric_weights,
            pass_threshold=float(rubric_data.get("pass_threshold", 0.65)),
            input_data=input_data,
        )

    # ------------------------------------------------------------------
    # Scoring
    # ------------------------------------------------------------------

    def score(self, case: GoldenCase, generated_output: str) -> ScoreResult:
        """Score *generated_output* against *case*.

        Args:
            case: The fixture case with keywords and rubric.
            generated_output: The doc string produced by the LLM (or mock).

        Returns:
            ScoreResult with numeric score, pass/fail, and breakdown.
        """
        text_lower = generated_output.lower()

        # Required keyword coverage
        matched_required = [
            kw for kw in case.required_keywords
            if kw.lower() in text_lower
        ]
        missing_required = [
            kw for kw in case.required_keywords
            if kw.lower() not in text_lower
        ]
        required_coverage = (
            len(matched_required) / len(case.required_keywords)
            if case.required_keywords
            else 1.0
        )

        # Preferred keyword coverage
        matched_preferred = [
            kw for kw in case.preferred_keywords
            if kw.lower() in text_lower
        ]
        missing_preferred = [
            kw for kw in case.preferred_keywords
            if kw.lower() not in text_lower
        ]
        preferred_coverage = (
            len(matched_preferred) / len(case.preferred_keywords)
            if case.preferred_keywords
            else 1.0
        )

        # must_not_contain hits
        must_not_hits = sum(
            1 for phrase in case.must_not_contain
            if phrase.lower() in text_lower
        )

        # Weighted score
        w = case.rubric_weights
        raw_score = (
            required_coverage * w["required_keywords"]
            + preferred_coverage * w["preferred_keywords"]
            - must_not_hits * 0.10 * w["must_not_violations"]
        )
        final_score = max(0.0, min(1.0, raw_score))

        breakdown = {
            "required_coverage": round(required_coverage, 4),
            "preferred_coverage": round(preferred_coverage, 4),
            "must_not_hits": float(must_not_hits),
            "raw_score": round(raw_score, 4),
        }

        return ScoreResult(
            case_id=case.case_id,
            score=round(final_score, 4),
            passed=final_score >= case.pass_threshold,
            breakdown=breakdown,
            must_not_hits=must_not_hits,
            missing_required=missing_required,
            missing_preferred=missing_preferred,
        )

    def score_all(self, outputs: dict[str, str]) -> list[ScoreResult]:
        """Score multiple cases.  *outputs* maps case_id → generated text."""
        results = []
        for case in self.load_cases():
            output = outputs.get(case.case_id, "")
            results.append(self.score(case, output))
        return results


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def _cli() -> None:
    parser = argparse.ArgumentParser(description="Score fix PR output against golden fixtures")
    parser.add_argument(
        "--fixtures",
        default="tests/fixtures/golden",
        help="Path to golden fixtures directory",
    )
    parser.add_argument(
        "--case",
        default=None,
        help="Score a single case by ID (omit to list all cases)",
    )
    parser.add_argument(
        "--output",
        default=None,
        help="Generated output string to score (reads stdin if omitted)",
    )
    args = parser.parse_args()

    scorer = GoldenScorer(Path(args.fixtures))

    if args.case is None:
        cases = scorer.load_cases()
        print(f"Loaded {len(cases)} cases from {args.fixtures}:")
        for c in cases:
            print(f"  {c.case_id}: {c.description}")
        return

    case = scorer.load_case(args.case)

    if args.output is None:
        import sys
        generated = sys.stdin.read()
    else:
        generated = args.output

    result = scorer.score(case, generated)
    status = "PASS" if result.passed else "FAIL"
    print(f"\n[{status}] {result.case_id}  score={result.score:.3f}  threshold={case.pass_threshold}")
    print(f"  required_coverage : {result.breakdown['required_coverage']:.2%}")
    print(f"  preferred_coverage: {result.breakdown['preferred_coverage']:.2%}")
    print(f"  must_not_hits     : {result.must_not_hits}")
    if result.missing_required:
        print(f"  missing required  : {result.missing_required}")
    if result.missing_preferred:
        print(f"  missing preferred : {result.missing_preferred}")


if __name__ == "__main__":
    _cli()
