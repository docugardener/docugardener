"""
LLM abstraction layer for multiple providers.

Supports:
  • Google Gemini  — google-generativeai SDK
  • OpenAI         — openai SDK (AsyncOpenAI)
  • Anthropic      — anthropic SDK (AsyncAnthropic)
  • Ollama         — httpx, native /api/generate or OpenAI-compat /v1/chat/completions

All clients delegate content extraction and usage normalization to
response_normalizer.py and capability lookups to model_registry.py so that
per-model quirks (Gemma system-prompt injection, o1/o3 temperature stripping,
Gemini thinking-model answer extraction) are handled uniformly.
"""

import asyncio
from abc import ABC, abstractmethod
from dataclasses import dataclass
from enum import Enum
from typing import Any

from src.core.config import settings
from src.core.logging import get_logger

logger = get_logger(__name__)


# ---------------------------------------------------------------------------
# LLM-02: Shared retry / exponential backoff for transient API errors
# ---------------------------------------------------------------------------

#: Error type names that warrant a retry (provider-agnostic string matching).
_TRANSIENT_ERROR_NAMES = frozenset({
    # Gemini / google-api-core
    "ResourceExhausted",
    "ServiceUnavailable",
    "DeadlineExceeded",
    "InternalServerError",
    # OpenAI SDK
    "RateLimitError",
    "APIConnectionError",
    "APITimeoutError",
    # Anthropic SDK
    "OverloadedError",
    "APIConnectionError",  # also covers anthropic.APIConnectionError
    # httpx (Ollama)
    "ConnectError",
    "TimeoutException",
    "ReadTimeout",
    "ConnectTimeout",
    # Generic
    "ConnectionError",
    "TimeoutError",
})

#: HTTP status codes that indicate a transient failure.
_TRANSIENT_HTTP_CODES = frozenset({429, 500, 502, 503, 504, 529})  # 529 = Anthropic overloaded


def _is_transient(exc: BaseException) -> bool:
    """Return True when the exception is likely recoverable with a retry."""
    cls_name = type(exc).__name__
    if cls_name in _TRANSIENT_ERROR_NAMES:
        return True
    # Check for http status code on the exception (openai / httpx carry it)
    code = getattr(exc, "status_code", None) or getattr(exc, "response", None)
    if isinstance(code, int) and code in _TRANSIENT_HTTP_CODES:
        return True
    if hasattr(exc, "response") and hasattr(exc.response, "status_code"):
        if exc.response.status_code in _TRANSIENT_HTTP_CODES:
            return True
    return False


async def _llm_call_with_retry(coro_fn, *, max_attempts: int = 3, base_delay: float = 1.0):
    """
    Call an async coroutine with exponential-backoff retry on transient errors.

    Args:
        coro_fn:      Zero-argument async callable (lambda: client.generate(...)).
        max_attempts: Maximum total attempts including the first.
        base_delay:   Initial backoff delay in seconds; doubles each attempt.

    Returns:
        Whatever the coroutine returns on success.

    Raises:
        The last exception if all attempts are exhausted.
    """
    last_exc: BaseException | None = None
    delay = base_delay
    for attempt in range(1, max_attempts + 1):
        try:
            return await coro_fn()
        except Exception as exc:
            if not _is_transient(exc):
                raise  # non-transient — fail fast
            last_exc = exc
            if attempt < max_attempts:
                logger.warning(
                    "LLM-02: Transient error, retrying",
                    error_type=type(exc).__name__,
                    attempt=attempt,
                    max_attempts=max_attempts,
                    delay=delay,
                )
                await asyncio.sleep(delay)
                delay *= 2.0
            else:
                logger.error(
                    "LLM-02: All retry attempts exhausted",
                    error_type=type(exc).__name__,
                    attempts=max_attempts,
                )
    raise last_exc  # type: ignore[misc]


# ---------------------------------------------------------------------------
# LLM-06: Per-tenant LLM call rate limiter (in-process token bucket)
#
# Limits each tenant to LLM_RATE_CALLS_PER_MINUTE LLM generate() calls per
# minute across all providers.  In multi-worker deployments, replace with a
# Redis-backed counter for cross-process enforcement.
# ---------------------------------------------------------------------------

