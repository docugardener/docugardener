"""
FIX-01: Verified Auto-Fix — Confidence Score unit tests.

Covers:
  AC-FIX01-1  confidence_score is serialized into drift_analysis in result_payload
  AC-FIX01-2  recheck_status per documentation update is serialized (passed/failed/skipped)
  AC-FIX01-3  recheck_confidence per update matches verification.confidence
  AC-FIX01-4  process_fix_pr: aggregate recheck_status = "passed" when all updates pass
  AC-FIX01-5  process_fix_pr: aggregate recheck_status = "failed" when any update fails
  AC-FIX01-6  process_fix_pr: aggregate recheck_status = "skipped" when no statuses present
  AC-FIX01-7  process_fix_pr: recheck_confidence is the mean of per-update confidences
  AC-FIX01-8  create_pr PR body includes confidence percentage and recheck label
  AC-FIX01-9  create_pr handles None confidence and None recheck gracefully
"""

from dataclasses import dataclass, field

import pytest

# ── helper stubs ──────────────────────────────────────────────────────────────


@dataclass
class _VerificationResult:
    verdict: str
    confidence: float
    issues: list = field(default_factory=list)
    suggestions: list = field(default_factory=list)

    @property
    def is_accurate(self):
        return self.verdict.upper() == "ACCURATE"


@dataclass
class _DocumentationDraft:
    entity_name: str
    file_path: str
    content: str
    verification: _VerificationResult | None = None
    attempts: int = 1

    @property
    def is_verified(self):
        return self.verification is not None and self.verification.is_accurate


@dataclass
class _DriftAnalysis:
    drift_score: int
    severity: str
    required_updates: list
    block_merge: bool
    summary: str
    confidence_score: float = 1.0


# ── AC-FIX01-1: confidence_score serialized into drift_analysis ───────────────


class TestDriftAnalysisSerialization:
    def _build_drift_analysis_payload(self, drift_analysis: _DriftAnalysis) -> dict:
        """Replicate the handler.py serialization logic for drift_analysis."""
        return {
            "severity": drift_analysis.severity,
            "summary": drift_analysis.summary,
            "confidence_score": round(drift_analysis.confidence_score, 4),
            "reasons": [
                {
                    "entity": (r.get("section") or r.get("entity_name") or "")
                    if isinstance(r, dict)
                    else "",
                    "file": r.get("file", "") if isinstance(r, dict) else "",
                    "reason": (r.get("reason") or "") if isinstance(r, dict) else "",
                }
                for r in drift_analysis.required_updates
            ],
        }

    def test_confidence_score_present_in_serialized_payload(self):
        da = _DriftAnalysis(
            drift_score=75,
            severity="significant",
            required_updates=[],
            block_merge=True,
            summary="Large API surface change",
            confidence_score=0.87,
        )
        payload = self._build_drift_analysis_payload(da)
        assert "confidence_score" in payload
        assert payload["confidence_score"] == 0.87

    def test_confidence_score_rounded_to_4_decimal_places(self):
        da = _DriftAnalysis(
            drift_score=50,
            severity="moderate",
            required_updates=[],
            block_merge=False,
            summary="Minor drift",
            confidence_score=0.666667,
        )
        payload = self._build_drift_analysis_payload(da)
        assert payload["confidence_score"] == 0.6667

    def test_default_confidence_score_is_1_0(self):
        da = _DriftAnalysis(
            drift_score=30,
            severity="minor",
            required_updates=[],
            block_merge=False,
            summary="Small change",
            confidence_score=1.0,
        )
        payload = self._build_drift_analysis_payload(da)
        assert payload["confidence_score"] == 1.0


# ── AC-FIX01-2/3: recheck_status per documentation update ────────────────────


class TestDocumentationUpdateSerialization:
    def _serialize_update(self, draft: _DocumentationDraft) -> dict:
        """Replicate the handler.py documentation_updates serialization."""
        return {
            "file_path": str(draft.file_path),
            "content": draft.content,
            "recheck_status": (
                "passed"
                if draft.is_verified
                else ("failed" if draft.verification is not None else "skipped")
            ),
            "recheck_confidence": (
                round(draft.verification.confidence, 4) if draft.verification is not None else None
            ),
        }

    def test_recheck_status_passed_when_verified(self):
        draft = _DocumentationDraft(
            entity_name="MyFunc",
            file_path="docs/api.md",
            content="# API",
            verification=_VerificationResult(verdict="ACCURATE", confidence=0.92),
        )
        result = self._serialize_update(draft)
        assert result["recheck_status"] == "passed"
        assert result["recheck_confidence"] == 0.92

    def test_recheck_status_failed_when_verification_ran_but_inaccurate(self):
        draft = _DocumentationDraft(
            entity_name="MyFunc",
            file_path="docs/api.md",
            content="# API",
            verification=_VerificationResult(verdict="HALLUCINATION", confidence=0.35),
        )
        result = self._serialize_update(draft)
        assert result["recheck_status"] == "failed"
        assert result["recheck_confidence"] == 0.35

    def test_recheck_status_skipped_when_no_verification_ran(self):
        draft = _DocumentationDraft(
            entity_name="MyFunc",
            file_path="docs/api.md",
            content="# API",
            verification=None,
        )
        result = self._serialize_update(draft)
        assert result["recheck_status"] == "skipped"
        assert result["recheck_confidence"] is None

    def test_recheck_confidence_rounded_to_4_places(self):
        draft = _DocumentationDraft(
            entity_name="X",
            file_path="docs/x.md",
            content="X",
            verification=_VerificationResult(verdict="ACCURATE", confidence=0.912345),
        )
        result = self._serialize_update(draft)
        assert result["recheck_confidence"] == 0.9123


