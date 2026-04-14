"""
SCALE-05: Confidence Intervals — Grace Mode tests.

When the verifier stage (Stage 2) returns a `confidence` value below 0.5,
analyze_drift() must lift any merge block so low-confidence analyses never
gate CI.  The DriftAnalysis.confidence_score field carries the value through.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from src.agents.verifier import DriftAnalysis, VerificationAgent, _GRACE_THRESHOLD
from src.analysis.diff import ChangeType, EntityChange
from src.analysis.parser import CodeEntity


# ── Helpers ───────────────────────────────────────────────────────────────────

def _make_change(change_type: ChangeType = ChangeType.SIGNATURE_CHANGED) -> EntityChange:
    """
    Default to SIGNATURE_CHANGED (deterministic score ≥ 60) so grace-mode
    tests can meaningfully assert on block_merge behaviour.
    SIGNATURE_CHANGED weight=85, visibility_mult=1.2, complexity≈1.65 → score=100.
    """
    entity = CodeEntity(
        name="process_order",
        entity_type="function",
        file_path="src/orders.py",
        start_line=1,
        end_line=20,
        content="def process_order(order): ...",
    )
    return EntityChange(entity=entity, change_type=change_type)


def _make_agent() -> tuple[VerificationAgent, MagicMock]:
    mock_tenant = MagicMock()
    mock_tenant.llmConfig = None
    mock_session = MagicMock()
    mock_session.query.return_value.filter.return_value.first.return_value = mock_tenant
    mock_llm = MagicMock()
    mock_llm.generate = AsyncMock()

    with (
        patch("src.agents.verifier.get_tenant_id", return_value="test-tenant"),
        patch("src.agents.verifier.get_db", side_effect=lambda: iter([mock_session])),
        patch("src.agents.verifier.create_llm_client", return_value=mock_llm),
    ):
        agent = VerificationAgent(generator_client=mock_llm, verifier_client=mock_llm)

    return agent, mock_llm


def _llm_responses(proposal_score: int, verifier_confidence: float) -> list[MagicMock]:
    """Return two AsyncMock responses: one for proposal, one for verification."""
    proposal = f'{{"drift_score": {proposal_score}, "severity": "significant", "required_updates": [], "block_merge": true, "summary": "Logic changed", "nuance_adjustment": 0}}'
    verification = f'{{"verdict": "AGREE", "confidence": {verifier_confidence}, "issues": []}}'
    return [
        MagicMock(content=proposal),
        MagicMock(content=verification),
    ]


# ── Tests ─────────────────────────────────────────────────────────────────────

class TestScale05Confidence:

    @pytest.mark.asyncio
    async def test_high_confidence_keeps_block_merge(self):
        """
        When verifier confidence >= GRACE_THRESHOLD and drift is high,
        block_merge must remain True.
        """
        agent, mock_llm = _make_agent()
        mock_llm.generate = AsyncMock(side_effect=_llm_responses(75, 0.9))

        with (
            patch("src.agents.verifier.get_tenant_id", return_value="test-tenant"),
            patch("src.agents.verifier.prompt_manager") as mock_pm,
        ):
            mock_pm.get_prompt.return_value = "system prompt"
            result = await agent.analyze_drift([_make_change()])

        assert result.block_merge is True
        assert result.confidence_score == pytest.approx(0.9)

    @pytest.mark.asyncio
    async def test_low_confidence_lifts_block_merge(self):
        """
        When verifier confidence < GRACE_THRESHOLD and drift would block merge,
        block_merge must be downgraded to False (grace mode).
        """
        agent, mock_llm = _make_agent()
        mock_llm.generate = AsyncMock(side_effect=_llm_responses(75, 0.3))

        with (
            patch("src.agents.verifier.get_tenant_id", return_value="test-tenant"),
            patch("src.agents.verifier.prompt_manager") as mock_pm,
        ):
            mock_pm.get_prompt.return_value = "system prompt"
            result = await agent.analyze_drift([_make_change()])

        assert result.block_merge is False
        assert result.confidence_score == pytest.approx(0.3)

    @pytest.mark.asyncio
    async def test_grace_mode_note_appended_to_summary(self):
        """
        When grace mode activates, the summary must contain a note explaining
        why the merge block was lifted.
        """
        agent, mock_llm = _make_agent()
        mock_llm.generate = AsyncMock(side_effect=_llm_responses(80, 0.2))

        with (
            patch("src.agents.verifier.get_tenant_id", return_value="test-tenant"),
            patch("src.agents.verifier.prompt_manager") as mock_pm,
        ):
            mock_pm.get_prompt.return_value = "system prompt"
            result = await agent.analyze_drift([_make_change()])

        assert "grace" in result.summary.lower() or "confidence" in result.summary.lower()

    @pytest.mark.asyncio
    async def test_low_confidence_low_drift_no_change(self):
        """
        When drift score is low (no block), grace mode must not activate.
        block_merge stays False regardless of confidence.
        """
        agent, mock_llm = _make_agent()
        # Low score (< 60) → block_merge=False already
        proposal = '{"drift_score": 20, "severity": "minor", "required_updates": [], "block_merge": false, "summary": "Minor tweak", "nuance_adjustment": 0}'
        verification = '{"verdict": "AGREE", "confidence": 0.1, "issues": []}'
        mock_llm.generate = AsyncMock(side_effect=[
            MagicMock(content=proposal),
            MagicMock(content=verification),
        ])

        with (
            patch("src.agents.verifier.get_tenant_id", return_value="test-tenant"),
            patch("src.agents.verifier.prompt_manager") as mock_pm,
        ):
            mock_pm.get_prompt.return_value = "system prompt"
            # LOGIC_MODIFIED scores ~39 — below 60 threshold → block_merge=False anyway
            result = await agent.analyze_drift([_make_change(ChangeType.LOGIC_MODIFIED)])

        assert result.block_merge is False
        # Summary should NOT contain grace note (grace mode didn't activate)
        assert "grace" not in result.summary.lower()

    @pytest.mark.asyncio
    async def test_confidence_defaults_to_1_when_absent(self):
        """
        When the verifier response does not include a confidence field,
        DriftAnalysis.confidence_score defaults to 1.0 (full confidence).
        """
        agent, mock_llm = _make_agent()
        proposal = '{"drift_score": 70, "severity": "significant", "required_updates": [], "block_merge": true, "summary": "Sig change", "nuance_adjustment": 0}'
        verification = '{"verdict": "AGREE", "issues": []}'  # No confidence field
        mock_llm.generate = AsyncMock(side_effect=[
            MagicMock(content=proposal),
            MagicMock(content=verification),
        ])

        with (
            patch("src.agents.verifier.get_tenant_id", return_value="test-tenant"),
            patch("src.agents.verifier.prompt_manager") as mock_pm,
        ):
            mock_pm.get_prompt.return_value = "system prompt"
            result = await agent.analyze_drift([_make_change()])

        assert result.confidence_score == pytest.approx(1.0)
        assert result.block_merge is True  # Not lifted — full confidence

    @pytest.mark.asyncio
    async def test_confidence_at_exact_threshold_keeps_block(self):
        """
        confidence == GRACE_THRESHOLD (0.5 by default) is NOT below threshold;
        the merge block must not be lifted.
        """
        agent, mock_llm = _make_agent()
        mock_llm.generate = AsyncMock(
            side_effect=_llm_responses(75, _GRACE_THRESHOLD)
        )

        with (
            patch("src.agents.verifier.get_tenant_id", return_value="test-tenant"),
            patch("src.agents.verifier.prompt_manager") as mock_pm,
        ):
            mock_pm.get_prompt.return_value = "system prompt"
            result = await agent.analyze_drift([_make_change()])

        # At exactly 0.5, the condition `confidence < 0.5` is False → block kept
        assert result.block_merge is True
