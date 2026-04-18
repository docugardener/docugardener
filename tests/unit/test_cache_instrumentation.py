# SPDX-License-Identifier: AGPL-3.0-or-later
"""
EPIC-04-02: Cache hit instrumentation tests.

Tests that Anthropic cache token counts are captured, accumulated, and surfaced
in session_llm_usage. Also verifies other providers default gracefully to 0.

Covers:
  A. AnthropicClient.generate() extracts cache tokens from raw response
  B. AnthropicClient.generate_with_history() extracts cache tokens
  C. _accumulate_usage sums cache_read_tokens and cache_creation_tokens
  D. session_llm_usage includes cache fields and cache_hit_rate
  E. cache_hit_rate = 0 when no cache activity
  F. cache_hit_rate calculation: read / (read + creation)
  G. Non-Anthropic providers: cache fields default to 0
  H. estimated_cost_usd reflects cache_read savings (10% of input price)
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# ── Helpers ───────────────────────────────────────────────────────────────────


def _make_anthropic_raw(
    input_tokens: int = 100,
    output_tokens: int = 50,
    cache_read_input_tokens: int = 0,
    cache_creation_input_tokens: int = 0,
) -> MagicMock:
    """Simulate an anthropic.types.Message response with usage."""
    usage = MagicMock()
    usage.input_tokens = input_tokens
    usage.output_tokens = output_tokens
    usage.cache_read_input_tokens = cache_read_input_tokens
    usage.cache_creation_input_tokens = cache_creation_input_tokens

    raw = MagicMock()
    raw.usage = usage
    raw.stop_reason = "end_turn"
    raw.content = [MagicMock(type="text", text="ok")]
    return raw


def _make_openai_raw(prompt_tokens: int = 100, completion_tokens: int = 50) -> MagicMock:
    """Simulate an openai.types.ChatCompletion response."""
    usage = MagicMock()
    usage.prompt_tokens = prompt_tokens
    usage.completion_tokens = completion_tokens
    raw = MagicMock()
    raw.usage = usage
    raw.choices = [MagicMock(message=MagicMock(content="ok"), finish_reason="stop")]
    return raw


def _make_gemini_raw(prompt_tokens: int = 100, candidate_tokens: int = 50) -> MagicMock:
    """Simulate a Gemini GenerateContentResponse."""
    um = MagicMock()
    um.prompt_token_count = prompt_tokens
    um.candidates_token_count = candidate_tokens
    raw = MagicMock()
    raw.usage_metadata = um
    raw.candidates = [MagicMock(content=MagicMock(parts=[MagicMock(text="ok")]))]
    return raw


# ── A. AnthropicClient.generate() extracts cache tokens ───────────────────────


class TestAnthropicGenerateCacheTokens:
    @pytest.mark.asyncio
    async def test_cache_read_tokens_in_usage(self):
        raw = _make_anthropic_raw(
            input_tokens=200,
            output_tokens=50,
            cache_read_input_tokens=150,
            cache_creation_input_tokens=0,
        )

        with patch("src.agents.llm._llm_call_with_retry", new=AsyncMock(return_value=raw)):
            from src.agents.llm import AnthropicClient

            client = AnthropicClient.__new__(AnthropicClient)
            client.api_key = "sk-test"
            client.model_name = "claude-sonnet-4-6"
            client._client = MagicMock()
            client._client.messages = MagicMock()

            resp = await client.generate("hello", system_prompt="be helpful")

        assert resp.usage is not None
        assert resp.usage["cache_read_tokens"] == 150
        assert resp.usage["cache_creation_tokens"] == 0

    @pytest.mark.asyncio
    async def test_cache_creation_tokens_in_usage(self):
        raw = _make_anthropic_raw(
            input_tokens=100,
            output_tokens=50,
            cache_read_input_tokens=0,
            cache_creation_input_tokens=80,
        )

        with patch("src.agents.llm._llm_call_with_retry", new=AsyncMock(return_value=raw)):
            from src.agents.llm import AnthropicClient

            client = AnthropicClient.__new__(AnthropicClient)
            client.api_key = "sk-test"
            client.model_name = "claude-sonnet-4-6"
            client._client = MagicMock()

            resp = await client.generate("hello")

        assert resp.usage["cache_creation_tokens"] == 80
        assert resp.usage["cache_read_tokens"] == 0

    @pytest.mark.asyncio
    async def test_no_cache_fields_default_to_zero(self):
        """When Anthropic returns None for cache fields, coerce to 0."""
        raw = _make_anthropic_raw()
        raw.usage.cache_read_input_tokens = None
        raw.usage.cache_creation_input_tokens = None

        with patch("src.agents.llm._llm_call_with_retry", new=AsyncMock(return_value=raw)):
            from src.agents.llm import AnthropicClient

            client = AnthropicClient.__new__(AnthropicClient)
            client.api_key = "sk-test"
            client.model_name = "claude-sonnet-4-6"
            client._client = MagicMock()

            resp = await client.generate("hello")

        assert resp.usage["cache_read_tokens"] == 0
        assert resp.usage["cache_creation_tokens"] == 0


# ── B. generate_with_history ──────────────────────────────────────────────────


class TestAnthropicHistoryCacheTokens:
    @pytest.mark.asyncio
    async def test_generate_with_history_extracts_cache_tokens(self):
        raw = _make_anthropic_raw(
            input_tokens=300,
            output_tokens=80,
            cache_read_input_tokens=250,
            cache_creation_input_tokens=10,
        )

        with patch("src.agents.llm._llm_call_with_retry", new=AsyncMock(return_value=raw)):
            from src.agents.llm import AnthropicClient

            client = AnthropicClient.__new__(AnthropicClient)
            client.api_key = "sk-test"
            client.model_name = "claude-sonnet-4-6"
            client._client = MagicMock()

            resp = await client.generate_with_history(
                [
                    {"role": "user", "content": "hello"},
                ]
            )

        assert resp.usage["cache_read_tokens"] == 250
        assert resp.usage["cache_creation_tokens"] == 10


# ── C. _accumulate_usage sums cache fields ────────────────────────────────────


class TestAccumulateUsage:
    def _make_verifier(self):
        """Create a VerificationAgent with patched dependencies."""
        from src.agents.verifier import VerificationAgent

        with (
            patch("src.agents.verifier.create_llm_client"),
            patch("src.agents.verifier.LLMConfig"),
        ):
            verifier = VerificationAgent.__new__(VerificationAgent)
            verifier._session_tokens = {
                "prompt_tokens": 0,
                "completion_tokens": 0,
                "cache_read_tokens": 0,
                "cache_creation_tokens": 0,
            }
            verifier._session_provider = "anthropic"
            verifier._session_model = "claude-sonnet-4-6"
        return verifier

    def test_accumulate_cache_read_tokens(self):
        verifier = self._make_verifier()

        resp_usage = {
            "prompt_tokens": 100,
            "completion_tokens": 50,
            "cache_read_tokens": 80,
            "cache_creation_tokens": 0,
        }
        verifier._accumulate_usage(MagicMock(usage=resp_usage))
        verifier._accumulate_usage(MagicMock(usage=resp_usage))  # called twice

        assert verifier._session_tokens["cache_read_tokens"] == 160

    def test_accumulate_cache_creation_tokens(self):
        verifier = self._make_verifier()

        resp_usage = {
            "prompt_tokens": 100,
            "completion_tokens": 50,
            "cache_read_tokens": 0,
            "cache_creation_tokens": 60,
        }
        verifier._accumulate_usage(MagicMock(usage=resp_usage))

        assert verifier._session_tokens["cache_creation_tokens"] == 60

    def test_accumulate_handles_missing_cache_keys_gracefully(self):
        """Old responses without cache fields should accumulate as 0."""
        verifier = self._make_verifier()

        resp_usage = {"prompt_tokens": 100, "completion_tokens": 50}
        verifier._accumulate_usage(MagicMock(usage=resp_usage))

        assert verifier._session_tokens["cache_read_tokens"] == 0
        assert verifier._session_tokens["cache_creation_tokens"] == 0


# ── D/E/F. session_llm_usage cache fields ────────────────────────────────────


class TestSessionLlmUsage:
    def _make_verifier_with_tokens(
        self,
        prompt: int = 0,
        completion: int = 0,
        cache_read: int = 0,
        cache_creation: int = 0,
        provider: str = "anthropic",
    ):
        from src.agents.verifier import VerificationAgent

        verifier = VerificationAgent.__new__(VerificationAgent)
        verifier._session_tokens = {
            "prompt_tokens": prompt,
            "completion_tokens": completion,
            "cache_read_tokens": cache_read,
            "cache_creation_tokens": cache_creation,
        }
        verifier._session_provider = provider
        verifier._session_model = "claude-sonnet-4-6"
        return verifier

    def test_session_usage_includes_cache_fields(self):
        v = self._make_verifier_with_tokens(
            prompt=100, completion=50, cache_read=80, cache_creation=20
        )
        usage = v.session_llm_usage
        assert "cache_read_tokens" in usage
        assert "cache_creation_tokens" in usage
        assert usage["cache_read_tokens"] == 80
        assert usage["cache_creation_tokens"] == 20

    def test_cache_hit_rate_zero_when_no_cache(self):
        v = self._make_verifier_with_tokens(prompt=100, completion=50)
        usage = v.session_llm_usage
        assert usage["cache_hit_rate"] == 0.0

    def test_cache_hit_rate_100_when_all_read(self):
        v = self._make_verifier_with_tokens(
            prompt=100,
            completion=50,
            cache_read=100,
            cache_creation=0,
        )
        usage = v.session_llm_usage
        assert usage["cache_hit_rate"] == pytest.approx(1.0)

    def test_cache_hit_rate_partial(self):
        """3 reads, 1 creation → hit rate = 3/4 = 0.75"""
        v = self._make_verifier_with_tokens(
            prompt=400,
            completion=50,
            cache_read=300,
            cache_creation=100,
        )
        usage = v.session_llm_usage
        assert usage["cache_hit_rate"] == pytest.approx(0.75)


# ── G. Non-Anthropic providers default to 0 ──────────────────────────────────


class TestNonAnthropicCacheDefaults:
    def _usage(self, provider: str, prompt: int = 100):
        from src.agents.verifier import VerificationAgent

        v = VerificationAgent.__new__(VerificationAgent)
        v._session_tokens = {
            "prompt_tokens": prompt,
            "completion_tokens": 50,
            "cache_read_tokens": 0,
            "cache_creation_tokens": 0,
        }
        v._session_provider = provider
        v._session_model = "any-model"
        return v.session_llm_usage

    def test_gemini_cache_read_tokens_zero(self):
        assert self._usage("gemini")["cache_read_tokens"] == 0

    def test_openai_cache_read_tokens_zero(self):
        assert self._usage("openai")["cache_read_tokens"] == 0

    def test_ollama_cache_creation_tokens_zero(self):
        assert self._usage("ollama")["cache_creation_tokens"] == 0


# ── H. Cost accounts for cache_read savings ──────────────────────────────────


class TestCostWithCacheSavings:
    def test_cache_read_costs_less_than_full_input(self):
        """Anthropic cache reads cost 10% of normal input price.
        100 cache_read vs 100 prompt should be significantly cheaper."""
        from src.agents.verifier import VerificationAgent

        # 100 non-cached prompt tokens
        v_normal = VerificationAgent.__new__(VerificationAgent)
        v_normal._session_tokens = {
            "prompt_tokens": 100,
            "completion_tokens": 0,
            "cache_read_tokens": 0,
            "cache_creation_tokens": 0,
        }
        v_normal._session_provider = "anthropic"
        v_normal._session_model = "claude-sonnet-4-6"

        # same 100 tokens, but as cache reads
        v_cached = VerificationAgent.__new__(VerificationAgent)
        v_cached._session_tokens = {
            "prompt_tokens": 0,
            "completion_tokens": 0,
            "cache_read_tokens": 100,
            "cache_creation_tokens": 0,
        }
        v_cached._session_provider = "anthropic"
        v_cached._session_model = "claude-sonnet-4-6"

        normal_cost = v_normal.session_llm_usage["estimated_cost_usd"]
        cached_cost = v_cached.session_llm_usage["estimated_cost_usd"]

        # Cache read should cost less than normal input
        assert cached_cost < normal_cost