LLM_RATE_CALLS_PER_MINUTE: int = 60  # max LLM calls per tenant per minute
LLM_RATE_BURST: int = 10             # burst allowance

_tenant_rate_limiters: dict[str, "LLMTenantRateLimiter"] = {}
_rate_limiter_lock = asyncio.Lock()


class LLMTenantRateLimiter:
    """Token-bucket rate limiter for a single tenant's LLM calls."""

    def __init__(self, calls_per_minute: int = LLM_RATE_CALLS_PER_MINUTE, burst: int = LLM_RATE_BURST) -> None:
        import time as _time
        self._rate = calls_per_minute / 60.0  # tokens/second
        self._burst = burst
        self._tokens = float(burst)
        self._last = _time.monotonic()
        self._lock = asyncio.Lock()

    async def acquire(self) -> bool:
        """Return True if the call is allowed; False if rate-limited."""
        import time as _time
        async with self._lock:
            now = _time.monotonic()
            elapsed = now - self._last
            self._last = now
            self._tokens = min(self._burst, self._tokens + elapsed * self._rate)
            if self._tokens >= 1.0:
                self._tokens -= 1.0
                return True
            return False


async def _get_tenant_rate_limiter(tenant_id: str) -> LLMTenantRateLimiter:
    async with _rate_limiter_lock:
        if tenant_id not in _tenant_rate_limiters:
            _tenant_rate_limiters[tenant_id] = LLMTenantRateLimiter()
        return _tenant_rate_limiters[tenant_id]


async def check_llm_rate_limit(tenant_id: str) -> bool:
    """
    Check if the tenant is within their LLM call rate limit.

    Returns True if the call is allowed, False if rate-limited.
    Logs a warning when a tenant is throttled.
    """
    limiter = await _get_tenant_rate_limiter(tenant_id)
    allowed = await limiter.acquire()
    if not allowed:
        logger.warning(
            "LLM-06: Rate limit exceeded for tenant",
            tenant_id=tenant_id,
            calls_per_minute=LLM_RATE_CALLS_PER_MINUTE,
        )
    return allowed


class LLMProvider(Enum):
    """Supported LLM providers."""
    GEMINI = "gemini"
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    OLLAMA = "ollama"


@dataclass
class LLMResponse:
    """
    Normalised response from an LLM call.

    Attributes:
        content:       Generated text (answer only — thought blocks stripped).
        model:         Model identifier used for generation.
        finish_reason: Why generation stopped.
        usage:         Token counts {"prompt_tokens": int, "completion_tokens": int}.
        raw_response:  Original provider response object (for debugging).
    """
    content: str
    model: str
    finish_reason: str = "stop"
    usage: dict[str, int] | None = None
    raw_response: Any = None


@dataclass
class LLMConfig:
    """
    Generation configuration.

    Attributes:
        temperature:    Randomness (0 = deterministic).
        max_tokens:     Maximum response tokens.
        top_p:          Nucleus sampling parameter.
        stop_sequences: Sequences that stop generation.
    """
    temperature: float = 0.0
    max_tokens: int = 2048
    top_p: float = 1.0
    stop_sequences: list[str] | None = None


class LLMClient(ABC):
    """Abstract base class providing a unified interface for LLM providers."""

    @abstractmethod
    async def generate(
        self,
        prompt: str,
        system_prompt: str | None = None,
        config: LLMConfig | None = None,
    ) -> LLMResponse:
        """Generate text from a prompt."""

    @abstractmethod
    async def generate_with_history(
        self,
        messages: list[dict[str, str]],
        config: LLMConfig | None = None,
    ) -> LLMResponse:
        """Generate with conversation history."""


# ---------------------------------------------------------------------------
# GeminiClient
# ---------------------------------------------------------------------------

