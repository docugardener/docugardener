"""
TEST-01 / A1: VerificationAgent — scoring model dispatch.

Verifies that:
  - scoringModel="basic"    → DriftScorer.calculate_score() is called
  - scoringModel="holistic" → DriftScorer.calculate_holistic_score() is called
  - Default (key absent)    → falls back to "basic"
  - provider="platform_default" → stays "basic"
  - Holistic mode injects "Holistic Impact Profile" into the LLM prompt
  - Basic mode does NOT inject the profile block
  - Both models are deterministic: same input → same score, 5 consecutive calls
"""

import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch, call

from src.agents.verifier import VerificationAgent, DriftAnalysis
from src.analysis.diff import ChangeType, EntityChange
from src.analysis.parser import CodeEntity


# ── helpers ───────────────────────────────────────────────────────────────────

def _make_entity(name: str = "process_data", file_path: str = "src/core/service.py") -> CodeEntity:
    return CodeEntity(
        name=name,
        entity_type="function",
        file_path=file_path,
        start_line=1,
        end_line=20,
        content=f"def {name}(x): return x * 2",
        signature=f"{name}(x)",
    )


def _make_change(
    change_type: ChangeType = ChangeType.LOGIC_MODIFIED,
    file_path: str = "src/core/service.py",
    blast_radius: int = 3,
    directory_weight: float = 2.0,
) -> EntityChange:
    return EntityChange(
        entity=_make_entity(file_path=file_path),
        change_type=change_type,
        blast_radius=blast_radius,
        directory_weight=directory_weight,
    )


def _llm_response(content: str = '{"summary": "Drift score 42/100 because logic changed.", "required_updates": [], "nuance_adjustment": 0}') -> MagicMock:
    """Return a mock LLM response with valid JSON content."""
    r = MagicMock()
    r.content = content
    return r


def _verification_response() -> MagicMock:
    r = MagicMock()
    r.content = '{"verdict": "AGREE", "confidence": 1.0, "issues": []}'
    return r


def _make_agent(scoring_model: str = "basic") -> tuple[VerificationAgent, MagicMock]:
    """
    Build a VerificationAgent bypassing __init__ infrastructure,
    with scoring_model set directly. Generator and verifier are AsyncMock.
    """
    agent = VerificationAgent.__new__(VerificationAgent)
    mock_llm = MagicMock()
    mock_llm.generate = AsyncMock(side_effect=[
        _llm_response(),          # proposal stage
        _verification_response(), # verification stage
        _llm_response(),          # extra calls for determinism tests
        _verification_response(),
        _llm_response(),
        _verification_response(),
        _llm_response(),
        _verification_response(),
        _llm_response(),
        _verification_response(),
    ])
    agent.generator = mock_llm
    agent.verifier = mock_llm
    agent.max_retries = 1
    agent.tone = "Strict"
    agent.scoring_model = scoring_model
    agent._session_tokens = {"prompt_tokens": 0, "completion_tokens": 0}
    agent._session_provider = "gemini"
    agent._session_model = "gemini-2.0-flash"
    from src.agents.verifier import LLMConfig
    agent.config = LLMConfig(temperature=0.0, max_tokens=2048)
    return agent, mock_llm


# ── A1 tests ──────────────────────────────────────────────────────────────────

