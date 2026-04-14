# SPDX-License-Identifier: AGPL-3.0-or-later
"""
LLM-07: Model Capability Registry.

Every (provider, model_id) pair maps to a ModelCapability that describes:
  - Whether the model accepts a system prompt natively or needs injection
  - Whether temperature / top_p are supported (o1/o3 series: no)
  - Whether the model emits a thought block before the answer
  - The wire-format used to call the model
  - UI metadata (capability_hint, context window)

Call get_capability(provider, model_id) from any LLM client.
Unknown models fall back to DEFAULT_CAPABILITY with a warning log so
the system keeps working while the registry catches up.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from src.core.logging import get_logger

logger = get_logger(__name__)

CapabilityHint = Literal["standard", "oss", "reasoning", "thinking"]
InputFormat = Literal["gemini_generate", "openai_chat", "ollama_native", "ollama_openai"]


@dataclass(frozen=True)
class ModelCapability:
    """Capability profile for a specific LLM model."""

    # ── System prompt ────────────────────────────────────────────────────────
    supports_system_prompt: bool = True
    """Model natively accepts system_instruction / system role."""

    system_prompt_as_user_turn: bool = False
    """
    If True, the system content must be prepended to the first user message.
    Always implies supports_system_prompt=False.
    """

    # ── Generation parameters ────────────────────────────────────────────────
    supports_temperature: bool = True
    supports_top_p: bool = True

    # ── Output structure ─────────────────────────────────────────────────────
    is_thinking_model: bool = False
    """
    True when the model emits an internal reasoning/thought block alongside
    the answer (Gemini thinking-exp, o1/o3).  The normalizer strips the
    thought parts and returns only the answer.
    """

    # ── Wire format ──────────────────────────────────────────────────────────
    input_format: InputFormat = "openai_chat"
    """Which API format this model expects."""

    # ── Metadata ─────────────────────────────────────────────────────────────
    max_context_tokens: int = 8_192
    capability_hint: CapabilityHint = "standard"
    note: str = ""


# Safe, conservative default for any model not yet in the registry.
DEFAULT_CAPABILITY = ModelCapability()

# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------
MODEL_REGISTRY: dict[tuple[str, str], ModelCapability] = {

    # ── Google Gemini (standard) ─────────────────────────────────────────────
    ("gemini", "gemini-2.0-flash"): ModelCapability(
        input_format="gemini_generate",
        max_context_tokens=1_048_576,
        capability_hint="standard",
    ),
    # ── Gemini 2.5 series ────────────────────────────────────────────────────
    ("gemini", "gemini-2.5-flash"): ModelCapability(
        input_format="gemini_generate",
        max_context_tokens=1_048_576,
        supports_temperature=False,
        supports_top_p=False,
        capability_hint="reasoning",
        note="Hybrid reasoning model; answer-only parts returned (thinking budget managed by API).",
    ),
    ("gemini", "gemini-2.5-flash-lite"): ModelCapability(
        input_format="gemini_generate",
        max_context_tokens=1_048_576,
        capability_hint="standard",
    ),
    ("gemini", "gemini-2.5-pro"): ModelCapability(
        input_format="gemini_generate",
        max_context_tokens=2_097_152,
        supports_temperature=False,
        supports_top_p=False,
        capability_hint="reasoning",
    ),
    ("gemini", "gemini-2.0-flash-lite"): ModelCapability(
        input_format="gemini_generate",
        max_context_tokens=1_048_576,
        capability_hint="standard",
    ),
    ("gemini", "gemini-1.5-pro"): ModelCapability(
        input_format="gemini_generate",
        max_context_tokens=2_097_152,
        capability_hint="standard",
    ),
    ("gemini", "gemini-1.5-flash"): ModelCapability(
        input_format="gemini_generate",
        max_context_tokens=1_048_576,
        capability_hint="standard",
    ),
    ("gemini", "gemini-1.5-flash-8b"): ModelCapability(
        input_format="gemini_generate",
        max_context_tokens=1_048_576,
        capability_hint="standard",
    ),

    # ── Google Gemini (thinking / reasoning) ─────────────────────────────────
    ("gemini", "gemini-2.0-flash-thinking-exp"): ModelCapability(
        input_format="gemini_generate",
        is_thinking_model=True,
        max_context_tokens=1_048_576,
        capability_hint="thinking",
        note="Emits thought parts alongside the answer; answer is extracted from non-thought parts.",
    ),
    ("gemini", "gemini-2.0-flash-thinking-exp-01-21"): ModelCapability(
        input_format="gemini_generate",
        is_thinking_model=True,
        max_context_tokens=1_048_576,
        capability_hint="thinking",
        note="Emits thought parts alongside the answer; answer is extracted from non-thought parts.",
    ),

    # ── Gemma via Google AI Studio (OSS, no system_instruction support) ──────
    # Gemma models are served through the Gemini SDK but do not accept
    # system_instruction in the constructor — content must be injected as
    # the first user turn.
    ("gemini", "gemma-3-27b-it"): ModelCapability(
        input_format="gemini_generate",
        supports_system_prompt=False,
        system_prompt_as_user_turn=True,
        max_context_tokens=8_192,
        capability_hint="oss",
        note="No system_instruction support; system content injected as first user turn.",
    ),
    ("gemini", "gemma-3-12b-it"): ModelCapability(
        input_format="gemini_generate",
        supports_system_prompt=False,
        system_prompt_as_user_turn=True,
        max_context_tokens=8_192,
        capability_hint="oss",
    ),
    ("gemini", "gemma-3-4b-it"): ModelCapability(
        input_format="gemini_generate",
        supports_system_prompt=False,
        system_prompt_as_user_turn=True,
        max_context_tokens=8_192,
        capability_hint="oss",
    ),
    ("gemini", "gemma-3-1b-it"): ModelCapability(
        input_format="gemini_generate",
        supports_system_prompt=False,
        system_prompt_as_user_turn=True,
        max_context_tokens=8_192,
        capability_hint="oss",
    ),

    # ── OpenAI (standard chat) ───────────────────────────────────────────────
    ("openai", "gpt-4o"): ModelCapability(
        input_format="openai_chat",
        max_context_tokens=128_000,
        capability_hint="standard",
    ),
    ("openai", "gpt-4o-mini"): ModelCapability(
        input_format="openai_chat",
        max_context_tokens=128_000,
        capability_hint="standard",
    ),
    ("openai", "gpt-4-turbo"): ModelCapability(
        input_format="openai_chat",
        max_context_tokens=128_000,
        capability_hint="standard",
    ),
    ("openai", "gpt-4"): ModelCapability(
        input_format="openai_chat",
        max_context_tokens=8_192,
        capability_hint="standard",
    ),

    # ── OpenAI (reasoning / o-series) ────────────────────────────────────────
    # o1/o3 do not support: system role, temperature, top_p.
    # Thinking is internal — the API returns plain text, not structured thought parts.
    ("openai", "o1"): ModelCapability(
        input_format="openai_chat",
        supports_system_prompt=False,
        system_prompt_as_user_turn=True,
        supports_temperature=False,
        supports_top_p=False,
        is_thinking_model=True,
        max_context_tokens=200_000,
        capability_hint="reasoning",
        note="No system role; no temperature/top_p; internal chain-of-thought.",
    ),
    ("openai", "o1-mini"): ModelCapability(
        input_format="openai_chat",
        supports_system_prompt=False,
        system_prompt_as_user_turn=True,
        supports_temperature=False,
        supports_top_p=False,
        is_thinking_model=True,
        max_context_tokens=128_000,
        capability_hint="reasoning",
    ),
    ("openai", "o1-preview"): ModelCapability(
        input_format="openai_chat",
        supports_system_prompt=False,
        system_prompt_as_user_turn=True,
        supports_temperature=False,
        supports_top_p=False,
        is_thinking_model=True,
        max_context_tokens=128_000,
        capability_hint="reasoning",
    ),
    ("openai", "o3"): ModelCapability(
        input_format="openai_chat",
        supports_system_prompt=False,
        system_prompt_as_user_turn=True,
        supports_temperature=False,
        supports_top_p=False,
        is_thinking_model=True,
        max_context_tokens=200_000,
        capability_hint="reasoning",
    ),
    ("openai", "o3-mini"): ModelCapability(
        input_format="openai_chat",
        supports_system_prompt=False,
        system_prompt_as_user_turn=True,
        supports_temperature=False,
        supports_top_p=False,
        is_thinking_model=True,
        max_context_tokens=200_000,
        capability_hint="reasoning",
    ),

    # ── Anthropic Claude ─────────────────────────────────────────────────────
    # Claude models use the Anthropic SDK natively; system prompt is a top-level
    # parameter (not a message role), so supports_system_prompt=True.
    ("anthropic", "claude-opus-4-6"): ModelCapability(
        input_format="openai_chat",  # used for capability lookups only; wire format is Anthropic SDK
        max_context_tokens=200_000,
        capability_hint="standard",
        note="Claude Opus 4.6 — highest capability.",
    ),
    ("anthropic", "claude-sonnet-4-6"): ModelCapability(
        input_format="openai_chat",
        max_context_tokens=200_000,
        capability_hint="standard",
        note="Claude Sonnet 4.6 — balanced performance and speed.",
    ),
    ("anthropic", "claude-haiku-4-5-20251001"): ModelCapability(
        input_format="openai_chat",
        max_context_tokens=200_000,
        capability_hint="standard",
        note="Claude Haiku 4.5 — fastest and most compact.",
    ),
}


def get_capability(provider: str, model_id: str) -> ModelCapability:
    """
    Return the capability profile for (provider, model_id).

    Falls back to DEFAULT_CAPABILITY for any unknown pair and logs a warning
    so operators know to register the model.
    """
    cap = MODEL_REGISTRY.get((provider, model_id))
    if cap is None:
        logger.warning(
            "Unknown model — falling back to DEFAULT_CAPABILITY; "
            "add it to model_registry.MODEL_REGISTRY for precise handling",
            provider=provider,
            model=model_id,
        )
        return DEFAULT_CAPABILITY
    return cap
