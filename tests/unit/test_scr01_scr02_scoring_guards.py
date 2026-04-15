"""
SCR-01 / SCR-02: Scoring edge-case guard tests for VerificationAgent.analyze_drift.

SCR-01: A None drift_score must be detected and warned about; the analysis must
        still return a valid (non-None) DriftAnalysis with a sensible fallback.

SCR-02: When the LLM's narrative summary contains "no issues" / "no drift" language
        but the calculated score is ≥ 40, a warning must be logged.

All LLM calls are mocked — these tests exercise only the guard logic.
"""

import json
from unittest.mock import MagicMock, patch

import pytest

from src.agents.verifier import VerificationAgent
from src.analysis.diff import ChangeType, EntityChange
from src.analysis.parser import CodeEntity

# ── Helpers ────────────────────────────────────────────────────────────────────


def _make_change(score_contribution: int = 50) -> EntityChange:
    """Return a minimal EntityChange that DriftScorer can process."""
    entity = MagicMock(spec=CodeEntity)
    entity.qualified_name = "my_module.my_func"
    entity.entity_type = "function"
    entity.file_path = "src/my_module.py"
    entity.is_public = True
    entity.content = "def my_func(): pass"
    change = MagicMock(spec=EntityChange)
    change.entity = entity
    change.change_type = ChangeType.MODIFIED
    change.new_content = "def my_func(): return 1"
    change.old_content = "def my_func(): pass"
    change.details = {}
    change.directory_weight = 1.0
    change.blast_radius = 3
    return change


def _make_agent_with_mock_llm(
    proposal_content: str, verification_content: str
) -> VerificationAgent:
    """Build a VerificationAgent with all LLM calls and DB lookups stubbed."""
    agent = object.__new__(VerificationAgent)
    agent.max_retries = 2
    agent.tone = "Strict"
    agent.scoring_model = "basic"
    agent.config = MagicMock()
    agent._session_tokens = {"prompt_tokens": 0, "completion_tokens": 0}
    agent._session_provider = "gemini"
    agent._session_model = "gemini-2.0-flash"

    async def fake_generate(prompt, system_prompt="", config=None):
        # Return proposal on first call, verification on subsequent calls
        if not hasattr(fake_generate, "_called"):
            fake_generate._called = True
            r = MagicMock()
            r.content = proposal_content
            r.usage = {}
            return r
        r = MagicMock()
        r.content = verification_content
        r.usage = {}
        return r

    mock_client = MagicMock()
    mock_client.generate = fake_generate
    agent.generator = mock_client
    agent.verifier = mock_client
    return agent


def _proposal_json(summary: str, required_updates=None) -> str:
    return json.dumps(
        {
            "summary": summary,
            "required_updates": required_updates or [],
            "nuance_adjustment": 0,
        }
    )


def _verification_json(verdict: str = "AGREE", confidence: float = 0.9) -> str:
    return json.dumps({"verdict": verdict, "confidence": confidence, "issues": []})


# ── SCR-01: None drift_score guard ────────────────────────────────────────────