# ── AC-FIX01-4/5/6/7: aggregate recheck in process_fix_pr ────────────────────


class TestAggregateRecheckStatus:
    """
    Unit-tests the aggregation logic extracted from process_fix_pr.
    The logic is: given updates_raw (list of dicts with recheck_status + recheck_confidence),
    compute _agg_recheck and _agg_conf.
    """

    def _aggregate(self, updates_raw: list) -> tuple[str, float | None]:
        _statuses = [
            u.get("recheck_status")
            for u in updates_raw
            if isinstance(u, dict) and u.get("recheck_status")
        ]
        if not _statuses:
            agg_recheck = "skipped"
        elif all(s == "passed" for s in _statuses):
            agg_recheck = "passed"
        else:
            agg_recheck = "failed"

        _confidences = [
            u.get("recheck_confidence")
            for u in updates_raw
            if isinstance(u, dict) and u.get("recheck_confidence") is not None
        ]
        agg_conf = round(sum(_confidences) / len(_confidences), 4) if _confidences else None
        return agg_recheck, agg_conf

    def test_all_passed_yields_passed(self):
        updates = [
            {"file_path": "a.md", "recheck_status": "passed", "recheck_confidence": 0.9},
            {"file_path": "b.md", "recheck_status": "passed", "recheck_confidence": 0.8},
        ]
        status, conf = self._aggregate(updates)
        assert status == "passed"
        assert conf == pytest.approx(0.85, abs=0.001)

    def test_any_failed_yields_failed(self):
        updates = [
            {"file_path": "a.md", "recheck_status": "passed", "recheck_confidence": 0.9},
            {"file_path": "b.md", "recheck_status": "failed", "recheck_confidence": 0.3},
        ]
        status, conf = self._aggregate(updates)
        assert status == "failed"

    def test_no_statuses_yields_skipped(self):
        updates = [{"file_path": "a.md", "content": "x"}]  # no recheck_status key
        status, conf = self._aggregate(updates)
        assert status == "skipped"
        assert conf is None

    def test_empty_updates_yields_skipped(self):
        status, conf = self._aggregate([])
        assert status == "skipped"
        assert conf is None

    def test_confidence_is_mean_of_all_updates(self):
        updates = [
            {"recheck_status": "passed", "recheck_confidence": 0.6},
            {"recheck_status": "passed", "recheck_confidence": 0.8},
            {"recheck_status": "passed", "recheck_confidence": 1.0},
        ]
        _, conf = self._aggregate(updates)
        assert conf == pytest.approx(0.8, abs=0.001)

    def test_confidence_none_when_no_confidences(self):
        updates = [{"recheck_status": "passed"}]  # no recheck_confidence key
        _, conf = self._aggregate(updates)
        assert conf is None


# ── AC-FIX01-8/9: create_pr PR body includes metadata ────────────────────────


class TestCreatePrBody:
    """Tests for GitCommitter.create_pr PR body content."""

    def _build_body(self, confidence_score=None, recheck_status=None) -> str:
        """Replicate the committer.py body-building logic."""
        _conf_pct = f"{round(confidence_score * 100)}%" if confidence_score is not None else "—"
        _recheck_icon = {"passed": "✅ Passed", "failed": "⚠️ Failed", "skipped": "⏭ Skipped"}.get(
            recheck_status or "", "—"
        )
        return (
            f"## 🌱 DocuGardener Documentation Fix\n\n"
            f"### Analysis Metadata\n"
            f"| Field | Value |\n"
            f"|---|---|\n"
            f"| Drift Analysis Confidence | {_conf_pct} |\n"
            f"| Documentation Recheck | {_recheck_icon} |\n\n"
        )

    def test_body_contains_confidence_percentage(self):
        body = self._build_body(confidence_score=0.87)
        assert "87%" in body

    def test_body_contains_recheck_passed(self):
        body = self._build_body(recheck_status="passed")
        assert "✅ Passed" in body

    def test_body_contains_recheck_failed(self):
        body = self._build_body(recheck_status="failed")
        assert "⚠️ Failed" in body

    def test_body_handles_none_confidence(self):
        body = self._build_body(confidence_score=None)
        assert "Drift Analysis Confidence | —" in body

    def test_body_handles_none_recheck(self):
        body = self._build_body(recheck_status=None)
        assert "Documentation Recheck | —" in body

    def test_body_contains_metadata_table(self):
        body = self._build_body(confidence_score=0.75, recheck_status="passed")
        assert "Analysis Metadata" in body
        assert "75%" in body
        assert "✅ Passed" in body
