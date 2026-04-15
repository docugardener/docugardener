"""
LLM-07: Unit tests for Model Capability Registry.

Coverage:
1. Known Gemini models — capabilities verified
2. Known Gemma models — no system prompt, user-turn injection
3. Known OpenAI standard models
4. Known OpenAI reasoning (o1/o3) models — restrictions enforced
5. Unknown models — DEFAULT_CAPABILITY returned, no exception
6. Dataclass immutability (frozen=True)
7. Registry-wide invariant checks
"""

import pytest

from src.agents.model_registry import (
    DEFAULT_CAPABILITY,
    MODEL_REGISTRY,
    ModelCapability,
    get_capability,
)


class TestGeminiStandardModels:
    def test_gemini_flash_capabilities(self):
        cap = get_capability("gemini", "gemini-2.0-flash")
        assert cap.supports_system_prompt is True
        assert cap.system_prompt_as_user_turn is False
        assert cap.supports_temperature is True
        assert cap.supports_top_p is True
        assert cap.is_thinking_model is False
        assert cap.input_format == "gemini_generate"
        assert cap.capability_hint == "standard"
        assert cap.max_context_tokens == 1_048_576

    def test_gemini_15_pro_large_context(self):
        cap = get_capability("gemini", "gemini-1.5-pro")
        assert cap.max_context_tokens == 2_097_152
        assert cap.input_format == "gemini_generate"
        assert cap.capability_hint == "standard"

    def test_gemini_15_flash(self):
        cap = get_capability("gemini", "gemini-1.5-flash")
        assert cap.input_format == "gemini_generate"
        assert cap.supports_system_prompt is True

    def test_gemini_flash_lite(self):
        cap = get_capability("gemini", "gemini-2.0-flash-lite")
        assert cap.input_format == "gemini_generate"
        assert cap.capability_hint == "standard"


class TestGeminiThinkingModels:
    @pytest.mark.parametrize(
        "model_id",
        [
            "gemini-2.0-flash-thinking-exp",
            "gemini-2.0-flash-thinking-exp-01-21",
        ],
    )
    def test_thinking_model_flags(self, model_id: str):
        cap = get_capability("gemini", model_id)
        assert cap.is_thinking_model is True
        assert cap.input_format == "gemini_generate"
        assert cap.capability_hint == "thinking"
        assert cap.max_context_tokens == 1_048_576

    def test_thinking_model_still_supports_system_prompt(self):
        # Gemini thinking-exp supports system_instruction (unlike o1)
        cap = get_capability("gemini", "gemini-2.0-flash-thinking-exp")
        assert cap.supports_system_prompt is True
        assert cap.system_prompt_as_user_turn is False


class TestGemmaModels:
    @pytest.mark.parametrize(
        "model_id",
        [
            "gemma-3-27b-it",
            "gemma-3-12b-it",
            "gemma-3-4b-it",
            "gemma-3-1b-it",
        ],
    )
    def test_gemma_no_system_prompt_support(self, model_id: str):
        cap = get_capability("gemini", model_id)
        assert cap.supports_system_prompt is False, (
            f"{model_id}: expected supports_system_prompt=False"
        )
        assert cap.system_prompt_as_user_turn is True, f"{model_id}: expected user-turn injection"
        assert cap.capability_hint == "oss", f"{model_id}: expected oss hint"
        assert cap.input_format == "gemini_generate", f"{model_id}: must use gemini SDK"

    def test_gemma_context_window(self):
        cap = get_capability("gemini", "gemma-3-27b-it")
        assert cap.max_context_tokens == 8_192


