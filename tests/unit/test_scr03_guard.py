# SPDX-License-Identifier: AGPL-3.0-or-later
"""
EPIC-13 TDD — SCR-03 guard tests.

SCR-03: When drift_score >= 60 but the LLM returns an empty required_updates
list, inject a fallback actionable entry and log a warning.  Callers always
get at least one concrete item to act on.

Tests written BEFORE implementation (TDD).

  SCR03-01  score >= 60, empty list → fallback injected + warning logged
  SCR03-02  score >= 60, non-empty list → list unchanged, no warning
  SCR03-03  score < 60, empty list → list stays empty, no SCR-03 warning
  SCR03-04  fallback entry contains affected file path from changes
"""

from __future__ import annotations

import json
import logging
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.agents.verifier import VerificationAgent
from src.analysis.diff import ChangeType, EntityChange
from src.analysis.parser import CodeEntity

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_change(
    file_path: str = "src/api/payments.py",
    change_type: ChangeType = ChangeType.SIGNATURE_CHANGED,
) -> EntityChange:
    entity = CodeEntity(
        name="process_payment",
        entity_type="function",
        file_path=file_path,
        start_line=1,
        end_line=20,
        content="def process_payment(amount: float) -> dict: ...",
    )
    return EntityChange(entity=entity, change_type=change_type, new_content=entity.content)


def _make_agent(proposal_score: int, required_updates: list) -> VerificationAgent:
    """Return a VerificationAgent with a mocked LLM returning the given proposal."""
    proposal_json = json.dumps(
        {
            "summary": f"Score {proposal_score}/100 because logic changed significantly.",
            "required_updates": required_updates,
            "nuance_adjustment": 0,
        }
    )
    verification_json = json.dumps({"verdict": "ACCURATE", "confidence": 0.9, "issues": []})

    mock_llm = MagicMock()
    mock_llm.generate = AsyncMock(
        side_effect=[
            MagicMock(content=proposal_json, usage={}),
            MagicMock(content=verification_json, usage={}),
        ]
    )

    from src.agents.llm import LLMConfig

    agent = VerificationAgent.__new__(VerificationAgent)
    agent.generator = mock_llm
    agent.verifier = mock_llm
    agent.max_retries = 1
    agent.tone = "Strict"
    agent.scoring_model = "basic"
    agent.config = LLMConfig(temperature=0.0, max_tokens=4096)
    agent._session_tokens = {
        "prompt_tokens": 0,
        "completion_tokens": 0,
        "cache_read_tokens": 0,
        "cache_creation_tokens": 0,
    }
    agent._session_provider = "gemini"
    agent._session_model = "gemini-2.0-flash"
    return agent


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestScr03Guard:
    @pytest.mark.asyncio
    async def test_scr03_01_high_score_empty_updates_injects_fallback(self, caplog):
        """SCR03-01: score=75 + empty required_updates → fallback entry injected."""
        agent = _make_agent(proposal_score=75, required_updates=[])
        changes = [_make_change("src/api/payments.py")]

        with (
            patch("src.agents.verifier.DriftScorer.calculate_score", return_value=75),
            patch("src.agents.verifier.record_llm_request"),
            patch("src.agents.verifier.prompt_manager") as mock_pm,
            patch("src.agents.verifier.get_tenant_id", return_value="t-test"),
            patch("src.agents.verifier.check_llm_rate_limit", new=AsyncMock()),
            caplog.at_level(logging.WARNING, logger="src.agents.verifier"),
        ):
            mock_pm.get_prompt.return_value = "system prompt"
            result = await agent.analyze_drift(changes)

        assert len(result.required_updates) >= 1
        assert "SCR-03" in caplog.text

    @pytest.mark.asyncio
    async def test_scr03_02_high_score_nonempty_updates_unchanged(self, caplog):
        """SCR03-02: score=75 + non-empty required_updates → list untouched."""
        existing = [
            {"file": "docs/api/payments.md", "section": "process_payment", "reason": "sig changed"}
        ]
        agent = _make_agent(proposal_score=75, required_updates=existing)
        changes = [_make_change()]

        with (
            patch("src.agents.verifier.DriftScorer.calculate_score", return_value=75),
            patch("src.agents.verifier.record_llm_request"),
            patch("src.agents.verifier.prompt_manager") as mock_pm,
            patch("src.agents.verifier.get_tenant_id", return_value="t-test"),
            patch("src.agents.verifier.check_llm_rate_limit", new=AsyncMock()),
            caplog.at_level(logging.WARNING, logger="src.agents.verifier"),
        ):
            mock_pm.get_prompt.return_value = "system prompt"
            result = await agent.analyze_drift(changes)

        assert result.required_updates == existing
        assert "SCR-03" not in caplog.text

    @pytest.mark.asyncio
    async def test_scr03_03_low_score_empty_updates_no_injection(self, caplog):
        """SCR03-03: score=30 + empty required_updates → stays empty, no SCR-03."""
        agent = _make_agent(proposal_score=30, required_updates=[])
        # Use COSMETIC changes so LLM is bypassed and score stays 0,
        # but we need a real low score path — use LOGIC_MODIFIED with mocked score=30
        changes = [_make_change()]

        with (
            patch("src.agents.verifier.DriftScorer.calculate_score", return_value=30),
            patch("src.agents.verifier.record_llm_request"),
            patch("src.agents.verifier.prompt_manager") as mock_pm,
            patch("src.agents.verifier.get_tenant_id", return_value="t-test"),
            patch("src.agents.verifier.check_llm_rate_limit", new=AsyncMock()),
            caplog.at_level(logging.WARNING, logger="src.agents.verifier"),
        ):
            mock_pm.get_prompt.return_value = "system prompt"
            result = await agent.analyze_drift(changes)

        assert result.required_updates == []
        assert "SCR-03" not in caplog.text

    @pytest.mark.asyncio
    async def test_scr03_04_fallback_entry_references_affected_file(self, caplog):
        """SCR03-04: Injected fallback entry contains the affected source file path."""
        agent = _make_agent(proposal_score=80, required_updates=[])
        changes = [_make_change("src/billing/invoice.py")]

        with (
            patch("src.agents.verifier.DriftScorer.calculate_score", return_value=80),
            patch("src.agents.verifier.record_llm_request"),
            patch("src.agents.verifier.prompt_manager") as mock_pm,
            patch("src.agents.verifier.get_tenant_id", return_value="t-test"),
            patch("src.agents.verifier.check_llm_rate_limit", new=AsyncMock()),
            caplog.at_level(logging.WARNING, logger="src.agents.verifier"),
        ):
            mock_pm.get_prompt.return_value = "system prompt"
            result = await agent.analyze_drift(changes)

        assert len(result.required_updates) >= 1
        fallback = result.required_updates[0]
        # Fallback must be a dict with at least a 'file' and 'reason' key
        assert "file" in fallback
        assert "reason" in fallback
        # The affected file should be referenced
        assert "invoice" in fallback["file"] or "invoice" in fallback["reason"]