class GeminiClient(LLMClient):
    """
    Google Gemini LLM client (google-generativeai SDK).

    Handles per-model quirks automatically via the model registry:
      • Gemma models: system_instruction not supported — injected as user turn.
      • Thinking-exp models: thought parts stripped; only the answer is returned.
    """

    def __init__(
        self,
        api_key: str | None = None,
        model: str | None = None,
        **kwargs: Any,
    ):
        self.api_key = api_key or settings.gemini_api_key
        self.model_name = model or settings.gemini_model
        self._model = None

        if not self.api_key:
            raise ValueError("Gemini API key not configured")

        self._init_client()

    def _init_client(self) -> None:
        import google.generativeai as genai
        genai.configure(api_key=self.api_key)
        self._model = genai.GenerativeModel(self.model_name)
        logger.info("Gemini client initialised", model=self.model_name)

    async def generate(
        self,
        prompt: str,
        system_prompt: str | None = None,
        config: LLMConfig | None = None,
    ) -> LLMResponse:
        import google.generativeai as genai
        from src.agents.model_registry import get_capability
        from src.agents.response_normalizer import (
            adapt_prompts_with_cap,
            extract_content_with_cap,
            normalize_usage,
        )

        config = config or LLMConfig()
        cap = get_capability("gemini", self.model_name)

        # Adapt system prompt for models that don't accept system_instruction
        adapted_system, adapted_prompt = adapt_prompts_with_cap(system_prompt, prompt, cap)

        generation_config = genai.GenerationConfig(
            temperature=config.temperature,
            max_output_tokens=config.max_tokens,
            top_p=config.top_p,
            stop_sequences=config.stop_sequences,
        )

        if adapted_system and cap.supports_system_prompt:
            model = genai.GenerativeModel(
                model_name=self.model_name,
                system_instruction=adapted_system,
            )
        else:
            model = self._model

        async def _call_gemini():
            return model.generate_content(adapted_prompt, generation_config=generation_config)

        raw = await _llm_call_with_retry(_call_gemini)

        # Determine finish_reason
        finish_reason = "unknown"
        if raw.candidates:
            fr = raw.candidates[0].finish_reason
            finish_reason = fr.name if hasattr(fr, "name") else str(fr)
            if finish_reason in ("SAFETY", "2"):
                logger.warning("Gemini response blocked by safety filter", model=self.model_name)

        content = extract_content_with_cap(raw, cap)
        usage = normalize_usage(raw, cap.input_format)

        logger.debug("Gemini generation complete", model=self.model_name, prompt_len=len(prompt))

        return LLMResponse(
            content=content,
            model=self.model_name,
            finish_reason=finish_reason,
            usage=usage,
            raw_response=raw,
        )

    async def generate_with_history(
        self,
        messages: list[dict[str, str]],
        config: LLMConfig | None = None,
    ) -> LLMResponse:
        import google.generativeai as genai
        from src.agents.model_registry import get_capability
        from src.agents.response_normalizer import normalize_usage

        config = config or LLMConfig()
        cap = get_capability("gemini", self.model_name)
        history = []
        last_system = None

        for msg in messages[:-1]:
            role, content = msg["role"], msg["content"]
            if role == "system":
                last_system = content
            elif role == "user":
                history.append({"role": "user", "parts": [content]})
            elif role == "assistant":
                history.append({"role": "model", "parts": [content]})

        chat = self._model.start_chat(history=history)
        last_message = messages[-1]["content"]

        # Inject system for models that don't support system_instruction
        if last_system and cap.system_prompt_as_user_turn:
            last_message = f"[Instructions]\n{last_system}\n\n[Task]\n{last_message}"

        generation_config = genai.GenerationConfig(
            temperature=config.temperature,
            max_output_tokens=config.max_tokens,
            top_p=config.top_p,
        )
        raw = chat.send_message(last_message, generation_config=generation_config)

        from src.agents.response_normalizer import extract_content_with_cap
        content = extract_content_with_cap(raw, cap)
        usage = normalize_usage(raw, cap.input_format)

        finish_reason = "unknown"
        if raw.candidates:
            fr = raw.candidates[0].finish_reason
            finish_reason = fr.name if hasattr(fr, "name") else str(fr)

        return LLMResponse(
            content=content,
            model=self.model_name,
            finish_reason=finish_reason,
            usage=usage,
            raw_response=raw,
        )


# ---------------------------------------------------------------------------
# OpenAIClient
# ---------------------------------------------------------------------------

