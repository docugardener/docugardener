"""
SCALE-01: Fast Path — semantic bypassing for cosmetic-only changes.

When every EntityChange in a PR diff is of type COSMETIC (whitespace/formatting),
VerificationAgent.analyze_drift() must return a DriftAnalysis with score=0
immediately, without making any LLM API call.

This cuts latency and token usage for the common case of auto-formatters,
linter fixes, and other purely presentational commits.
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.agents.verifier import DriftAnalysis, VerificationAgent
from src.analysis.diff import ChangeType, EntityChange
from src.analysis.parser import CodeEntity

# ── Fixtures ──────────────────────────────────────────────────────────────────


def _make_entity(name: str = "my_func") -> CodeEntity:
    """Build a minimal real CodeEntity so scorer arithmetic works correctly."""
    return CodeEntity(
        name=name,
        entity_type="function",
        file_path="src/module.py",
        start_line=1,
        end_line=10,
        content="def my_func(): pass",
        signature=f"def {name}()",
    )


def _make_change(change_type: ChangeType, name: str = "my_func") -> EntityChange:
    """Build a minimal EntityChange with the given ChangeType."""
    return EntityChange(
        entity=_make_entity(name),
        change_type=change_type,
    )


def _make_agent() -> VerificationAgent:
    """
    Build a VerificationAgent with fully mocked LLM clients and DB.

    Patches get_tenant_id, get_db, and create_llm_client so the constructor
    does not require real infrastructure. The agent's generator/verifier are
    AsyncMock instances so we can assert generate() is (not) called.
    """
    mock_tenant = MagicMock()
    mock_tenant.llmConfig = None  # No custom config — uses bundled default

    mock_session = MagicMock()
    mock_session.query.return_value.filter.return_value.first.return_value = mock_tenant

    mock_llm = MagicMock()
    mock_llm.generate = AsyncMock()

    with (
        patch("src.agents.verifier.get_tenant_id", return_value="test-tenant"),
        patch("src.agents.verifier.get_db", side_effect=lambda: iter([mock_session])),
        patch("src.agents.verifier.create_llm_client", return_value=mock_llm),
    ):
        agent = VerificationAgent(
            generator_client=mock_llm,
            verifier_client=mock_llm,
        )

    return agent, mock_llm


# ── Tests ─────────────────────────────────────────────────────────────────────


class TestScale01FastPath:
    """SCALE-01: LLM is bypassed for cosmetic-only diffs."""

    @pytest.mark.asyncio
    async def test_all_cosmetic_skips_llm(self):
        """
        When all changes are COSMETIC, analyze_drift() must return immediately
        with score=0 and must never call the LLM's generate() method.
        """
        agent, mock_llm = _make_agent()
        changes = [
            _make_change(ChangeType.COSMETIC, "func_a"),
            _make_change(ChangeType.COSMETIC, "func_b"),
            _make_change(ChangeType.COSMETIC, "ClassFoo"),
        ]

        result = await agent.analyze_drift(changes)

        assert isinstance(result, DriftAnalysis)
        assert result.drift_score == 0
        assert result.severity == "none"
        assert result.block_merge is False
        assert result.required_updates == []
        # LLM must not have been called
        mock_llm.generate.assert_not_called()

    @pytest.mark.asyncio
    async def test_single_cosmetic_change_skips_llm(self):
        """Edge case: a single COSMETIC change still triggers the fast path."""
        agent, mock_llm = _make_agent()
        changes = [_make_change(ChangeType.COSMETIC)]

        result = await agent.analyze_drift(changes)

        assert result.drift_score == 0
        assert result.block_merge is False
        mock_llm.generate.assert_not_called()

    @pytest.mark.asyncio
    async def test_mixed_changes_do_not_skip_llm(self):
        """
        When at least one change is non-cosmetic (e.g. LOGIC_MODIFIED),
        the fast path must NOT activate — the LLM pipeline runs normally.
        """
        agent, mock_llm = _make_agent()

        llm_json = (
            '{"drift_score": 65, "severity": "significant", '
            '"required_updates": [], "block_merge": false, '
            '"summary": "Logic changed", "nuance_adjustment": 0}'
        )
        mock_llm.generate = AsyncMock(return_value=MagicMock(content=llm_json))

        changes = [
            _make_change(ChangeType.COSMETIC, "format_helper"),
            _make_change(ChangeType.LOGIC_MODIFIED, "core_func"),
        ]

        with (
            patch("src.agents.verifier.get_tenant_id", return_value="test-tenant"),
            patch("src.agents.verifier.prompt_manager") as mock_pm,
        ):
            mock_pm.get_prompt.return_value = "system prompt"
            result = await agent.analyze_drift(changes)

        # The LLM must have been called (fast path skipped)
        mock_llm.generate.assert_called()

    @pytest.mark.asyncio
    async def test_docstring_only_changes_do_not_skip_llm(self):
        """
        DOCSTRING_CHANGED changes require documentation review — the fast path
        must not activate for them (they are not COSMETIC).
        """
        agent, mock_llm = _make_agent()

        llm_json = (
            '{"drift_score": 5, "severity": "minor", '
            '"required_updates": [], "block_merge": false, '
            '"summary": "Docstring updated", "nuance_adjustment": 0}'
        )
        mock_llm.generate = AsyncMock(return_value=MagicMock(content=llm_json))

        changes = [_make_change(ChangeType.DOCSTRING_CHANGED)]

        with (
            patch("src.agents.verifier.get_tenant_id", return_value="test-tenant"),
            patch("src.agents.verifier.prompt_manager") as mock_pm,
        ):
            mock_pm.get_prompt.return_value = "system prompt"
            result = await agent.analyze_drift(changes)

        # LLM must be called — DOCSTRING_CHANGED is not bypassed
        mock_llm.generate.assert_called()

    @pytest.mark.asyncio
    async def test_empty_changes_returns_zero_score(self):
        """
        The pre-existing guard for empty changes (before the fast path) is
        preserved — returns score=0 without touching the LLM.
        """
        agent, mock_llm = _make_agent()

        result = await agent.analyze_drift([])

        assert result.drift_score == 0
        mock_llm.generate.assert_not_called()

    @pytest.mark.asyncio
    async def test_fast_path_summary_is_descriptive(self):
        """
        The fast-path DriftAnalysis.summary should clearly explain why
        no LLM call was made, so job logs are not confusing.
        """
        agent, mock_llm = _make_agent()
        changes = [_make_change(ChangeType.COSMETIC)]

        result = await agent.analyze_drift(changes)

        assert (
            "cosmetic" in result.summary.lower()
            or "formatting" in result.summary.lower()
            or "whitespace" in result.summary.lower()
        )

    @pytest.mark.asyncio
    async def test_added_change_does_not_skip_llm(self):
        """ADDED entities always require doc review — fast path must not fire."""
        agent, mock_llm = _make_agent()

        llm_json = (
            '{"drift_score": 30, "severity": "moderate", '
            '"required_updates": [], "block_merge": false, '
            '"summary": "New function added", "nuance_adjustment": 0}'
        )
        mock_llm.generate = AsyncMock(return_value=MagicMock(content=llm_json))

        changes = [_make_change(ChangeType.ADDED, "new_function")]

        with (
            patch("src.agents.verifier.get_tenant_id", return_value="test-tenant"),
            patch("src.agents.verifier.prompt_manager") as mock_pm,
        ):
            mock_pm.get_prompt.return_value = "system prompt"
            result = await agent.analyze_drift(changes)

        mock_llm.generate.assert_called()