class TestScr01NoneScoreGuard:
    @pytest.mark.asyncio
    async def test_none_score_is_replaced_with_fallback(self, caplog):
        """
        When DriftScorer.calculate_score returns None (unexpected), analyze_drift
        should log a SCR-01 warning and still return a valid DriftAnalysis.
        """
        agent = _make_agent_with_mock_llm(
            proposal_content=_proposal_json("Some analysis summary"),
            verification_content=_verification_json(),
        )
        changes = [_make_change()]

        with (
            patch("src.agents.verifier.DriftScorer.calculate_score", return_value=None),
            patch("src.agents.verifier.record_llm_request"),
            patch("src.agents.verifier.prompt_manager") as mock_pm,
            patch("src.agents.verifier.get_tenant_id", return_value="t-test"),
        ):
            mock_pm.get_prompt.return_value = "system prompt"
            import logging

            with caplog.at_level(logging.WARNING, logger="src.agents.verifier"):
                result = await agent.analyze_drift(changes)

        assert result is not None
        assert result.drift_score is not None
        assert result.drift_score == 50  # Fallback value
        assert "SCR-01" in caplog.text

    @pytest.mark.asyncio
    async def test_valid_score_no_scr01_warning(self, caplog):
        """Normal analysis with a valid calculated score must NOT trigger SCR-01."""
        agent = _make_agent_with_mock_llm(
            proposal_content=_proposal_json("Documentation is slightly behind."),
            verification_content=_verification_json(),
        )
        changes = [_make_change()]

        with (
            patch("src.agents.verifier.DriftScorer.calculate_score", return_value=35),
            patch("src.agents.verifier.record_llm_request"),
            patch("src.agents.verifier.prompt_manager") as mock_pm,
            patch("src.agents.verifier.get_tenant_id", return_value="t-test"),
        ):
            mock_pm.get_prompt.return_value = "system prompt"
            import logging

            with caplog.at_level(logging.WARNING, logger="src.agents.verifier"):
                result = await agent.analyze_drift(changes)

        assert "SCR-01" not in caplog.text
        assert result.drift_score == 35

    @pytest.mark.asyncio
    async def test_zero_score_does_not_trigger_scr01(self, caplog):
        """Score of 0 is a valid result (cosmetic changes processed via normal path)."""
        agent = _make_agent_with_mock_llm(
            proposal_content=_proposal_json("No significant drift."),
            verification_content=_verification_json(),
        )
        changes = [_make_change()]

        with (
            patch("src.agents.verifier.DriftScorer.calculate_score", return_value=0),
            patch("src.agents.verifier.record_llm_request"),
            patch("src.agents.verifier.prompt_manager") as mock_pm,
            patch("src.agents.verifier.get_tenant_id", return_value="t-test"),
        ):
            mock_pm.get_prompt.return_value = "system prompt"
            import logging

            with caplog.at_level(logging.WARNING, logger="src.agents.verifier"):
                result = await agent.analyze_drift(changes)

        assert "SCR-01" not in caplog.text
        assert result.drift_score == 0


# ── SCR-02: Narrative conflict detection ──────────────────────────────────────


