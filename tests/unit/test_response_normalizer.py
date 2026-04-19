"""
LLM-10: Unit tests for the unified response normalizer.

Coverage:
1. adapt_prompts — system prompt injection for user-turn-only models
2. extract_content — Gemini standard, thinking, Gemma
3. extract_content — OpenAI (object + dict)
4. extract_content — Ollama native + openai-compat
5. normalize_usage — all four input formats
6. normalize_usage — None / missing fields coerced to 0
7. normalize_usage — never raises on malformed input
"""

from unittest.mock import MagicMock

from src.agents.model_registry import ModelCapability
from src.agents.response_normalizer import (
    adapt_prompts,
    adapt_prompts_with_cap,
    extract_content,
    extract_content_with_cap,
    normalize_usage,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _gemini_response(texts: list[str], thought_flags: list[bool] | None = None) -> MagicMock:
    """Build a mock Gemini GenerateContentResponse."""
    parts = []
    for i, text in enumerate(texts):
        p = MagicMock()
        p.text = text
        p.thought = thought_flags[i] if thought_flags else False
        parts.append(p)
    content = MagicMock()
    content.parts = parts
    candidate = MagicMock()
    candidate.content = content
    raw = MagicMock()
    raw.candidates = [candidate]
    um = MagicMock()
    um.prompt_token_count = 100
    um.candidates_token_count = 50
    raw.usage_metadata = um
    return raw


def _cap(**overrides) -> ModelCapability:
    """Build a ModelCapability with given overrides from defaults."""
    defaults = dict(
        supports_system_prompt=True,
        system_prompt_as_user_turn=False,
        supports_temperature=True,
        supports_top_p=True,
        is_thinking_model=False,
        input_format="openai_chat",
        max_context_tokens=8_192,
        capability_hint="standard",
    )
    defaults.update(overrides)
    return ModelCapability(**defaults)


# ---------------------------------------------------------------------------
# adapt_prompts
# ---------------------------------------------------------------------------


class TestAdaptPrompts:
    def test_standard_model_leaves_prompts_unchanged(self):
        sys, usr = adapt_prompts_with_cap("Be concise.", "Analyze this.", _cap())
        assert sys == "Be concise."
        assert usr == "Analyze this."

    def test_user_turn_model_injects_system_into_user(self):
        cap = _cap(supports_system_prompt=False, system_prompt_as_user_turn=True)
        sys, usr = adapt_prompts_with_cap("Be concise.", "Analyze this.", cap)
        assert sys is None
        assert "Be concise." in usr
        assert "Analyze this." in usr

    def test_user_turn_model_no_system_prompt_unchanged(self):
        cap = _cap(supports_system_prompt=False, system_prompt_as_user_turn=True)
        sys, usr = adapt_prompts_with_cap(None, "Analyze this.", cap)
        assert sys is None
        assert usr == "Analyze this."

    def test_adapt_prompts_dispatcher_gemma(self):
        # Gemma: system_prompt_as_user_turn=True
        sys, usr = adapt_prompts("Strict mode.", "Do X.", "gemini", "gemma-3-27b-it")
        assert sys is None
        assert "Strict mode." in usr

    def test_adapt_prompts_dispatcher_o1(self):
        sys, usr = adapt_prompts("Instructions.", "Do Y.", "openai", "o1")
        assert sys is None
        assert "Instructions." in usr

    def test_adapt_prompts_dispatcher_gpt4o_unchanged(self):
        sys, usr = adapt_prompts("Instructions.", "Do Z.", "openai", "gpt-4o")
        assert sys == "Instructions."
        assert usr == "Do Z."


# ---------------------------------------------------------------------------
# extract_content — Gemini
# ---------------------------------------------------------------------------


class TestExtractContentGemini:
    def test_standard_gemini_returns_text(self):
        raw = _gemini_response(["Hello world"])
        cap = _cap(input_format="gemini_generate", is_thinking_model=False)
        assert extract_content_with_cap(raw, cap) == "Hello world"

    def test_standard_gemini_concatenates_parts(self):
        raw = _gemini_response(["Part one. ", "Part two."])
        cap = _cap(input_format="gemini_generate")
        assert extract_content_with_cap(raw, cap) == "Part one. Part two."

    def test_thinking_model_returns_only_answer_parts(self):
        raw = _gemini_response(
            texts=["<internal reasoning>", "Final answer."],
            thought_flags=[True, False],
        )
        cap = _cap(input_format="gemini_generate", is_thinking_model=True)
        result = extract_content_with_cap(raw, cap)
        assert result == "Final answer."
        assert "<internal reasoning>" not in result

    def test_thinking_model_all_thought_parts_fallback(self):
        """If every part is a thought part, return all (old API without thought attr)."""
        raw = _gemini_response(
            texts=["Thought 1", "Thought 2"],
            thought_flags=[True, True],
        )
        cap = _cap(input_format="gemini_generate", is_thinking_model=True)
        result = extract_content_with_cap(raw, cap)
        assert "Thought 1" in result
        assert "Thought 2" in result

    def test_empty_candidates_returns_empty_string(self):
        raw = MagicMock()
        raw.candidates = []
        cap = _cap(input_format="gemini_generate")
        assert extract_content_with_cap(raw, cap) == ""

    def test_no_candidates_attr_returns_empty_string(self):
        raw = object()
        cap = _cap(input_format="gemini_generate")
        assert extract_content_with_cap(raw, cap) == ""

    def test_via_dispatcher_gemini_flash(self):
        raw = _gemini_response(["Analysis result."])
        result = extract_content(raw, "gemini", "gemini-2.0-flash")
        assert result == "Analysis result."

    def test_via_dispatcher_thinking_exp(self):
        raw = _gemini_response(
            texts=["[thinking]", "Answer here."],
            thought_flags=[True, False],
        )
        result = extract_content(raw, "gemini", "gemini-2.0-flash-thinking-exp")
        assert result == "Answer here."


# ---------------------------------------------------------------------------
# extract_content — OpenAI
# ---------------------------------------------------------------------------


class TestExtractContentOpenAI:
    def _openai_response_obj(self, content: str) -> MagicMock:
        msg = MagicMock()
        msg.content = content
        choice = MagicMock()
        choice.message = msg
        raw = MagicMock()
        raw.choices = [choice]
        return raw

    def _openai_response_dict(self, content: str) -> dict:
        return {"choices": [{"message": {"content": content}}]}

    def test_openai_object_response(self):
        raw = self._openai_response_obj("Generated text.")
        cap = _cap(input_format="openai_chat")
        assert extract_content_with_cap(raw, cap) == "Generated text."

    def test_openai_dict_response(self):
        raw = self._openai_response_dict("Generated text.")
        cap = _cap(input_format="openai_chat")
        assert extract_content_with_cap(raw, cap) == "Generated text."

    def test_openai_empty_choices(self):
        raw = {"choices": []}
        cap = _cap(input_format="openai_chat")
        assert extract_content_with_cap(raw, cap) == ""

    def test_openai_missing_choices_key(self):
        raw = {}
        cap = _cap(input_format="openai_chat")
        assert extract_content_with_cap(raw, cap) == ""

    def test_ollama_openai_compat_format(self):
        raw = self._openai_response_dict("Ollama answer.")
        cap = _cap(input_format="ollama_openai")
        assert extract_content_with_cap(raw, cap) == "Ollama answer."

    def test_via_dispatcher_gpt4o(self):
        raw = self._openai_response_obj("GPT-4o answer.")
        result = extract_content(raw, "openai", "gpt-4o")
        assert result == "GPT-4o answer."

    def test_via_dispatcher_o1(self):
        raw = self._openai_response_obj("Reasoned answer.")
        result = extract_content(raw, "openai", "o1")
        assert result == "Reasoned answer."


# ---------------------------------------------------------------------------
# extract_content — Ollama native
# ---------------------------------------------------------------------------


class TestExtractContentOllamaNative:
    def test_ollama_native_response_field(self):
        raw = {"response": "Llama answer.", "done": True}
        cap = _cap(input_format="ollama_native")
        assert extract_content_with_cap(raw, cap) == "Llama answer."

    def test_ollama_native_missing_response_key(self):
        raw = {"done": True}
        cap = _cap(input_format="ollama_native")
        assert extract_content_with_cap(raw, cap) == ""

    def test_ollama_native_non_dict_returns_empty(self):
        cap = _cap(input_format="ollama_native")
        assert extract_content_with_cap("not a dict", cap) == ""


# ---------------------------------------------------------------------------
# normalize_usage
# ---------------------------------------------------------------------------


class TestNormalizeUsage:
    # ── Gemini ────────────────────────────────────────────────────────────────
    def _gemini_raw(self, pt: int | None, ct: int | None, cached: int = 0) -> MagicMock:
        um = MagicMock()
        um.prompt_token_count = pt
        um.candidates_token_count = ct
        um.cached_content_token_count = cached
        raw = MagicMock()
        raw.usage_metadata = um
        return raw

    def test_gemini_normal_usage(self):
        raw = self._gemini_raw(200, 100)
        u = normalize_usage(raw, "gemini_generate")
        assert u == {"prompt_tokens": 200, "completion_tokens": 100, "cache_read_tokens": 0}

    def test_gemini_none_counts_coerced_to_zero(self):
        raw = self._gemini_raw(None, None)
        u = normalize_usage(raw, "gemini_generate")
        assert u == {"prompt_tokens": 0, "completion_tokens": 0, "cache_read_tokens": 0}

    def test_gemini_no_usage_metadata(self):
        raw = MagicMock()
        raw.usage_metadata = None
        u = normalize_usage(raw, "gemini_generate")
        assert u == {"prompt_tokens": 0, "completion_tokens": 0, "cache_read_tokens": 0}

    def test_gemini_cached_content_tokens(self):
        """EPIC-04-02/03: cached_content_token_count surfaced when Gemini Context Cache is active."""
        raw = self._gemini_raw(500, 80, cached=120)
        u = normalize_usage(raw, "gemini_generate")
        assert u["cache_read_tokens"] == 120

    # ── OpenAI (object) ──────────────────────────────────────────────────────
    def _openai_raw_obj(self, pt: int, ct: int, cached: int = 0) -> MagicMock:
        usage = MagicMock()
        usage.prompt_tokens = pt
        usage.completion_tokens = ct
        if cached:
            details = MagicMock()
            details.cached_tokens = cached
            usage.prompt_tokens_details = details
        else:
            usage.prompt_tokens_details = None
        raw = MagicMock()
        raw.usage = usage
        return raw

    def test_openai_object_usage(self):
        raw = self._openai_raw_obj(300, 150)
        u = normalize_usage(raw, "openai_chat")
        assert u == {"prompt_tokens": 300, "completion_tokens": 150, "cache_read_tokens": 0}

    def test_openai_object_with_cached_tokens(self):
        """EPIC-04-02/03: OpenAI automatic prompt caching — cached_tokens in prompt_tokens_details."""
        raw = self._openai_raw_obj(1024, 200, cached=512)
        u = normalize_usage(raw, "openai_chat")
        assert u["cache_read_tokens"] == 512
        assert u["prompt_tokens"] == 1024

    # ── OpenAI (dict) ────────────────────────────────────────────────────────
    def test_openai_dict_usage(self):
        raw = {"usage": {"prompt_tokens": 400, "completion_tokens": 200}}
        u = normalize_usage(raw, "openai_chat")
        assert u == {"prompt_tokens": 400, "completion_tokens": 200, "cache_read_tokens": 0}

    def test_openai_dict_with_cached_tokens(self):
        """EPIC-04-02/03: OpenAI dict response with prompt_tokens_details.cached_tokens."""
        raw = {
            "usage": {
                "prompt_tokens": 800,
                "completion_tokens": 100,
                "prompt_tokens_details": {"cached_tokens": 400},
            }
        }
        u = normalize_usage(raw, "openai_chat")
        assert u["cache_read_tokens"] == 400

    def test_openai_dict_missing_usage_key(self):
        raw = {}
        u = normalize_usage(raw, "openai_chat")
        assert u == {"prompt_tokens": 0, "completion_tokens": 0, "cache_read_tokens": 0}

    # ── Ollama native ────────────────────────────────────────────────────────
    def test_ollama_native_usage(self):
        raw = {"prompt_eval_count": 50, "eval_count": 80}
        u = normalize_usage(raw, "ollama_native")
        assert u == {"prompt_tokens": 50, "completion_tokens": 80}

    def test_ollama_native_missing_counts(self):
        raw = {}
        u = normalize_usage(raw, "ollama_native")
        assert u == {"prompt_tokens": 0, "completion_tokens": 0}

    # ── Ollama OpenAI-compat ─────────────────────────────────────────────────
    def test_ollama_openai_usage(self):
        raw = {"usage": {"prompt_tokens": 60, "completion_tokens": 90}}
        u = normalize_usage(raw, "ollama_openai")
        assert u == {"prompt_tokens": 60, "completion_tokens": 90, "cache_read_tokens": 0}

    # ── Unknown format ───────────────────────────────────────────────────────
    def test_unknown_format_returns_zeros(self):
        u = normalize_usage({}, "totally_unknown_format")
        assert u == {"prompt_tokens": 0, "completion_tokens": 0}

    # ── Robustness ───────────────────────────────────────────────────────────
    def test_never_raises_on_garbage_input(self):
        """normalize_usage must never raise regardless of input."""
        for fmt in ("gemini_generate", "openai_chat", "ollama_native", "ollama_openai"):
            result = normalize_usage(None, fmt)
            assert isinstance(result, dict)
            result = normalize_usage("not a response", fmt)
            assert isinstance(result, dict)
            result = normalize_usage(42, fmt)
            assert isinstance(result, dict)

    def test_output_always_has_canonical_keys(self):
        for fmt in ("gemini_generate", "openai_chat", "ollama_native", "ollama_openai"):
            u = normalize_usage({}, fmt)
            assert "prompt_tokens" in u
            assert "completion_tokens" in u
            assert isinstance(u["prompt_tokens"], int)
            assert isinstance(u["completion_tokens"], int)