class TestOpenAIStandardModels:
    @pytest.mark.parametrize("model_id", ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"])
    def test_standard_openai_full_support(self, model_id: str):
        cap = get_capability("openai", model_id)
        assert cap.supports_system_prompt is True
        assert cap.system_prompt_as_user_turn is False
        assert cap.supports_temperature is True
        assert cap.supports_top_p is True
        assert cap.is_thinking_model is False
        assert cap.input_format == "openai_chat"
        assert cap.capability_hint == "standard"
        assert cap.max_context_tokens == 128_000

    def test_gpt4_smaller_context(self):
        cap = get_capability("openai", "gpt-4")
        assert cap.max_context_tokens == 8_192
        assert cap.capability_hint == "standard"


class TestOpenAIReasoningModels:
    @pytest.mark.parametrize(
        "model_id",
        [
            "o1",
            "o1-mini",
            "o1-preview",
            "o3",
            "o3-mini",
        ],
    )
    def test_reasoning_model_restrictions(self, model_id: str):
        cap = get_capability("openai", model_id)
        assert cap.supports_system_prompt is False, f"{model_id}: no system role"
        assert cap.system_prompt_as_user_turn is True, f"{model_id}: must inject as user turn"
        assert cap.supports_temperature is False, f"{model_id}: no temperature"
        assert cap.supports_top_p is False, f"{model_id}: no top_p"
        assert cap.is_thinking_model is True, f"{model_id}: is a thinking/reasoning model"
        assert cap.input_format == "openai_chat", f"{model_id}: still uses chat completions"
        assert cap.capability_hint == "reasoning", f"{model_id}: hint should be reasoning"

    def test_o1_context_window(self):
        cap = get_capability("openai", "o1")
        assert cap.max_context_tokens == 200_000

    def test_o1_mini_context_window(self):
        cap = get_capability("openai", "o1-mini")
        assert cap.max_context_tokens == 128_000


class TestUnknownModels:
    def test_unknown_gemini_model_returns_default(self):
        cap = get_capability("gemini", "gemini-99-ultra-hypothetical")
        assert cap is DEFAULT_CAPABILITY

    def test_unknown_openai_model_returns_default(self):
        cap = get_capability("openai", "gpt-99-turbo-ultra")
        assert cap is DEFAULT_CAPABILITY

    def test_unknown_provider_returns_default(self):
        cap = get_capability("anthropic", "claude-3-opus")
        assert cap is DEFAULT_CAPABILITY

    def test_unknown_ollama_model_returns_default(self):
        cap = get_capability("ollama", "custom-finetune-v42")
        assert cap is DEFAULT_CAPABILITY

    def test_empty_strings_return_default(self):
        cap = get_capability("", "")
        assert cap is DEFAULT_CAPABILITY

    def test_unknown_model_does_not_raise(self):
        # Must never raise; system must keep working with unknown models
        cap = get_capability("some-future-provider", "some-future-model")
        assert cap is not None
        assert isinstance(cap, ModelCapability)


class TestModelCapabilityImmutability:
    def test_capability_is_frozen(self):
        cap = get_capability("openai", "gpt-4o")
        with pytest.raises(Exception):  # dataclasses.FrozenInstanceError
            cap.supports_system_prompt = False  # type: ignore[misc]

    def test_default_capability_is_frozen(self):
        with pytest.raises(Exception):
            DEFAULT_CAPABILITY.is_thinking_model = True  # type: ignore[misc]


class TestRegistryInvariants:
    """Structural correctness checks across the entire registry."""

    VALID_INPUT_FORMATS = {"gemini_generate", "openai_chat", "ollama_native", "ollama_openai"}
    VALID_HINTS = {"standard", "oss", "reasoning", "thinking"}

    def test_all_entries_have_valid_input_format(self):
        for key, cap in MODEL_REGISTRY.items():
            assert cap.input_format in self.VALID_INPUT_FORMATS, (
                f"{key}: invalid input_format '{cap.input_format}'"
            )

    def test_all_entries_have_valid_hint(self):
        for key, cap in MODEL_REGISTRY.items():
            assert cap.capability_hint in self.VALID_HINTS, (
                f"{key}: invalid capability_hint '{cap.capability_hint}'"
            )

    def test_user_turn_injection_implies_no_system_support(self):
        """system_prompt_as_user_turn=True must always co-occur with supports_system_prompt=False."""
        for key, cap in MODEL_REGISTRY.items():
            if cap.system_prompt_as_user_turn:
                assert not cap.supports_system_prompt, (
                    f"{key}: system_prompt_as_user_turn=True but supports_system_prompt=True — contradiction"
                )

    def test_reasoning_hint_disables_temperature(self):
        """Every reasoning-hint model must disable temperature."""
        for key, cap in MODEL_REGISTRY.items():
            if cap.capability_hint == "reasoning":
                assert not cap.supports_temperature, (
                    f"{key}: reasoning model must have supports_temperature=False"
                )

    def test_reasoning_hint_disables_top_p(self):
        for key, cap in MODEL_REGISTRY.items():
            if cap.capability_hint == "reasoning":
                assert not cap.supports_top_p, (
                    f"{key}: reasoning model must have supports_top_p=False"
                )

    def test_gemini_models_use_gemini_generate_format(self):
        gemini_entries = {k: v for k, v in MODEL_REGISTRY.items() if k[0] == "gemini"}
        for key, cap in gemini_entries.items():
            assert cap.input_format == "gemini_generate", (
                f"{key}: all gemini-provider models must use gemini_generate format"
            )

    def test_openai_models_use_openai_chat_format(self):
        openai_entries = {k: v for k, v in MODEL_REGISTRY.items() if k[0] == "openai"}
        for key, cap in openai_entries.items():
            assert cap.input_format == "openai_chat", (
                f"{key}: all openai-provider models must use openai_chat format"
            )

    def test_positive_context_windows(self):
        for key, cap in MODEL_REGISTRY.items():
            assert cap.max_context_tokens > 0, f"{key}: context window must be positive"

    def test_registry_not_empty(self):
        assert len(MODEL_REGISTRY) > 0