class TestScr02NarrativeConflict:
    @pytest.mark.asyncio
    async def test_no_issues_narrative_with_high_score_triggers_warning(self, caplog):
        """LLM says 'no issues' but score >= 40 → SCR-02 warning."""
        agent = _make_agent_with_mock_llm(
            proposal_content=_proposal_json("There are no issues with the documentation."),
            verification_content=_verification_json(),
        )
        changes = [_make_change()]

        with (
            patch("src.agents.verifier.DriftScorer.calculate_score", return_value=65),
            patch("src.agents.verifier.record_llm_request"),
            patch("src.agents.verifier.prompt_manager") as mock_pm,
            patch("src.agents.verifier.get_tenant_id", return_value="t-test"),
        ):
            mock_pm.get_prompt.return_value = "system prompt"
            import logging

            with caplog.at_level(logging.WARNING, logger="src.agents.verifier"):
                await agent.analyze_drift(changes)

        assert "SCR-02" in caplog.text

    @pytest.mark.asyncio
    async def test_no_drift_narrative_with_high_score_triggers_warning(self, caplog):
        """LLM says 'no drift' but score >= 40 → SCR-02 warning."""
        agent = _make_agent_with_mock_llm(
            proposal_content=_proposal_json("This PR shows no drift in the docs."),
            verification_content=_verification_json(),
        )
        changes = [_make_change()]

        with (
            patch("src.agents.verifier.DriftScorer.calculate_score", return_value=50),
            patch("src.agents.verifier.record_llm_request"),
            patch("src.agents.verifier.prompt_manager") as mock_pm,
            patch("src.agents.verifier.get_tenant_id", return_value="t-test"),
        ):
            mock_pm.get_prompt.return_value = "system prompt"
            import logging

            with caplog.at_level(logging.WARNING, logger="src.agents.verifier"):
                await agent.analyze_drift(changes)

        assert "SCR-02" in caplog.text

    @pytest.mark.asyncio
    async def test_up_to_date_narrative_with_high_score_triggers_warning(self, caplog):
        """LLM says 'up to date' but score is high → SCR-02 warning."""
        agent = _make_agent_with_mock_llm(
            proposal_content=_proposal_json("The documentation is up to date."),
            verification_content=_verification_json(),
        )
        changes = [_make_change()]

        with (
            patch("src.agents.verifier.DriftScorer.calculate_score", return_value=80),
            patch("src.agents.verifier.record_llm_request"),
            patch("src.agents.verifier.prompt_manager") as mock_pm,
            patch("src.agents.verifier.get_tenant_id", return_value="t-test"),
        ):
            mock_pm.get_prompt.return_value = "system prompt"
            import logging

            with caplog.at_level(logging.WARNING, logger="src.agents.verifier"):
                await agent.analyze_drift(changes)

        assert "SCR-02" in caplog.text

    @pytest.mark.asyncio
    async def test_no_issues_narrative_with_low_score_no_warning(self, caplog):
        """LLM says 'no issues' AND score < 40 → NO SCR-02 warning (consistent)."""
        agent = _make_agent_with_mock_llm(
            proposal_content=_proposal_json("There are no issues — this is a minor comment fix."),
            verification_content=_verification_json(),
        )
        changes = [_make_change()]

        with (
            patch("src.agents.verifier.DriftScorer.calculate_score", return_value=10),
            patch("src.agents.verifier.record_llm_request"),
            patch("src.agents.verifier.prompt_manager") as mock_pm,
            patch("src.agents.verifier.get_tenant_id", return_value="t-test"),
        ):
            mock_pm.get_prompt.return_value = "system prompt"
            import logging

            with caplog.at_level(logging.WARNING, logger="src.agents.verifier"):
                await agent.analyze_drift(changes)

        assert "SCR-02" not in caplog.text

    @pytest.mark.asyncio
    async def test_meaningful_narrative_with_high_score_no_warning(self, caplog):
        """LLM provides substantive concerns and score is high → no SCR-02 false positive."""
        agent = _make_agent_with_mock_llm(
            proposal_content=_proposal_json(
                "Critical API changes detected. Update README and API docs."
            ),
            verification_content=_verification_json(),
        )
        changes = [_make_change()]

        with (
            patch("src.agents.verifier.DriftScorer.calculate_score", return_value=75),
            patch("src.agents.verifier.record_llm_request"),
            patch("src.agents.verifier.prompt_manager") as mock_pm,
            patch("src.agents.verifier.get_tenant_id", return_value="t-test"),
        ):
            mock_pm.get_prompt.return_value = "system prompt"
            import logging

            with caplog.at_level(logging.WARNING, logger="src.agents.verifier"):
                await agent.analyze_drift(changes)

        assert "SCR-02" not in caplog.text

    @pytest.mark.asyncio
    async def test_score_exactly_at_threshold_triggers_warning(self, caplog):
        """Score exactly at 40 with 'no action required' should trigger SCR-02."""
        agent = _make_agent_with_mock_llm(
            proposal_content=_proposal_json("No action required for these changes."),
            verification_content=_verification_json(),
        )
        changes = [_make_change()]

        with (
            patch("src.agents.verifier.DriftScorer.calculate_score", return_value=40),
            patch("src.agents.verifier.record_llm_request"),
            patch("src.agents.verifier.prompt_manager") as mock_pm,
            patch("src.agents.verifier.get_tenant_id", return_value="t-test"),
        ):
            mock_pm.get_prompt.return_value = "system prompt"
            import logging

            with caplog.at_level(logging.WARNING, logger="src.agents.verifier"):
                await agent.analyze_drift(changes)

        assert "SCR-02" in caplog.text

    @pytest.mark.asyncio
    async def test_score_below_threshold_with_no_action_no_warning(self, caplog):
        """Score of 39 with 'no action required' → below threshold → no SCR-02."""
        agent = _make_agent_with_mock_llm(
            proposal_content=_proposal_json("No action required for these changes."),
            verification_content=_verification_json(),
        )
        changes = [_make_change()]

        with (
            patch("src.agents.verifier.DriftScorer.calculate_score", return_value=39),
            patch("src.agents.verifier.record_llm_request"),
            patch("src.agents.verifier.prompt_manager") as mock_pm,
            patch("src.agents.verifier.get_tenant_id", return_value="t-test"),
        ):
            mock_pm.get_prompt.return_value = "system prompt"
            import logging

            with caplog.at_level(logging.WARNING, logger="src.agents.verifier"):
                await agent.analyze_drift(changes)

        assert "SCR-02" not in caplog.text

    @pytest.mark.asyncio
    async def test_empty_changes_returns_early_no_warnings(self, caplog):
        """Empty changes list returns early — no SCR-01 or SCR-02 should fire."""
        agent = _make_agent_with_mock_llm("", "")
        import logging

        with caplog.at_level(logging.WARNING, logger="src.agents.verifier"):
            result = await agent.analyze_drift([])

        assert result.drift_score == 0
        assert "SCR-01" not in caplog.text
        assert "SCR-02" not in caplog.text
