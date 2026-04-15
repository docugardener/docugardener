"""
ENT-03: LLM Usage Tracking & Cost Estimation Tests.

Tests for token accumulation, cost calculation, and usage metadata
in LLMResponse, GeminiClient, and VerificationAgent.

Coverage:
1. LLMResponse usage field defaults and population
2. GeminiClient.generate() usage_metadata handling
3. VerificationAgent._accumulate_usage() token accumulation
4. VerificationAgent.session_llm_usage property cost calculations
5. PRAnalysisResult.llm_usage field integration
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.agents.llm import (
    GeminiClient,
    LLMResponse,
)
from src.agents.verifier import VerificationAgent
from src.pipeline.analyzer import PRAnalysisResult

# ── Test LLMResponse Usage Field ──────────────────────────────────────────────


class TestLLMResponseUsage:
    """Tests for LLMResponse usage field."""

    def test_usage_defaults_to_none(self):
        """
        LLMResponse.usage should default to None when not provided.
        """
        response = LLMResponse(
            content="Test content",
            model="gemini-2.0-flash",
        )
        assert response.usage is None

    def test_usage_populated_with_dict(self):
        """
        LLMResponse.usage should accept a dict with prompt_tokens and completion_tokens.
        """
        response = LLMResponse(
            content="Test content",
            model="gemini-2.0-flash",
            usage={"prompt_tokens": 150, "completion_tokens": 75},
        )
        assert response.usage is not None
        assert response.usage["prompt_tokens"] == 150
        assert response.usage["completion_tokens"] == 75


# ── Test GeminiClient Usage Metadata Handling ─────────────────────────────────


class TestGeminiClientUsageMetadata:
    """Tests for GeminiClient.generate() usage_metadata handling."""

    def _make_gemini_client(self) -> GeminiClient:
        """Create a GeminiClient with mocked model."""
        with patch("src.agents.llm.settings") as mock_settings:
            mock_settings.gemini_api_key = "test-key"
            client = GeminiClient.__new__(GeminiClient)
            client.model_name = "gemini-2.0-flash"
            client._model = MagicMock()
        return client

    def _make_response_with_usage(
        self, prompt_tokens: int | None, completion_tokens: int | None
    ) -> MagicMock:
        """Create a mock Gemini response with usage_metadata."""
        mock_response = MagicMock()

        # Mock candidate with content
        mock_part = MagicMock()
        mock_part.text = "Generated documentation text"
        mock_content = MagicMock()
        mock_content.parts = [mock_part]
        mock_candidate = MagicMock()
        mock_candidate.content = mock_content
        mock_candidate.finish_reason = MagicMock()
        mock_candidate.finish_reason.name = "STOP"
        mock_response.candidates = [mock_candidate]

        # Mock usage_metadata
        mock_usage = MagicMock()
        mock_usage.prompt_token_count = prompt_tokens
        mock_usage.candidates_token_count = completion_tokens
        mock_response.usage_metadata = mock_usage

        return mock_response

    @pytest.mark.asyncio
    async def test_generate_with_usage_metadata_populates_usage(self):
        """
        When GeminiClient.generate() receives usage_metadata, it should populate
        the usage dict in LLMResponse.
        """
        client = self._make_gemini_client()
        mock_response = self._make_response_with_usage(prompt_tokens=200, completion_tokens=100)
        client._model.generate_content = MagicMock(return_value=mock_response)

        response = await client.generate(prompt="Test prompt")

        assert response.usage is not None
        assert response.usage["prompt_tokens"] == 200
        assert response.usage["completion_tokens"] == 100

    @pytest.mark.asyncio
    async def test_generate_without_usage_metadata_returns_zero_counts(self):
        """
        When GeminiClient.generate() does not receive usage_metadata,
        usage should be {"prompt_tokens": 0, "completion_tokens": 0}
        (normalize_usage always returns a dict, never None).
        """
        client = self._make_gemini_client()
        mock_response = MagicMock()
        mock_part = MagicMock()
        mock_part.text = "Generated text"
        mock_content = MagicMock()
        mock_content.parts = [mock_part]
        mock_candidate = MagicMock()
        mock_candidate.content = mock_content
        mock_candidate.finish_reason = MagicMock()
        mock_candidate.finish_reason.name = "STOP"
        mock_response.candidates = [mock_candidate]
        mock_response.usage_metadata = None  # No usage metadata

        client._model.generate_content = MagicMock(return_value=mock_response)

        response = await client.generate(prompt="Test prompt")

        assert response.usage == {"prompt_tokens": 0, "completion_tokens": 0}

    @pytest.mark.asyncio
    async def test_generate_with_none_token_counts_coerced_to_zero(self):
        """
        When usage_metadata fields are None, they should be coerced to 0.
        """
        client = self._make_gemini_client()
        mock_response = self._make_response_with_usage(prompt_tokens=None, completion_tokens=None)
        client._model.generate_content = MagicMock(return_value=mock_response)

        response = await client.generate(prompt="Test prompt")

        assert response.usage is not None
        assert response.usage["prompt_tokens"] == 0
        assert response.usage["completion_tokens"] == 0


# ── Test VerificationAgent Token Accumulation ─────────────────────────────────


class TestVerificationAgentAccumulation:
    """Tests for VerificationAgent._accumulate_usage() and session_llm_usage."""

    def _make_agent(self, provider: str = "gemini", model: str = "gemini-2.0-flash"):
        """Create a VerificationAgent with mocked dependencies."""
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
            # Override provider and model for testing
            agent._session_provider = provider
            agent._session_model = model

        return agent, mock_llm

    def test_accumulate_usage_with_usage_increments_tokens(self):
        """
        _accumulate_usage() with response.usage should increment _session_tokens.
        """
        agent, _ = self._make_agent()

        response = LLMResponse(
            content="Test",
            model="gemini-2.0-flash",
            usage={"prompt_tokens": 100, "completion_tokens": 50},
        )

        agent._accumulate_usage(response)

        assert agent._session_tokens["prompt_tokens"] == 100
        assert agent._session_tokens["completion_tokens"] == 50

    def test_accumulate_usage_with_none_usage_no_change(self):
        """
        _accumulate_usage() with response.usage=None should not change tokens.
        """
        agent, _ = self._make_agent()

        response = LLMResponse(
            content="Test",
            model="gemini-2.0-flash",
            usage=None,
        )

        agent._accumulate_usage(response)

        assert agent._session_tokens["prompt_tokens"] == 0
        assert agent._session_tokens["completion_tokens"] == 0

    def test_accumulate_usage_multiple_calls_sum_correctly(self):
        """
        Multiple calls to _accumulate_usage() should accumulate tokens correctly.
        """
        agent, _ = self._make_agent()

        response1 = LLMResponse(
            content="Test",
            model="gemini-2.0-flash",
            usage={"prompt_tokens": 100, "completion_tokens": 50},
        )
        response2 = LLMResponse(
            content="Test",
            model="gemini-2.0-flash",
            usage={"prompt_tokens": 200, "completion_tokens": 75},
        )
        response3 = LLMResponse(
            content="Test",
            model="gemini-2.0-flash",
            usage={"prompt_tokens": 50, "completion_tokens": 25},
        )

        agent._accumulate_usage(response1)
        agent._accumulate_usage(response2)
        agent._accumulate_usage(response3)

        assert agent._session_tokens["prompt_tokens"] == 350
        assert agent._session_tokens["completion_tokens"] == 150

    def test_session_llm_usage_gemini_correct_cost(self):
        """
        session_llm_usage for Gemini should calculate cost correctly:
        cost = (prompt_tokens / 1M * 0.10) + (completion_tokens / 1M * 0.40)
        """
        agent, _ = self._make_agent(provider="gemini")

        response = LLMResponse(
            content="Test",
            model="gemini-2.0-flash",
            usage={"prompt_tokens": 1_000_000, "completion_tokens": 500_000},
        )
        agent._accumulate_usage(response)

        usage = agent.session_llm_usage

        # 1M input tokens: 1M / 1M * 0.10 = 0.10
        # 500k output tokens: 500k / 1M * 0.40 = 0.20
        # Total: 0.30
        assert usage["estimated_cost_usd"] == 0.30
        assert usage["provider"] == "gemini"
        assert usage["prompt_tokens"] == 1_000_000
        assert usage["completion_tokens"] == 500_000
        assert usage["total_tokens"] == 1_500_000

    def test_session_llm_usage_ollama_zero_cost(self):
        """
        session_llm_usage for Ollama should return cost of 0.0.
        """
        agent, _ = self._make_agent(provider="ollama", model="llama3")

        response = LLMResponse(
            content="Test",
            model="llama3",
            usage={"prompt_tokens": 1_000_000, "completion_tokens": 500_000},
        )
        agent._accumulate_usage(response)

        usage = agent.session_llm_usage

        assert usage["estimated_cost_usd"] == 0.0
        assert usage["provider"] == "ollama"
        assert usage["total_tokens"] == 1_500_000

    def test_session_llm_usage_total_tokens_sum(self):
        """
        session_llm_usage should return total_tokens = prompt_tokens + completion_tokens.
        """
        agent, _ = self._make_agent()

        response = LLMResponse(
            content="Test",
            model="gemini-2.0-flash",
            usage={"prompt_tokens": 300, "completion_tokens": 200},
        )
        agent._accumulate_usage(response)

        usage = agent.session_llm_usage

        assert usage["total_tokens"] == 500

    def test_session_llm_usage_zero_cost_when_no_tokens(self):
        """
        session_llm_usage should return zero cost when no tokens accumulated.
        """
        agent, _ = self._make_agent()

        usage = agent.session_llm_usage

        assert usage["estimated_cost_usd"] == 0.0
        assert usage["prompt_tokens"] == 0
        assert usage["completion_tokens"] == 0
        assert usage["total_tokens"] == 0

    def test_session_llm_usage_cost_rounded_to_six_decimals(self):
        """
        session_llm_usage should round cost to 6 decimal places.
        """
        agent, _ = self._make_agent(provider="gemini")

        # Use small token counts to get a fractional cost
        response = LLMResponse(
            content="Test",
            model="gemini-2.0-flash",
            usage={"prompt_tokens": 123, "completion_tokens": 456},
        )
        agent._accumulate_usage(response)

        usage = agent.session_llm_usage

        # 123 / 1M * 0.10 = 0.0000123
        # 456 / 1M * 0.40 = 0.0001824
        # Total: 0.0001947
        expected = round(0.0001947, 6)
        assert usage["estimated_cost_usd"] == expected


# ── Test PRAnalysisResult LLM Usage Field ──────────────────────────────────────


class TestPRAnalysisResultLLMUsage:
    """Tests for PRAnalysisResult.llm_usage field."""

    def test_llm_usage_defaults_to_none(self):
        """
        PRAnalysisResult.llm_usage should default to None.
        """
        result = PRAnalysisResult(
            pr_number=123,
            repo_full_name="owner/repo",
        )
        assert result.llm_usage is None

    def test_llm_usage_can_be_set(self):
        """
        PRAnalysisResult.llm_usage can be set to a dict.
        """
        result = PRAnalysisResult(
            pr_number=123,
            repo_full_name="owner/repo",
            llm_usage={
                "provider": "gemini",
                "model": "gemini-2.0-flash",
                "prompt_tokens": 1000,
                "completion_tokens": 500,
                "total_tokens": 1500,
                "estimated_cost_usd": 0.0003,
            },
        )
        assert result.llm_usage is not None
        assert result.llm_usage["estimated_cost_usd"] == 0.0003
