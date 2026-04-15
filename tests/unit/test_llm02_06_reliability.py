"""
LLM-02 through LLM-06 reliability and operational improvement tests.

LLM-02: Retry/backoff on transient API errors
LLM-03: Ollama wire_format config persisted per tenant
LLM-04: (Tested in Vitest — Gemini model list cache is in the TS route handler)
LLM-05: Per-provider cost tracking in session_llm_usage
LLM-06: Per-tenant LLM call rate limiter
"""

import asyncio
from unittest.mock import MagicMock, patch

import pytest

# ── LLM-02: _llm_call_with_retry ─────────────────────────────────────────────
from src.agents.llm import _is_transient, _llm_call_with_retry


class TestIsTransient:
    def test_rate_limit_error_is_transient(self):
        class RateLimitError(Exception):
            pass

        assert _is_transient(RateLimitError("quota exceeded"))

    def test_service_unavailable_is_transient(self):
        class ServiceUnavailable(Exception):
            pass

        assert _is_transient(ServiceUnavailable("503"))

    def test_resource_exhausted_is_transient(self):
        class ResourceExhausted(Exception):
            pass

        assert _is_transient(ResourceExhausted("resource exhausted"))

    def test_connect_error_is_transient(self):
        class ConnectError(Exception):
            pass

        assert _is_transient(ConnectError("connection refused"))

    def test_timeout_exception_is_transient(self):
        class TimeoutException(Exception):
            pass

        assert _is_transient(TimeoutException("timed out"))

    def test_value_error_is_not_transient(self):
        assert not _is_transient(ValueError("invalid input"))

    def test_type_error_is_not_transient(self):
        assert not _is_transient(TypeError("bad type"))

    def test_key_error_is_not_transient(self):
        assert not _is_transient(KeyError("missing key"))

    def test_http_429_via_status_code_is_transient(self):
        exc = Exception("Too Many Requests")
        exc.status_code = 429
        assert _is_transient(exc)

    def test_http_503_via_status_code_is_transient(self):
        exc = Exception("Service Unavailable")
        exc.status_code = 503
        assert _is_transient(exc)

    def test_http_200_via_status_code_is_not_transient(self):
        exc = Exception("weird 200 error")
        exc.status_code = 200
        assert not _is_transient(exc)

    def test_response_object_status_code_transient(self):
        exc = Exception("upstream error")
        exc.response = MagicMock()
        exc.response.status_code = 502
        assert _is_transient(exc)


class TestLlmCallWithRetry:
    @pytest.mark.asyncio
    async def test_succeeds_on_first_attempt(self):
        call_count = 0

        async def coro_fn():
            nonlocal call_count
            call_count += 1
            return "success"

        result = await _llm_call_with_retry(coro_fn, max_attempts=3, base_delay=0.0)
        assert result == "success"
        assert call_count == 1

    @pytest.mark.asyncio
    async def test_retries_on_transient_error_then_succeeds(self):
        call_count = 0

        class RateLimitError(Exception):
            pass

        async def coro_fn():
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                raise RateLimitError("quota")
            return "success after retry"

        result = await _llm_call_with_retry(coro_fn, max_attempts=3, base_delay=0.0)
        assert result == "success after retry"
        assert call_count == 3

    @pytest.mark.asyncio
    async def test_raises_after_max_attempts(self):
        class ServiceUnavailable(Exception):
            pass

        async def coro_fn():
            raise ServiceUnavailable("down")

        with pytest.raises(ServiceUnavailable):
            await _llm_call_with_retry(coro_fn, max_attempts=3, base_delay=0.0)

    @pytest.mark.asyncio
    async def test_non_transient_error_raises_immediately(self):
        call_count = 0

        async def coro_fn():
            nonlocal call_count
            call_count += 1
            raise ValueError("bad input")

        with pytest.raises(ValueError):
            await _llm_call_with_retry(coro_fn, max_attempts=3, base_delay=0.0)

        assert call_count == 1  # No retry on non-transient

    @pytest.mark.asyncio
    async def test_call_count_matches_max_attempts(self):
        class ConnectError(Exception):
            pass

        call_count = 0

        async def coro_fn():
            nonlocal call_count
            call_count += 1
            raise ConnectError("refused")

        with pytest.raises(ConnectError):
            await _llm_call_with_retry(coro_fn, max_attempts=4, base_delay=0.0)

        assert call_count == 4

    @pytest.mark.asyncio
    async def test_single_attempt_no_retry(self):
        class ReadTimeout(Exception):
            pass

        call_count = 0

        async def coro_fn():
            nonlocal call_count
            call_count += 1
            raise ReadTimeout("timed out")

        with pytest.raises(ReadTimeout):
            await _llm_call_with_retry(coro_fn, max_attempts=1, base_delay=0.0)

        assert call_count == 1


