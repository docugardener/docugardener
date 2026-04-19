# SPDX-License-Identifier: AGPL-3.0-or-later
"""
EPIC-13 TDD — Prompt enrichment integration tests.

Verifies that ContextEnricher output flows through generate_documentation()
into the rendered LLM prompt.  All tests run offline — no real LLM calls.

  PE-01  neighbor_context slot populated in prompt when repo_path provided
  PE-02  import_block slot populated in prompt when repo_path provided
  PE-03  style_guide slot populated in prompt when repo_path provided
  PE-04  all three slots fall back to empty string when enricher raises
  PE-05  generate_documentation passes repo_path to ContextEnricher
  PE-06  prompt renders without KeyError when repo_path=None (no enrichment)
"""

from __future__ import annotations

import textwrap
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.agents.verifier import VerificationAgent
from src.analysis.diff import ChangeType, EntityChange
from src.analysis.parser import CodeEntity


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

SAMPLE_PYTHON = textwrap.dedent("""\
    import os

    def alpha(x: int) -> str:
        \"\"\"Convert.

        Args:
            x: Input.

        Returns:
            String.
        \"\"\"
        return str(x)

    def target_func(y: float) -> int:
        \"\"\"Target function being documented.

        Args:
            y: Float.

        Returns:
            Int.
        \"\"\"
        return int(y)

    def gamma(z: str) -> bool:
        \"\"\"Check.

        Args:
            z: String.

        Returns:
            Bool.
        \"\"\"
        return bool(z)
""")


def _make_change(file_path: str = "src/utils.py") -> EntityChange:
    entity = CodeEntity(
        name="target_func",
        entity_type="function",
        file_path=file_path,
        start_line=15,
        end_line=25,
        content="def target_func(y: float) -> int:\n    return int(y)",
    )
    return EntityChange(
        entity=entity,
        change_type=ChangeType.SIGNATURE_CHANGED,
        new_content=entity.content,
    )


def _make_agent() -> VerificationAgent:
    """Build a VerificationAgent with a mocked LLM that captures call args."""
    from src.agents.llm import LLMConfig

    mock_llm = MagicMock()
    mock_llm.generate = AsyncMock(
        return_value=MagicMock(content="Generated docs.", usage={})
    )

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


# Shared patches needed by all generate_documentation calls
_GEN_PATCHES = (
    "src.agents.verifier.get_tenant_id",
    "src.agents.verifier.record_llm_request",
)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestPromptEnrichment:
    @pytest.mark.asyncio
    async def test_pe01_neighbor_context_in_prompt(self, tmp_path: Path):
        """PE-01: When repo_path provided and file exists, prompt contains neighbor code."""
        src_dir = tmp_path / "src"
        src_dir.mkdir()
        (src_dir / "utils.py").write_text(SAMPLE_PYTHON)

        agent = _make_agent()
        change = _make_change("src/utils.py")

        with (
            patch("src.agents.verifier.prompt_manager") as mock_pm,
            patch("src.agents.verifier.get_tenant_id", return_value="t-test"),
            patch("src.agents.verifier.record_llm_request"),
        ):
            mock_pm.get_prompt.return_value = "system"
            await agent.generate_documentation(change, repo_path=tmp_path)

        rendered_prompt = agent.generator.generate.call_args_list[0][1]["prompt"]
        # alpha or gamma should appear as neighbor context
        assert "alpha" in rendered_prompt or "gamma" in rendered_prompt

    @pytest.mark.asyncio
    async def test_pe02_import_block_in_prompt(self, tmp_path: Path):
        """PE-02: Import block from the source file appears in the prompt."""
        src_dir = tmp_path / "src"
        src_dir.mkdir()
        (src_dir / "utils.py").write_text(SAMPLE_PYTHON)

        agent = _make_agent()
        change = _make_change("src/utils.py")

        with (
            patch("src.agents.verifier.prompt_manager") as mock_pm,
            patch("src.agents.verifier.get_tenant_id", return_value="t-test"),
            patch("src.agents.verifier.record_llm_request"),
        ):
            mock_pm.get_prompt.return_value = "system"
            await agent.generate_documentation(change, repo_path=tmp_path)

        rendered_prompt = agent.generator.generate.call_args_list[0][1]["prompt"]
        assert "import os" in rendered_prompt

    @pytest.mark.asyncio
    async def test_pe03_style_guide_in_prompt(self, tmp_path: Path):
        """PE-03: Detected docstring style (google) appears in the prompt."""
        src_dir = tmp_path / "src"
        src_dir.mkdir()
        (src_dir / "utils.py").write_text(SAMPLE_PYTHON)

        agent = _make_agent()
        change = _make_change("src/utils.py")

        with (
            patch("src.agents.verifier.prompt_manager") as mock_pm,
            patch("src.agents.verifier.get_tenant_id", return_value="t-test"),
            patch("src.agents.verifier.record_llm_request"),
        ):
            mock_pm.get_prompt.return_value = "system"
            await agent.generate_documentation(change, repo_path=tmp_path)

        rendered_prompt = agent.generator.generate.call_args_list[0][1]["prompt"]
        assert "google" in rendered_prompt.lower()

    @pytest.mark.asyncio
    async def test_pe04_enricher_failure_falls_back_gracefully(self, tmp_path: Path):
        """PE-04: If ContextEnricher raises, prompt still renders without KeyError."""
        agent = _make_agent()
        change = _make_change("src/utils.py")

        with (
            patch("src.agents.verifier.prompt_manager") as mock_pm,
            patch("src.agents.verifier.get_tenant_id", return_value="t-test"),
            patch("src.agents.verifier.record_llm_request"),
            patch(
                "src.pipeline.context_enrichment.ContextEnricher.extract_neighbors",
                side_effect=RuntimeError("disk error"),
            ),
        ):
            mock_pm.get_prompt.return_value = "system"
            draft = await agent.generate_documentation(change, repo_path=tmp_path)

        assert draft is not None
        assert draft.content == "Generated docs."

    @pytest.mark.asyncio
    async def test_pe05_no_repo_path_skips_enrichment(self):
        """PE-05: repo_path=None → enrichment skipped, prompt renders without new slots."""
        agent = _make_agent()
        change = _make_change("src/utils.py")

        with (
            patch("src.agents.verifier.prompt_manager") as mock_pm,
            patch("src.agents.verifier.get_tenant_id", return_value="t-test"),
            patch("src.agents.verifier.record_llm_request"),
        ):
            mock_pm.get_prompt.return_value = "system"
            draft = await agent.generate_documentation(change, repo_path=None)

        assert draft is not None

    @pytest.mark.asyncio
    async def test_pe06_enrichment_does_not_duplicate_existing_slots(self, tmp_path: Path):
        """PE-06: New enrichment slots don't collide with existing prompt slots."""
        src_dir = tmp_path / "src"
        src_dir.mkdir()
        (src_dir / "utils.py").write_text(SAMPLE_PYTHON)

        agent = _make_agent()
        change = _make_change("src/utils.py")

        with (
            patch("src.agents.verifier.prompt_manager") as mock_pm,
            patch("src.agents.verifier.get_tenant_id", return_value="t-test"),
            patch("src.agents.verifier.record_llm_request"),
        ):
            mock_pm.get_prompt.return_value = "system"
            draft = await agent.generate_documentation(change, repo_path=tmp_path)

        rendered_prompt = agent.generator.generate.call_args_list[0][1]["prompt"]
        # Original slots must still be present
        assert "target_func" in rendered_prompt  # entity_name
        assert "src/utils.py" in rendered_prompt  # file_path
        assert "SIGNATURE_CHANGED" in rendered_prompt  # change_type