class OpenAIClient(LLMClient):
    """
    OpenAI LLM client (openai SDK — AsyncOpenAI).

    Handles per-model quirks automatically via the model registry:
      • o1 / o3 series: system role stripped, temperature and top_p omitted.
      • All other models: standard chat completions.
    """

    def __init__(
        self,
        api_key: str | None = None,
        model: str | None = None,
        **kwargs: Any,
    ):
        self.api_key = api_key or settings.openai_api_key
        self.model_name = model or settings.openai_model

        if not self.api_key:
            raise ValueError("OpenAI API key not configured")

        logger.info("OpenAI client initialised", model=self.model_name)

    async def generate(
        self,
        prompt: str,
        system_prompt: str | None = None,
        config: LLMConfig | None = None,
    ) -> LLMResponse:
        from openai import AsyncOpenAI
        from src.agents.model_registry import get_capability
        from src.agents.response_normalizer import (
            adapt_prompts_with_cap,
            extract_content_with_cap,
            normalize_usage,
        )

        config = config or LLMConfig()
        cap = get_capability("openai", self.model_name)

        adapted_system, adapted_prompt = adapt_prompts_with_cap(system_prompt, prompt, cap)

        messages: list[dict[str, str]] = []
        if adapted_system:
            messages.append({"role": "system", "content": adapted_system})
        messages.append({"role": "user", "content": adapted_prompt})

        payload: dict[str, Any] = {"model": self.model_name, "messages": messages}
        if cap.supports_temperature:
            payload["temperature"] = config.temperature
        if cap.supports_top_p:
            payload["top_p"] = config.top_p
        if config.max_tokens:
            payload["max_tokens"] = config.max_tokens
        if config.stop_sequences:
            payload["stop"] = config.stop_sequences

        client = AsyncOpenAI(api_key=self.api_key)
        raw = await _llm_call_with_retry(lambda: client.chat.completions.create(**payload))

        content = extract_content_with_cap(raw, cap)
        usage = normalize_usage(raw, cap.input_format)

        finish_reason = "stop"
        try:
            finish_reason = raw.choices[0].finish_reason or "stop"
        except (AttributeError, IndexError):
            pass

        logger.debug("OpenAI generation complete", model=self.model_name, prompt_len=len(prompt))

        return LLMResponse(
            content=content,
            model=self.model_name,
            finish_reason=finish_reason,
            usage=usage,
            raw_response=raw,
        )

    async def generate_with_history(
        self,
        messages: list[dict[str, str]],
        config: LLMConfig | None = None,
    ) -> LLMResponse:
        from openai import AsyncOpenAI
        from src.agents.model_registry import get_capability
        from src.agents.response_normalizer import extract_content_with_cap, normalize_usage

        config = config or LLMConfig()
        cap = get_capability("openai", self.model_name)

        # Convert system messages for models that don't support the system role
        adapted: list[dict[str, str]] = []
        for msg in messages:
            if msg["role"] == "system" and cap.system_prompt_as_user_turn:
                adapted.append({"role": "user", "content": f"[Instructions]\n{msg['content']}"})
            else:
                adapted.append(msg)

        payload: dict[str, Any] = {"model": self.model_name, "messages": adapted}
        if cap.supports_temperature:
            payload["temperature"] = config.temperature
        if cap.supports_top_p:
            payload["top_p"] = config.top_p
        if config.max_tokens:
            payload["max_tokens"] = config.max_tokens

        client = AsyncOpenAI(api_key=self.api_key)
        raw = await client.chat.completions.create(**payload)

        content = extract_content_with_cap(raw, cap)
        usage = normalize_usage(raw, cap.input_format)

        return LLMResponse(
            content=content,
            model=self.model_name,
            finish_reason="stop",
            usage=usage,
            raw_response=raw,
        )


# ---------------------------------------------------------------------------
# OllamaClient
# ---------------------------------------------------------------------------