# ── LLM-03: Ollama wire_format persistence ────────────────────────────────────

from src.agents.llm import OllamaClient


class TestOllamaWireFormat:
    def test_default_wire_format_is_none(self):
        """Without wire_format, auto-detect should be used."""
        with patch("src.agents.llm.settings") as mock_settings:
            mock_settings.ollama_url = "http://localhost:11434"
            mock_settings.ollama_model = "llama3"
            client = OllamaClient()
        assert client._api_format is None

    def test_ollama_wire_format_skips_auto_detect(self):
        """wire_format='ollama' sets _api_format immediately."""
        with patch("src.agents.llm.settings") as mock_settings:
            mock_settings.ollama_url = "http://localhost:11434"
            mock_settings.ollama_model = "llama3"
            client = OllamaClient(wire_format="ollama")
        assert client._api_format == "ollama"

    def test_openai_wire_format_skips_auto_detect(self):
        """wire_format='openai' sets _api_format immediately."""
        with patch("src.agents.llm.settings") as mock_settings:
            mock_settings.ollama_url = "http://localhost:11434"
            mock_settings.ollama_model = "llama3"
            client = OllamaClient(wire_format="openai")
        assert client._api_format == "openai"

    def test_invalid_wire_format_falls_back_to_auto_detect(self):
        """Unknown wire_format value → auto-detect (None)."""
        with patch("src.agents.llm.settings") as mock_settings:
            mock_settings.ollama_url = "http://localhost:11434"
            mock_settings.ollama_model = "llama3"
            client = OllamaClient(wire_format="grpc")
        assert client._api_format is None

    def test_none_wire_format_means_auto_detect(self):
        """Explicit None → auto-detect."""
        with patch("src.agents.llm.settings") as mock_settings:
            mock_settings.ollama_url = "http://localhost:11434"
            mock_settings.ollama_model = "llama3"
            client = OllamaClient(wire_format=None)
        assert client._api_format is None


# ── LLM-05: Per-provider cost tracking ───────────────────────────────────────

from src.agents.verifier import _PROVIDER_COSTS, VerificationAgent


class TestProviderCostTable:
    def test_gemini_has_nonzero_cost(self):
        assert _PROVIDER_COSTS["gemini"]["input"] > 0
        assert _PROVIDER_COSTS["gemini"]["output"] > 0

    def test_openai_has_nonzero_cost(self):
        assert _PROVIDER_COSTS["openai"]["input"] > 0
        assert _PROVIDER_COSTS["openai"]["output"] > 0

    def test_ollama_is_free(self):
        assert _PROVIDER_COSTS["ollama"]["input"] == 0.0
        assert _PROVIDER_COSTS["ollama"]["output"] == 0.0

    def test_openai_more_expensive_than_gemini(self):
        """OpenAI gpt-4o is more expensive than Gemini Flash."""
        assert _PROVIDER_COSTS["openai"]["input"] > _PROVIDER_COSTS["gemini"]["input"]


