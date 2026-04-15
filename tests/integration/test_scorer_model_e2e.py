"""
TEST-01 / B5: Scoring Model Selection — End-to-End (E2E).

Verifies that the tenant's `llmConfig.scoringModel` value is correctly read
from the DB and threaded through to `PRAnalyzer.analyze_pr` as part of the
`llm_config` argument. This proves the full DB → TenantContext → pipeline
config path works correctly for both scoring model options.

The actual scorer dispatch logic (basic vs holistic) is covered by unit tests
in test_verifier_scoring_dispatch.py (A1). These E2E tests focus on
the plumbing between the DB config and the pipeline entry point.

Covered:
  - scoringModel='holistic' in llmConfig → analyze_pr receives llm_config with 'holistic'
  - scoringModel='basic' in llmConfig → analyze_pr receives llm_config with 'basic'
  - No scoringModel configured → analyze_pr receives llm_config without scoringModel key
    (defaults to 'basic' inside VerificationAgent)
  - Two tenants with different scoring models processed identically (determinism)
"""

from contextlib import ExitStack
from unittest.mock import MagicMock, patch

import pytest

from src.pipeline import job_manager as jm_module
from src.pipeline.handler import process_pull_request
from src.storage.sql_models import Tenant
from tests.integration.conftest import (
    INSTALLATION_ID,
    TENANT_ID,
    TestingSessionLocal,
    make_analysis_result,
    pipeline_patch_stack,
)

# ── helpers ───────────────────────────────────────────────────────────────────

_CHANGED_FILES = [{"filename": "src/core.py", "status": "modified", "additions": 3, "deletions": 1}]


def _set_llm_config(scoring_model: str | None):
    """Update the seeded tenant's llmConfig with the given scoringModel."""
    db = TestingSessionLocal()
    try:
        t = db.query(Tenant).filter(Tenant.id == TENANT_ID).first()
        t.llmConfig = {"scoringModel": scoring_model} if scoring_model else {}
        db.commit()
    finally:
        db.close()


async def _run_pipeline_capture_llm_config(result) -> dict | None:
    """
    Run process_pull_request, intercept the analyze_pr call, and return
    the llm_config that was passed to it.
    """
    captured: list[dict] = []

    async def fake_analyze_pr(**kwargs):
        captured.append(kwargs.get("llm_config"))
        return result

    mock_analyzer = MagicMock()
    mock_analyzer.analyze_pr = fake_analyze_pr

    base_patches = pipeline_patch_stack(result)
    with ExitStack() as stack:
        for p in base_patches:
            stack.enter_context(p)
        # Override PRAnalyzer with our capturing mock
        stack.enter_context(patch("src.pipeline.handler.PRAnalyzer", return_value=mock_analyzer))
        stack.enter_context(
            patch.object(jm_module.job_manager, "_session_factory", TestingSessionLocal)
        )
        await process_pull_request(
            installation_id=INSTALLATION_ID,
            owner="org",
            repo="myrepo",
            pr_number=55,
            action="opened",
            base_sha="abc",
            head_sha="def",
            changed_files=_CHANGED_FILES,
            base_ref="main",
        )

    return captured[0] if captured else None


# ── tests ─────────────────────────────────────────────────────────────────────


class TestScorerModelE2E:
    @pytest.mark.asyncio
    async def test_holistic_scorer_config_threaded_through(self, seed_tenant):
        """tenant.llmConfig.scoringModel='holistic' → analyze_pr llm_config contains 'holistic'."""
        _set_llm_config("holistic")
        result = make_analysis_result(pr_number=55)

        llm_config = await _run_pipeline_capture_llm_config(result)

        assert llm_config is not None
        assert llm_config.get("scoringModel") == "holistic"

    @pytest.mark.asyncio
    async def test_basic_scorer_config_threaded_through(self, seed_tenant):
        """tenant.llmConfig.scoringModel='basic' → analyze_pr llm_config contains 'basic'."""
        _set_llm_config("basic")
        result = make_analysis_result(pr_number=55)

        llm_config = await _run_pipeline_capture_llm_config(result)

        assert llm_config is not None
        assert llm_config.get("scoringModel") == "basic"

    @pytest.mark.asyncio
    async def test_no_scoring_model_passes_empty_config(self, seed_tenant):
        """No scoringModel in llmConfig → llm_config is {} (VerificationAgent defaults to basic)."""
        _set_llm_config(None)  # empty llmConfig
        result = make_analysis_result(pr_number=55)

        llm_config = await _run_pipeline_capture_llm_config(result)

        # Empty dict is fine — VerificationAgent.verify() defaults to "basic"
        assert llm_config is not None
        assert "scoringModel" not in llm_config

    @pytest.mark.asyncio
    async def test_scorer_model_determinism(self, seed_tenant):
        """Same tenant config always produces the same llm_config in two consecutive runs."""
        _set_llm_config("holistic")
        result = make_analysis_result(pr_number=55)

        config_first = await _run_pipeline_capture_llm_config(result)
        config_second = await _run_pipeline_capture_llm_config(result)

        assert config_first == config_second
        assert config_first.get("scoringModel") == "holistic"