class OllamaClient(LLMClient):
    """
    Ollama / LM Studio LLM client (httpx).

    Auto-detects whether the server exposes an OpenAI-compatible API
    (/v1/models) or the Ollama native API (/api/tags).
    """

    def __init__(
        self,
        url: str | None = None,
        model: str | None = None,
        wire_format: str | None = None,
        **kwargs: Any,
    ):
        self.url = (url or settings.ollama_url).rstrip("/")
        self.model_name = model or settings.ollama_model
        # LLM-03: wire_format can be persisted per tenant ("ollama" | "openai").
        # When provided it skips the auto-detection probe on first call.
        self._api_format: str | None = wire_format if wire_format in ("ollama", "openai") else None
        logger.info(
            "Ollama client initialised",
            url=self.url,
            model=self.model_name,
            wire_format=self._api_format or "auto-detect",
        )

    async def _detect_api_format(self, client) -> str:
        """
        Probe the server to detect API format.
        Prefers OpenAI-compat (/v1/models) and falls back to native (/api/tags).
        """
        try:
            r = await client.get(f"{self.url}/v1/models", timeout=5.0)
            if r.status_code == 200:
                logger.info("Detected OpenAI-compatible API", url=self.url)
                return "openai"
        except Exception:
            pass
        try:
            r = await client.get(f"{self.url}/api/tags", timeout=5.0)
            if r.status_code == 200:
                logger.info("Detected Ollama native API", url=self.url)
                return "ollama"
        except Exception:
            pass
        logger.warning("Could not detect Ollama API format — defaulting to openai-compat", url=self.url)
        return "openai"

    async def generate(
        self,
        prompt: str,
        system_prompt: str | None = None,
        config: LLMConfig | None = None,
    ) -> LLMResponse:
        import httpx
        from src.agents.response_normalizer import normalize_usage

        config = config or LLMConfig()

        async with httpx.AsyncClient(timeout=120.0) as client:
            if self._api_format is None:
                self._api_format = await self._detect_api_format(client)

            if self._api_format == "ollama":
                payload: dict[str, Any] = {
                    "model": self.model_name,
                    "prompt": prompt,
                    "stream": False,
                    "options": {
                        "temperature": config.temperature,
                        "num_predict": config.max_tokens,
                        "top_p": config.top_p,
                    },
                }
                if system_prompt:
                    payload["system"] = system_prompt
                if config.stop_sequences:
                    payload["options"]["stop"] = config.stop_sequences

                logger.debug("Using Ollama native API", url=self.url)
                response = await client.post(f"{self.url}/api/generate", json=payload)
                response.raise_for_status()
                data = response.json()

                return LLMResponse(
                    content=data.get("response", ""),
                    model=self.model_name,
                    finish_reason="stop" if data.get("done") else "length",
                    usage=normalize_usage(data, "ollama_native"),
                    raw_response=data,
                )

            else:  # openai-compat
                messages: list[dict[str, str]] = []
                if system_prompt:
                    messages.append({"role": "system", "content": system_prompt})
                messages.append({"role": "user", "content": prompt})

                payload = {
                    "model": self.model_name,
                    "messages": messages,
                    "stream": False,
                    "temperature": config.temperature,
                    "max_tokens": config.max_tokens,
                    "top_p": config.top_p,
                }
                logger.debug("Using OpenAI-compatible API", url=self.url)
                response = await client.post(f"{self.url}/v1/chat/completions", json=payload)
                response.raise_for_status()
                data = response.json()

                choice = data.get("choices", [{}])[0]
                return LLMResponse(
                    content=choice.get("message", {}).get("content", ""),
                    model=data.get("model", self.model_name),
                    finish_reason=choice.get("finish_reason", "stop"),
                    usage=normalize_usage(data, "ollama_openai"),
                    raw_response=data,
                )

    async def generate_with_history(
        self,
        messages: list[dict[str, str]],
        config: LLMConfig | None = None,
    ) -> LLMResponse:
        import httpx

        config = config or LLMConfig()
        payload: dict[str, Any] = {
            "model": self.model_name,
            "messages": messages,
            "stream": False,
            "options": {
                "temperature": config.temperature,
                "num_predict": config.max_tokens,
                "top_p": config.top_p,
            },
        }

        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(f"{self.url}/api/chat", json=payload)
            response.raise_for_status()
            data = response.json()

        return LLMResponse(
            content=data.get("message", {}).get("content", ""),
            model=self.model_name,
            finish_reason="stop" if data.get("done") else "length",
            raw_response=data,
        )


# ---------------------------------------------------------------------------
# AnthropicClient
# ---------------------------------------------------------------------------

