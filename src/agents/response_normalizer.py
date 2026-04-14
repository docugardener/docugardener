# SPDX-License-Identifier: AGPL-3.0-or-later
"""
LLM-10: Unified response normalizer for LLM providers.

Every LLMClient.generate() call passes raw API responses through this module
so that per-model quirks live in one place:

  • Content extraction  — handles Gemini thinking-exp (strips thought parts),
                          Gemma/o1 (plain text), standard Gemini/OpenAI.
  • Usage normalization — maps provider-specific token field names to the
                          canonical {"prompt_tokens": int, "completion_tokens": int}.
  • System prompt adaptation — rewrites calls for models that reject a system
                                role (Gemma, o1/o3) by injecting into user turn.

All functions are pure / side-effect-free and testable without network access.
"""

from __future__ import annotations

from typing import Any

from src.agents.model_registry import ModelCapability, get_capability


# ---------------------------------------------------------------------------
# System prompt adaptation
# ---------------------------------------------------------------------------

def adapt_prompts(
    system_prompt: str | None,
    user_prompt: str,
    provider: str,
    model: str,
) -> tuple[str | None, str]:
    """
    Adapt (system_prompt, user_prompt) for models that cannot accept a system role.

    Returns (adapted_system, adapted_user).

    If the model requires system_prompt_as_user_turn the system content is
    prepended to the user message and adapted_system is returned as None so
    callers do not accidentally re-add it.
    """
    cap = get_capability(provider, model)
    return adapt_prompts_with_cap(system_prompt, user_prompt, cap)


def adapt_prompts_with_cap(
    system_prompt: str | None,
    user_prompt: str,
    cap: ModelCapability,
) -> tuple[str | None, str]:
    """Same as adapt_prompts but accepts a pre-resolved ModelCapability."""
    if system_prompt and cap.system_prompt_as_user_turn:
        injected = f"[Instructions]\n{system_prompt}\n\n[Task]\n{user_prompt}"
        return None, injected
    return system_prompt, user_prompt


# ---------------------------------------------------------------------------
# Content extraction
# ---------------------------------------------------------------------------

def extract_content(
    raw: Any,
    provider: str,
    model: str,
) -> str:
    """
    Extract the answer text from a raw API response object.

    Delegates to the provider-specific extractor determined by the model
    registry.  For thinking models only the non-thought parts are returned.
    """
    cap = get_capability(provider, model)
    return extract_content_with_cap(raw, cap)


def extract_content_with_cap(raw: Any, cap: ModelCapability) -> str:
    """Same as extract_content but accepts a pre-resolved ModelCapability."""
    fmt = cap.input_format

    if fmt == "gemini_generate":
        return _extract_gemini(raw, cap)
    elif fmt in ("openai_chat", "ollama_openai"):
        return _extract_openai_compat(raw)
    elif fmt == "ollama_native":
        return raw.get("response", "") if isinstance(raw, dict) else ""
    return ""


def _extract_gemini(raw: Any, cap: ModelCapability) -> str:
    """Extract text from a google-generativeai GenerateContentResponse."""
    if not hasattr(raw, "candidates") or not raw.candidates:
        return ""

    candidate = raw.candidates[0]
    if not hasattr(candidate, "content") or not candidate.content:
        return ""

    parts = getattr(candidate.content, "parts", [])
    if not parts:
        return ""

    if cap.is_thinking_model:
        # Thinking-exp models emit parts with thought=True (internal chain of
        # thought) and thought=False (the actual answer).  Return only answer.
        answer_parts = [
            p.text
            for p in parts
            if hasattr(p, "text") and not getattr(p, "thought", False)
        ]
        if answer_parts:
            return "".join(answer_parts)
        # Fallback: if all parts are thought parts, return everything
        # (older API versions may not set the thought attribute).

    return "".join(p.text for p in parts if hasattr(p, "text"))


def _extract_openai_compat(raw: Any) -> str:
    """Extract text from an OpenAI-compatible response (object or dict)."""
    if isinstance(raw, dict):
        choices = raw.get("choices", [])
        if not choices:
            return ""
        return choices[0].get("message", {}).get("content", "") or ""
    try:
        return raw.choices[0].message.content or ""
    except (AttributeError, IndexError):
        return ""


# ---------------------------------------------------------------------------
# Usage normalization
# ---------------------------------------------------------------------------

def normalize_usage(raw: Any, input_format: str) -> dict[str, int]:
    """
    Normalize token usage to the canonical shape:
        {"prompt_tokens": int, "completion_tokens": int}

    Handles all provider-specific field names:
      gemini_generate  → usage_metadata.{prompt_token_count, candidates_token_count}
      openai_chat      → usage.{prompt_tokens, completion_tokens}
      ollama_native    → {prompt_eval_count, eval_count}
      ollama_openai    → usage.{prompt_tokens, completion_tokens}

    Missing or None counts are coerced to 0 — never raises.
    """
    try:
        if input_format == "gemini_generate":
            return _usage_gemini(raw)
        elif input_format in ("openai_chat", "ollama_openai"):
            return _usage_openai_compat(raw)
        elif input_format == "ollama_native":
            return _usage_ollama_native(raw)
    except Exception:
        pass  # Never let usage extraction crash a generation call
    return {"prompt_tokens": 0, "completion_tokens": 0}


def _usage_gemini(raw: Any) -> dict[str, int]:
    um = getattr(raw, "usage_metadata", None)
    if um is None:
        return {"prompt_tokens": 0, "completion_tokens": 0}
    return {
        "prompt_tokens": getattr(um, "prompt_token_count", 0) or 0,
        "completion_tokens": getattr(um, "candidates_token_count", 0) or 0,
    }


def _usage_openai_compat(raw: Any) -> dict[str, int]:
    if isinstance(raw, dict):
        u = raw.get("usage") or {}
        pt = u.get("prompt_tokens", 0) or 0
        ct = u.get("completion_tokens", 0) or 0
    else:
        u = getattr(raw, "usage", None)
        if u is None:
            return {"prompt_tokens": 0, "completion_tokens": 0}
        pt = getattr(u, "prompt_tokens", 0) or 0
        ct = getattr(u, "completion_tokens", 0) or 0
    return {"prompt_tokens": pt, "completion_tokens": ct}


def _usage_ollama_native(raw: Any) -> dict[str, int]:
    if not isinstance(raw, dict):
        return {"prompt_tokens": 0, "completion_tokens": 0}
    return {
        "prompt_tokens": raw.get("prompt_eval_count", 0) or 0,
        "completion_tokens": raw.get("eval_count", 0) or 0,
    }
