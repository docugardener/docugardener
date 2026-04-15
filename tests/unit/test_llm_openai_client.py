"""
LLM-01: Unit tests for OpenAIClient and the updated LLMProvider enum.

Coverage:
1. LLMProvider enum — OPENAI member present
2. create_llm_client — returns OpenAIClient for OPENAI provider
3. OpenAIClient init — raises on missing API key
4. OpenAIClient.generate — standard model (gpt-4o): system role + temperature sent
5. OpenAIClient.generate — reasoning model (o1): system stripped → user turn, no temperature/top_p
6. OpenAIClient.generate — o3-mini same restrictions as o1
7. OpenAIClient.generate — usage normalised correctly
8. OpenAIClient.generate_with_history — system message converted for o1
9. OpenAIClient.generate_with_history — system message kept for gpt-4o
10. GeminiClient now uses normalizer — Gemma injects system as user turn
11. Existing LLMProvider values still present (no regression)
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.agents.llm import (
    GeminiClient,
    LLMClient,
    LLMConfig,
    LLMProvider,
    LLMResponse,
    OpenAIClient,
    create_llm_client,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _openai_raw_response(content: str, pt: int = 100, ct: int = 50) -> MagicMock:
    """Mock openai ChatCompletion response object."""
    msg = MagicMock()
    msg.content = content
    choice = MagicMock()
    choice.message = msg
    choice.finish_reason = "stop"
    usage = MagicMock()
    usage.prompt_tokens = pt
    usage.completion_tokens = ct
    raw = MagicMock()
    raw.choices = [choice]
    raw.usage = usage
    return raw


def _make_openai_client(model: str = "gpt-4o", api_key: str = "sk-test") -> OpenAIClient:
    client = OpenAIClient.__new__(OpenAIClient)
    client.api_key = api_key
    client.model_name = model
    return client


# ---------------------------------------------------------------------------
# LLMProvider enum
# ---------------------------------------------------------------------------


class TestLLMProviderEnum:
    def test_openai_member_exists(self):
        assert LLMProvider.OPENAI.value == "openai"

    def test_gemini_member_unchanged(self):
        assert LLMProvider.GEMINI.value == "gemini"

    def test_ollama_member_unchanged(self):
        assert LLMProvider.OLLAMA.value == "ollama"

    def test_can_construct_from_string(self):
        assert LLMProvider("openai") == LLMProvider.OPENAI

    def test_all_providers_present(self):
        values = {p.value for p in LLMProvider}
        assert values == {"gemini", "openai", "ollama", "anthropic"}


# ---------------------------------------------------------------------------
# create_llm_client factory
# ---------------------------------------------------------------------------


class TestCreateLLMClientFactory:
    def test_openai_provider_returns_openai_client(self):
        with patch("src.agents.llm.settings") as mock_settings:
            mock_settings.openai_api_key = "sk-test"
            mock_settings.openai_model = "gpt-4o"
            client = create_llm_client(provider=LLMProvider.OPENAI)
        assert isinstance(client, OpenAIClient)

    def test_gemini_provider_still_works(self):
        with patch("src.agents.llm.settings") as mock_settings:
            mock_settings.gemini_api_key = "gm-test"
            mock_settings.gemini_model = "gemini-2.0-flash"
            with patch.object(GeminiClient, "_init_client"):
                client = create_llm_client(provider=LLMProvider.GEMINI)
        assert isinstance(client, GeminiClient)

    def test_returns_llm_client_subclass(self):
        with patch("src.agents.llm.settings") as mock_settings:
            mock_settings.openai_api_key = "sk-test"
            mock_settings.openai_model = "gpt-4o"
            client = create_llm_client(provider=LLMProvider.OPENAI)
        assert isinstance(client, LLMClient)


# ---------------------------------------------------------------------------
# OpenAIClient init
# ---------------------------------------------------------------------------


class TestOpenAIClientInit:
    def test_raises_on_missing_api_key(self):
        with patch("src.agents.llm.settings") as mock_settings:
            mock_settings.openai_api_key = None
            mock_settings.openai_model = "gpt-4o"
            with pytest.raises(ValueError, match="API key"):
                OpenAIClient()

    def test_accepts_explicit_api_key(self):
        client = _make_openai_client(api_key="sk-explicit")
        assert client.api_key == "sk-explicit"

    def test_uses_settings_model_as_default(self):
        with patch("src.agents.llm.settings") as mock_settings:
            mock_settings.openai_api_key = "sk-test"
            mock_settings.openai_model = "gpt-4o-mini"
            client = OpenAIClient()
        assert client.model_name == "gpt-4o-mini"


# ---------------------------------------------------------------------------
# OpenAIClient.generate — standard model (gpt-4o)
# ---------------------------------------------------------------------------


class TestOpenAIClientGenerateStandard:
    @pytest.mark.asyncio
    async def test_returns_llm_response(self):
        client = _make_openai_client("gpt-4o")
        raw = _openai_raw_response("Answer text.")

        with patch("openai.AsyncOpenAI") as MockOpenAI:
            MockOpenAI.return_value.chat.completions.create = AsyncMock(return_value=raw)
            result = await client.generate("What is X?")

        assert isinstance(result, LLMResponse)
        assert result.content == "Answer text."
        assert result.model == "gpt-4o"

    @pytest.mark.asyncio
    async def test_system_prompt_sent_as_system_role(self):
        client = _make_openai_client("gpt-4o")
        raw = _openai_raw_response("Answer.")
        captured_payload = {}

        async def capture(**kwargs):
            captured_payload.update(kwargs)
            return raw

        with patch("openai.AsyncOpenAI") as MockOpenAI:
            MockOpenAI.return_value.chat.completions.create = capture
            await client.generate("Do X.", system_prompt="Be strict.")

        messages = captured_payload["messages"]
        roles = [m["role"] for m in messages]
        assert "system" in roles
        system_msg = next(m for m in messages if m["role"] == "system")
        assert "Be strict." in system_msg["content"]

    @pytest.mark.asyncio
    async def test_temperature_sent_for_standard_model(self):
        client = _make_openai_client("gpt-4o")
        raw = _openai_raw_response("Answer.")
        captured_payload = {}

        async def capture(**kwargs):
            captured_payload.update(kwargs)
            return raw

        with patch("openai.AsyncOpenAI") as MockOpenAI:
            MockOpenAI.return_value.chat.completions.create = capture
            await client.generate("Do X.", config=LLMConfig(temperature=0.3))

        assert "temperature" in captured_payload
        assert captured_payload["temperature"] == pytest.approx(0.3)

    @pytest.mark.asyncio
    async def test_usage_normalised(self):
        client = _make_openai_client("gpt-4o")
        raw = _openai_raw_response("Answer.", pt=200, ct=100)

        with patch("openai.AsyncOpenAI") as MockOpenAI:
            MockOpenAI.return_value.chat.completions.create = AsyncMock(return_value=raw)
            result = await client.generate("Do X.")

        assert result.usage == {"prompt_tokens": 200, "completion_tokens": 100}


# ---------------------------------------------------------------------------
# OpenAIClient.generate — reasoning models (o1, o3-mini)
# ---------------------------------------------------------------------------


class TestOpenAIClientGenerateReasoning:
    @pytest.mark.asyncio
    @pytest.mark.parametrize("model", ["o1", "o1-mini", "o3", "o3-mini"])
    async def test_system_prompt_injected_as_user_turn(self, model: str):
        client = _make_openai_client(model)
        raw = _openai_raw_response("Reasoned answer.")
        captured_payload = {}

        async def capture(**kwargs):
            captured_payload.update(kwargs)
            return raw

        with patch("openai.AsyncOpenAI") as MockOpenAI:
            MockOpenAI.return_value.chat.completions.create = capture
            await client.generate("Do X.", system_prompt="Be strict.")

        messages = captured_payload["messages"]
        roles = [m["role"] for m in messages]
        assert "system" not in roles, f"{model}: system role must not be sent"
        user_messages = [m for m in messages if m["role"] == "user"]
        assert any("Be strict." in m["content"] for m in user_messages), (
            f"{model}: system content must appear in user turn"
        )

    @pytest.mark.asyncio
    @pytest.mark.parametrize("model", ["o1", "o1-mini", "o3", "o3-mini"])
    async def test_temperature_not_sent_for_reasoning_model(self, model: str):
        client = _make_openai_client(model)
        raw = _openai_raw_response("Answer.")
        captured_payload = {}

        async def capture(**kwargs):
            captured_payload.update(kwargs)
            return raw

        with patch("openai.AsyncOpenAI") as MockOpenAI:
            MockOpenAI.return_value.chat.completions.create = capture
            await client.generate("Do X.", config=LLMConfig(temperature=0.5))

        assert "temperature" not in captured_payload, f"{model}: temperature must not be sent"

    @pytest.mark.asyncio
    @pytest.mark.parametrize("model", ["o1", "o3-mini"])
    async def test_top_p_not_sent_for_reasoning_model(self, model: str):
        client = _make_openai_client(model)
        raw = _openai_raw_response("Answer.")
        captured_payload = {}

        async def capture(**kwargs):
            captured_payload.update(kwargs)
            return raw

        with patch("openai.AsyncOpenAI") as MockOpenAI:
            MockOpenAI.return_value.chat.completions.create = capture
            await client.generate("Do X.")

        assert "top_p" not in captured_payload, f"{model}: top_p must not be sent"


# ---------------------------------------------------------------------------
# OpenAIClient.generate_with_history
# ---------------------------------------------------------------------------


class TestOpenAIClientGenerateWithHistory:
    @pytest.mark.asyncio
    async def test_gpt4o_keeps_system_message(self):
        client = _make_openai_client("gpt-4o")
        raw = _openai_raw_response("Answer.")
        captured_payload = {}

        async def capture(**kwargs):
            captured_payload.update(kwargs)
            return raw

        messages = [
            {"role": "system", "content": "Be helpful."},
            {"role": "user", "content": "What is X?"},
        ]
        with patch("openai.AsyncOpenAI") as MockOpenAI:
            MockOpenAI.return_value.chat.completions.create = capture
            await client.generate_with_history(messages)

        sent = captured_payload["messages"]
        assert any(m["role"] == "system" for m in sent)

    @pytest.mark.asyncio
    async def test_o1_converts_system_to_user(self):
        client = _make_openai_client("o1")
        raw = _openai_raw_response("Answer.")
        captured_payload = {}

        async def capture(**kwargs):
            captured_payload.update(kwargs)
            return raw

        messages = [
            {"role": "system", "content": "Be helpful."},
            {"role": "user", "content": "What is X?"},
        ]
        with patch("openai.AsyncOpenAI") as MockOpenAI:
            MockOpenAI.return_value.chat.completions.create = capture
            await client.generate_with_history(messages)

        sent = captured_payload["messages"]
        assert not any(m["role"] == "system" for m in sent)
        user_msgs = [m for m in sent if m["role"] == "user"]
        assert any("Be helpful." in m["content"] for m in user_msgs)


# ---------------------------------------------------------------------------
# GeminiClient regression — Gemma system prompt injection
# ---------------------------------------------------------------------------


class TestGeminiClientGemmaInjection:
    """Verify GeminiClient now uses the normalizer for Gemma models."""

    def _make_gemini_client(self, model: str) -> GeminiClient:
        client = GeminiClient.__new__(GeminiClient)
        client.api_key = "test-key"
        client.model_name = model
        client._model = MagicMock()
        return client

    def _make_gemini_raw(self, text: str) -> MagicMock:
        part = MagicMock()
        part.text = text
        part.thought = False
        content = MagicMock()
        content.parts = [part]
        candidate = MagicMock()
        candidate.content = content
        candidate.finish_reason = MagicMock()
        candidate.finish_reason.name = "STOP"
        raw = MagicMock()
        raw.candidates = [candidate]
        raw.usage_metadata = None
        return raw

    @pytest.mark.asyncio
    async def test_gemma_does_not_pass_system_instruction_to_sdk(self):
        """Gemma: system content must NOT appear as system_instruction in the SDK call."""
        import google.generativeai as genai

        client = self._make_gemini_client("gemma-3-27b-it")
        raw = self._make_gemini_raw("Gemma answer.")

        called_with_system_instruction = []

        original_init = genai.GenerativeModel.__init__

        def fake_init(self_m, model_name=None, system_instruction=None, **kw):
            called_with_system_instruction.append(system_instruction)
            self_m.generate_content = MagicMock(return_value=raw)

        with (
            patch("google.generativeai.GenerativeModel.__init__", fake_init),
            patch("google.generativeai.GenerativeModel.generate_content", return_value=raw),
            patch("google.generativeai.GenerationConfig", return_value=MagicMock()),
        ):
            result = await client.generate("Do X.", system_prompt="Be strict.")

        # system_instruction should be None for Gemma
        for si in called_with_system_instruction:
            assert si is None, "Gemma must not receive system_instruction"

    @pytest.mark.asyncio
    async def test_gemma_system_content_appears_in_user_prompt(self):
        """Gemma: system content must be injected into the user prompt."""
        client = self._make_gemini_client("gemma-3-27b-it")
        raw = self._make_gemini_raw("Gemma answer.")
        captured_prompts = []

        def fake_generate(prompt, generation_config=None):
            captured_prompts.append(prompt)
            return raw

        client._model.generate_content = fake_generate

        with (
            patch("google.generativeai.GenerativeModel") as MockModel,
            patch("google.generativeai.GenerationConfig", return_value=MagicMock()),
            patch("google.generativeai.configure"),
        ):
            MockModel.return_value.generate_content = fake_generate
            # Call directly on the client model (no system_instruction path for Gemma)
            client._model.generate_content = fake_generate
            await client.generate("Do X.", system_prompt="Be strict.")

        assert any("Be strict." in p for p in captured_prompts), (
            "System content must appear in the user prompt for Gemma"
        )