class TestVerifierScoringModelDispatch:

    @pytest.mark.asyncio
    async def test_basic_model_calls_calculate_score(self):
        """scoringModel='basic' → DriftScorer.calculate_score() called, holistic NOT called."""
        agent, _ = _make_agent(scoring_model="basic")
        changes = [_make_change()]

        with patch("src.agents.verifier.DriftScorer.calculate_score", return_value=42) as mock_std, \
             patch("src.agents.verifier.DriftScorer.calculate_holistic_score") as mock_hol, \
             patch("src.agents.verifier.get_tenant_id", return_value="t1"), \
             patch("src.agents.verifier.prompt_manager") as mock_pm:
            mock_pm.get_prompt.return_value = "system prompt"
            await agent.analyze_drift(changes)

        mock_std.assert_called_once_with(changes)
        mock_hol.assert_not_called()

    @pytest.mark.asyncio
    async def test_holistic_model_calls_calculate_holistic_score(self):
        """scoringModel='holistic' → DriftScorer.calculate_holistic_score() called, standard NOT called."""
        agent, _ = _make_agent(scoring_model="holistic")
        changes = [_make_change()]

        with patch("src.agents.verifier.DriftScorer.calculate_holistic_score", return_value=75) as mock_hol, \
             patch("src.agents.verifier.DriftScorer.calculate_score") as mock_std, \
             patch("src.agents.verifier.get_tenant_id", return_value="t1"), \
             patch("src.agents.verifier.prompt_manager") as mock_pm:
            mock_pm.get_prompt.return_value = "system prompt"
            await agent.analyze_drift(changes)

        mock_hol.assert_called_once_with(changes)
        mock_std.assert_not_called()

    @pytest.mark.asyncio
    async def test_default_is_basic_when_key_absent(self):
        """When llmConfig has no 'scoringModel' key, agent defaults to 'basic'."""
        mock_tenant = MagicMock()
        mock_tenant.llmConfig = {"provider": "gemini", "apiKey": "enc"}

        mock_session = MagicMock()
        mock_session.query.return_value.filter.return_value.first.return_value = mock_tenant

        mock_llm = MagicMock()

        with patch("src.agents.verifier.get_tenant_id", return_value="t1"), \
             patch("src.agents.verifier.get_db", side_effect=lambda: iter([mock_session])), \
             patch("src.agents.verifier.create_llm_client", return_value=mock_llm):
            agent = VerificationAgent(generator_client=mock_llm, verifier_client=mock_llm)

        assert agent.scoring_model == "basic"

    @pytest.mark.asyncio
    async def test_holistic_model_set_from_db_config(self):
        """llmConfig with scoringModel='holistic' → agent.scoring_model='holistic'."""
        mock_tenant = MagicMock()
        mock_tenant.llmConfig = {"provider": "gemini", "scoringModel": "holistic"}

        mock_session = MagicMock()
        mock_session.query.return_value.filter.return_value.first.return_value = mock_tenant

        mock_llm = MagicMock()

        with patch("src.agents.verifier.get_tenant_id", return_value="t1"), \
             patch("src.agents.verifier.get_db", side_effect=lambda: iter([mock_session])), \
             patch("src.agents.verifier.create_llm_client", return_value=mock_llm):
            agent = VerificationAgent(generator_client=mock_llm, verifier_client=mock_llm)

        assert agent.scoring_model == "holistic"

    @pytest.mark.asyncio
    async def test_platform_default_uses_basic(self):
        """provider='platform_default' → scoring_model stays 'basic' (skipped by guard)."""
        mock_tenant = MagicMock()
        mock_tenant.llmConfig = {"provider": "platform_default", "scoringModel": "holistic"}

        mock_session = MagicMock()
        mock_session.query.return_value.filter.return_value.first.return_value = mock_tenant

        mock_llm = MagicMock()

        with patch("src.agents.verifier.get_tenant_id", return_value="t1"), \
             patch("src.agents.verifier.get_db", side_effect=lambda: iter([mock_session])), \
             patch("src.agents.verifier.create_llm_client", return_value=mock_llm):
            agent = VerificationAgent(generator_client=mock_llm, verifier_client=mock_llm)

        assert agent.scoring_model == "basic"

    @pytest.mark.asyncio
    async def test_holistic_score_injected_into_llm_prompt(self):
        """When scoring_model='holistic', the proposal prompt must contain 'Holistic Impact Profile'."""
        agent, mock_llm = _make_agent(scoring_model="holistic")
        changes = [_make_change()]

        captured_prompts: list[str] = []

        async def capture_generate(prompt: str = "", system_prompt: str = "", config=None, **kwargs):
            captured_prompts.append(prompt)
            return _llm_response()

        mock_llm.generate = AsyncMock(side_effect=capture_generate)

        with patch("src.agents.verifier.DriftScorer.calculate_holistic_score", return_value=70), \
             patch("src.agents.verifier.get_tenant_id", return_value="t1"), \
             patch("src.agents.verifier.prompt_manager") as mock_pm:
            mock_pm.get_prompt.return_value = "system prompt"
            await agent.analyze_drift(changes)

        proposal_prompt = captured_prompts[0]
        assert "Holistic Impact Profile" in proposal_prompt, (
            "Expected 'Holistic Impact Profile' in proposal prompt for holistic scoring"
        )

    @pytest.mark.asyncio
    async def test_basic_score_not_injected_into_prompt(self):
        """When scoring_model='basic', the proposal prompt must NOT contain 'Holistic Impact Profile'."""
        agent, mock_llm = _make_agent(scoring_model="basic")
        changes = [_make_change()]

        captured_prompts: list[str] = []

        async def capture_generate(prompt: str = "", system_prompt: str = "", config=None, **kwargs):
            captured_prompts.append(prompt)
            return _llm_response()

        mock_llm.generate = AsyncMock(side_effect=capture_generate)

        with patch("src.agents.verifier.DriftScorer.calculate_score", return_value=42), \
             patch("src.agents.verifier.get_tenant_id", return_value="t1"), \
             patch("src.agents.verifier.prompt_manager") as mock_pm:
            mock_pm.get_prompt.return_value = "system prompt"
            await agent.analyze_drift(changes)

        proposal_prompt = captured_prompts[0]
        assert "Holistic Impact Profile" not in proposal_prompt

    @pytest.mark.asyncio
    async def test_scoring_model_determinism_basic(self):
        """Same changes, basic model → identical drift_score across 3 consecutive calls."""
        changes = [_make_change()]
        scores: list[int] = []

        for _ in range(3):
            agent, mock_llm = _make_agent(scoring_model="basic")
            mock_llm.generate = AsyncMock(side_effect=[_llm_response(), _verification_response()])

            with patch("src.agents.verifier.get_tenant_id", return_value="t1"), \
                 patch("src.agents.verifier.prompt_manager") as mock_pm:
                mock_pm.get_prompt.return_value = "system prompt"
                result = await agent.analyze_drift(changes)
            scores.append(result.drift_score)

        assert len(set(scores)) == 1, f"Expected deterministic score, got: {scores}"

    @pytest.mark.asyncio
    async def test_scoring_model_determinism_holistic(self):
        """Same changes, holistic model → identical drift_score across 3 consecutive calls."""
        changes = [_make_change(directory_weight=2.0, blast_radius=5)]
        scores: list[int] = []

        for _ in range(3):
            agent, mock_llm = _make_agent(scoring_model="holistic")
            mock_llm.generate = AsyncMock(side_effect=[_llm_response(), _verification_response()])

            with patch("src.agents.verifier.get_tenant_id", return_value="t1"), \
                 patch("src.agents.verifier.prompt_manager") as mock_pm:
                mock_pm.get_prompt.return_value = "system prompt"
                result = await agent.analyze_drift(changes)
            scores.append(result.drift_score)

        assert len(set(scores)) == 1, f"Expected deterministic holistic score, got: {scores}"