class AnthropicClient(LLMClient):
    """
    Anthropic Claude LLM client (anthropic SDK — AsyncAnthropic).

    Key differences from OpenAI wire format:
      • system prompt is a top-level `system` parameter, not a message role
      • response is anthropic.types.Message; content is a list of blocks
      • stop_reason "end_turn" maps to finish_reason "stop"
    """

    def __init__(
        self,
        api_key: str | None = None,
        model: str | None = None,
        **kwargs: Any,
    ):
        self.api_key = api_key or settings.anthropic_api_key
        self.model_name = model or settings.anthropic_model

        if not self.api_key:
            raise ValueError("Anthropic API key not configured")

        self._client = None
        self._init_client()

    def _init_client(self) -> None:
        import anthropic
        self._client = anthropic.AsyncAnthropic(api_key=self.api_key)
        logger.info("Anthropic client initialised", model=self.model_name)

    async def generate(
        self,
        prompt: str,
        system_prompt: str | None = None,
        config: LLMConfig | None = None,
    ) -> LLMResponse:
        config = config or LLMConfig()

        payload: dict[str, Any] = {
            "model": self.model_name,
            "max_tokens": config.max_tokens,
            "messages": [{"role": "user", "content": prompt}],
        }
        if system_prompt:
            payload["system"] = system_prompt
        if config.stop_sequences:
            payload["stop_sequences"] = config.stop_sequences
        # Anthropic supports temperature; top_p is also supported but rarely needed
        payload["temperature"] = config.temperature

        raw = await _llm_call_with_retry(
            lambda: self._client.messages.create(**payload)
        )

        content = self._extract_content(raw)
        finish_reason = "stop" if raw.stop_reason in ("end_turn", "stop_sequence") else raw.stop_reason or "stop"
        usage = {
            "prompt_tokens": raw.usage.input_tokens,
            "completion_tokens": raw.usage.output_tokens,
        }

        logger.debug("Anthropic generation complete", model=self.model_name, prompt_len=len(prompt))

        return LLMResponse(
            content=content,
            model=self.model_name,
            finish_reason=finish_reason,
            usage=usage,
            raw_response=raw,
        )

    async def generate_with_history(
        self,
        messages: list[dict[str, str]],
        config: LLMConfig | None = None,
    ) -> LLMResponse:
        config = config or LLMConfig()

        # Anthropic requires system as a top-level param, not a message role
        system: str | None = None
        conversation: list[dict[str, str]] = []
        for msg in messages:
            if msg["role"] == "system":
                system = msg["content"]
            else:
                conversation.append(msg)

        payload: dict[str, Any] = {
            "model": self.model_name,
            "max_tokens": config.max_tokens,
            "messages": conversation,
            "temperature": config.temperature,
        }
        if system:
            payload["system"] = system

        raw = await _llm_call_with_retry(
            lambda: self._client.messages.create(**payload)
        )

        content = self._extract_content(raw)
        finish_reason = "stop" if raw.stop_reason in ("end_turn", "stop_sequence") else raw.stop_reason or "stop"
        usage = {
            "prompt_tokens": raw.usage.input_tokens,
            "completion_tokens": raw.usage.output_tokens,
        }

        return LLMResponse(
            content=content,
            model=self.model_name,
            finish_reason=finish_reason,
            usage=usage,
            raw_response=raw,
        )

    @staticmethod
    def _extract_content(raw) -> str:
        """Extract plain text from an anthropic.types.Message response."""
        parts = []
        for block in raw.content:
            if getattr(block, "type", None) == "text":
                parts.append(block.text)
        return "\n".join(parts)


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------

def create_llm_client(
    provider: LLMProvider | None = None,
    **kwargs: Any,
) -> LLMClient:
    """
    Create an LLM client for the given provider.

    Args:
        provider: Explicit provider; falls back to settings.llm_provider.
        **kwargs: Forwarded to the client constructor (api_key, model, url…).

    Returns:
        Configured LLMClient instance.

    Raises:
        ValueError: If the provider is not supported.
    """
    provider = provider or LLMProvider(settings.llm_provider)
    logger.info("Creating LLM client", provider=provider.value)

    if provider == LLMProvider.GEMINI:
        return GeminiClient(**kwargs)
    elif provider == LLMProvider.OPENAI:
        return OpenAIClient(**kwargs)
    elif provider == LLMProvider.ANTHROPIC:
        return AnthropicClient(**kwargs)
    elif provider == LLMProvider.OLLAMA:
        return OllamaClient(**kwargs)
    else:
        raise ValueError(f"Unsupported LLM provider: {provider}")