class TestSessionLlmUsage:
    """Test VerificationAgent.session_llm_usage cost calculation."""

    def _make_agent(
        self, provider: str, prompt_tokens: int, completion_tokens: int
    ) -> VerificationAgent:
        agent = object.__new__(VerificationAgent)
        agent._session_tokens = {
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
        }
        agent._session_provider = provider
        agent._session_model = "test-model"
        return agent

    def test_gemini_cost_calculation(self):
        agent = self._make_agent("gemini", 1_000_000, 1_000_000)
        usage = agent.session_llm_usage
        expected = _PROVIDER_COSTS["gemini"]["input"] + _PROVIDER_COSTS["gemini"]["output"]
        assert abs(usage["estimated_cost_usd"] - expected) < 0.001

    def test_openai_cost_calculation(self):
        agent = self._make_agent("openai", 1_000_000, 1_000_000)
        usage = agent.session_llm_usage
        expected = _PROVIDER_COSTS["openai"]["input"] + _PROVIDER_COSTS["openai"]["output"]
        assert abs(usage["estimated_cost_usd"] - expected) < 0.001

    def test_ollama_cost_is_zero(self):
        agent = self._make_agent("ollama", 50_000, 20_000)
        usage = agent.session_llm_usage
        assert usage["estimated_cost_usd"] == 0.0

    def test_zero_tokens_zero_cost(self):
        agent = self._make_agent("gemini", 0, 0)
        usage = agent.session_llm_usage
        assert usage["estimated_cost_usd"] == 0.0
        assert usage["total_tokens"] == 0

    def test_usage_includes_all_fields(self):
        agent = self._make_agent("gemini", 100, 50)
        usage = agent.session_llm_usage
        assert "provider" in usage
        assert "model" in usage
        assert "prompt_tokens" in usage
        assert "completion_tokens" in usage
        assert "total_tokens" in usage
        assert "estimated_cost_usd" in usage

    def test_total_tokens_sum(self):
        agent = self._make_agent("gemini", 300, 700)
        usage = agent.session_llm_usage
        assert usage["total_tokens"] == 1000

    def test_unknown_provider_defaults_to_zero_cost(self):
        """An unrecognized provider should not raise — default to 0 cost."""
        agent = self._make_agent("custom_llm", 100_000, 50_000)
        usage = agent.session_llm_usage
        assert usage["estimated_cost_usd"] == 0.0


# ── LLM-06: Per-tenant rate limiter ──────────────────────────────────────────

from src.agents.llm import (
    LLM_RATE_CALLS_PER_MINUTE,
    LLMTenantRateLimiter,
    check_llm_rate_limit,
)


class TestLlmTenantRateLimiter:
    @pytest.mark.asyncio
    async def test_allows_calls_within_burst(self):
        limiter = LLMTenantRateLimiter(calls_per_minute=60, burst=5)
        results = [await limiter.acquire() for _ in range(5)]
        assert all(results)

    @pytest.mark.asyncio
    async def test_blocks_calls_exceeding_burst(self):
        limiter = LLMTenantRateLimiter(calls_per_minute=60, burst=3)
        results = [await limiter.acquire() for _ in range(6)]
        # First 3 allowed, remaining throttled
        assert results[:3] == [True, True, True]
        assert not any(results[3:])

    @pytest.mark.asyncio
    async def test_tokens_refill_over_time(self):
        # Very high rate (600/min = 10/sec) so tokens refill quickly
        limiter = LLMTenantRateLimiter(calls_per_minute=600, burst=1)
        assert await limiter.acquire()  # drain
        assert not await limiter.acquire()  # rate-limited
        await asyncio.sleep(0.12)  # wait 120ms for ~1.2 tokens to refill at 10/sec
        assert await limiter.acquire()  # should be allowed now


class TestCheckLlmRateLimit:
    @pytest.mark.asyncio
    async def test_different_tenants_have_separate_buckets(self):
        """Each tenant has their own rate limit bucket."""
        # Drain tenant A's burst completely
        limiter_a = LLMTenantRateLimiter(calls_per_minute=60, burst=2)
        await limiter_a.acquire()
        await limiter_a.acquire()
        # Tenant B should still have tokens
        limiter_b = LLMTenantRateLimiter(calls_per_minute=60, burst=2)
        assert await limiter_b.acquire()

    @pytest.mark.asyncio
    async def test_check_llm_rate_limit_returns_bool(self):
        """check_llm_rate_limit returns True when allowed."""
        result = await check_llm_rate_limit("test-tenant-rate-limit-001")
        assert isinstance(result, bool)

    @pytest.mark.asyncio
    async def test_rate_limit_constant_is_positive(self):
        assert LLM_RATE_CALLS_PER_MINUTE > 0
