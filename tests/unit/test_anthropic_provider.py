"""
Tests for Anthropic LLM provider integration.

TDD: these tests are written BEFORE implementation.
All tests should FAIL initially, then pass after implementation.

Covers:
  - LLMProvider enum has ANTHROPIC value
  - AnthropicLLMClient instantiates with api_key + model
  - generate() returns LLMResponse with content + usage
  - generate() raises on 401 (AuthenticationError) — non-transient
  - generate() retries on 529 (overloaded) — transient
  - generate_with_history() works correctly
  - _is_transient() recognises Anthropic overloaded (529) errors
  - create_llm_client("anthropic") returns AnthropicLLMClient
  - model_registry has Claude models with correct capability profiles
  - config.py has anthropic_api_key + anthropic_model fields
  - llm_provider Literal includes "anthropic"
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# ---------------------------------------------------------------------------
# 1. Enum + factory
# ---------------------------------------------------------------------------


class TestLLMProviderEnum:
    def test_anthropic_in_provider_enum(self):
        from src.agents.llm import LLMProvider

        assert hasattr(LLMProvider, "ANTHROPIC")
        assert LLMProvider.ANTHROPIC.value == "anthropic"

    def test_create_llm_client_anthropic_returns_anthropic_client(self):
        from src.agents.llm import AnthropicClient, LLMProvider, create_llm_client

        with patch("src.agents.llm.AnthropicClient.__init__", return_value=None):
            client = create_llm_client(LLMProvider.ANTHROPIC, api_key="test-key")
        assert isinstance(client, AnthropicClient)

    def test_create_llm_client_anthropic_string_via_settings(self):
        """create_llm_client() works when settings.llm_provider = 'anthropic'."""
        from src.agents.llm import AnthropicClient, create_llm_client

        with (
            patch("src.agents.llm.settings") as mock_settings,
            patch("src.agents.llm.AnthropicClient.__init__", return_value=None),
        ):
            mock_settings.llm_provider = "anthropic"
            mock_settings.anthropic_api_key = "ak-test"
            mock_settings.anthropic_model = "claude-sonnet-4-6"
            client = create_llm_client()
        assert isinstance(client, AnthropicClient)


# ---------------------------------------------------------------------------
# 2. AnthropicClient instantiation
# ---------------------------------------------------------------------------


class TestAnthropicClientInit:
    def test_init_with_explicit_key_and_model(self):
        from src.agents.llm import AnthropicClient

        with patch("src.agents.llm.AnthropicClient._init_client"):
            client = AnthropicClient(api_key="sk-ant-test", model="claude-sonnet-4-6")
        assert client.api_key == "sk-ant-test"
        assert client.model_name == "claude-sonnet-4-6"

    def test_init_falls_back_to_settings(self):
        from src.agents.llm import AnthropicClient

        with (
            patch("src.agents.llm.settings") as mock_settings,
            patch("src.agents.llm.AnthropicClient._init_client"),
        ):
            mock_settings.anthropic_api_key = "sk-ant-from-settings"
            mock_settings.anthropic_model = "claude-haiku-4-5-20251001"
            client = AnthropicClient()
        assert client.api_key == "sk-ant-from-settings"
        assert client.model_name == "claude-haiku-4-5-20251001"

    def test_init_raises_without_api_key(self):
        from src.agents.llm import AnthropicClient

        with patch("src.agents.llm.settings") as mock_settings:
            mock_settings.anthropic_api_key = None
            mock_settings.anthropic_model = "claude-sonnet-4-6"
            with pytest.raises(ValueError, match="Anthropic API key"):
                AnthropicClient()


# ---------------------------------------------------------------------------
# 3. generate() — success path
# ---------------------------------------------------------------------------


class TestAnthropicClientGenerate:
    def _make_mock_response(self, text: str = "Test response"):
        """Build a minimal mock of anthropic.types.Message."""
        mock_content_block = MagicMock()
        mock_content_block.type = "text"
        mock_content_block.text = text

        mock_resp = MagicMock()
        mock_resp.content = [mock_content_block]
        mock_resp.model = "claude-sonnet-4-6"
        mock_resp.stop_reason = "end_turn"
        mock_resp.usage.input_tokens = 100
        mock_resp.usage.output_tokens = 50
        return mock_resp

    @pytest.mark.asyncio
    async def test_generate_returns_llm_response(self):
        from src.agents.llm import AnthropicClient, LLMResponse

        mock_resp = self._make_mock_response("Hello from Claude")
        mock_sdk = MagicMock()
        mock_sdk.messages.create = AsyncMock(return_value=mock_resp)

        with patch("src.agents.llm.AnthropicClient._init_client"):
            client = AnthropicClient(api_key="sk-ant-test", model="claude-sonnet-4-6")
            client._client = mock_sdk

        result = await client.generate("Say hello")
        assert isinstance(result, LLMResponse)
        assert result.content == "Hello from Claude"
        assert result.model == "claude-sonnet-4-6"

    @pytest.mark.asyncio
    async def test_generate_includes_usage(self):
        from src.agents.llm import AnthropicClient

        mock_resp = self._make_mock_response("Usage test")
        mock_sdk = MagicMock()
        mock_sdk.messages.create = AsyncMock(return_value=mock_resp)

        with patch("src.agents.llm.AnthropicClient._init_client"):
            client = AnthropicClient(api_key="sk-ant-test", model="claude-sonnet-4-6")
            client._client = mock_sdk

        result = await client.generate("Test")
        assert result.usage is not None
        assert result.usage["prompt_tokens"] == 100
        assert result.usage["completion_tokens"] == 50

    @pytest.mark.asyncio
    async def test_generate_passes_system_prompt(self):
        from src.agents.llm import AnthropicClient

        mock_resp = self._make_mock_response("ok")
        mock_sdk = MagicMock()
        mock_sdk.messages.create = AsyncMock(return_value=mock_resp)

        with patch("src.agents.llm.AnthropicClient._init_client"):
            client = AnthropicClient(api_key="sk-ant-test", model="claude-sonnet-4-6")
            client._client = mock_sdk

        await client.generate("User prompt", system_prompt="You are a helpful assistant.")

        call_kwargs = mock_sdk.messages.create.call_args[1]
        assert call_kwargs.get("system") == "You are a helpful assistant."

    @pytest.mark.asyncio
    async def test_generate_finish_reason_maps_end_turn(self):
        from src.agents.llm import AnthropicClient

        mock_resp = self._make_mock_response()
        mock_resp.stop_reason = "end_turn"
        mock_sdk = MagicMock()
        mock_sdk.messages.create = AsyncMock(return_value=mock_resp)

        with patch("src.agents.llm.AnthropicClient._init_client"):
            client = AnthropicClient(api_key="sk-ant-test", model="claude-sonnet-4-6")
            client._client = mock_sdk

        result = await client.generate("Test")
        assert result.finish_reason == "stop"


# ---------------------------------------------------------------------------
# 4. generate() — error handling
# ---------------------------------------------------------------------------


class TestAnthropicClientErrors:
    @pytest.mark.asyncio
    async def test_generate_raises_on_auth_error(self):
        """401 AuthenticationError is non-transient — should not retry, should raise."""
        import anthropic

        from src.agents.llm import AnthropicClient

        auth_error = anthropic.AuthenticationError(
            message="Invalid API key",
            response=MagicMock(status_code=401),
            body={"error": {"type": "authentication_error"}},
        )
        mock_sdk = MagicMock()
        mock_sdk.messages.create = AsyncMock(side_effect=auth_error)

        with patch("src.agents.llm.AnthropicClient._init_client"):
            client = AnthropicClient(api_key="bad-key", model="claude-sonnet-4-6")
            client._client = mock_sdk

        with pytest.raises(anthropic.AuthenticationError):
            await client.generate("Test")

        # Should have only been called once (no retry on auth error)
        assert mock_sdk.messages.create.call_count == 1

    @pytest.mark.asyncio
    async def test_generate_retries_on_overload_529(self):
        """529 (Anthropic overloaded) is transient — should retry up to max_attempts."""
        import anthropic

        from src.agents.llm import AnthropicClient

        overload_error = anthropic.APIStatusError(
            message="Overloaded",
            response=MagicMock(status_code=529),
            body={"error": {"type": "overloaded_error"}},
        )
        mock_content = MagicMock()
        mock_content.type = "text"
        mock_content.text = "Recovered"
        mock_resp = MagicMock()
        mock_resp.content = [mock_content]
        mock_resp.model = "claude-sonnet-4-6"
        mock_resp.stop_reason = "end_turn"
        mock_resp.usage.input_tokens = 10
        mock_resp.usage.output_tokens = 5

        # Fail twice, succeed on third
        mock_sdk = MagicMock()
        mock_sdk.messages.create = AsyncMock(
            side_effect=[overload_error, overload_error, mock_resp]
        )

        with (
            patch("src.agents.llm.AnthropicClient._init_client"),
            patch("asyncio.sleep", new_callable=AsyncMock),
        ):
            client = AnthropicClient(api_key="sk-ant-test", model="claude-sonnet-4-6")
            client._client = mock_sdk

        result = await client.generate("Test")
        assert result.content == "Recovered"
        assert mock_sdk.messages.create.call_count == 3


# ---------------------------------------------------------------------------
# 5. generate_with_history()
# ---------------------------------------------------------------------------


class TestAnthropicClientHistory:
    @pytest.mark.asyncio
    async def test_generate_with_history_passes_messages(self):
        from src.agents.llm import AnthropicClient

        mock_content = MagicMock()
        mock_content.type = "text"
        mock_content.text = "History response"
        mock_resp = MagicMock()
        mock_resp.content = [mock_content]
        mock_resp.model = "claude-sonnet-4-6"
        mock_resp.stop_reason = "end_turn"
        mock_resp.usage.input_tokens = 20
        mock_resp.usage.output_tokens = 10

        mock_sdk = MagicMock()
        mock_sdk.messages.create = AsyncMock(return_value=mock_resp)

        with patch("src.agents.llm.AnthropicClient._init_client"):
            client = AnthropicClient(api_key="sk-ant-test", model="claude-sonnet-4-6")
            client._client = mock_sdk

        messages = [
            {"role": "user", "content": "Hello"},
            {"role": "assistant", "content": "Hi there"},
            {"role": "user", "content": "How are you?"},
        ]
        result = await client.generate_with_history(messages)
        assert result.content == "History response"

        call_kwargs = mock_sdk.messages.create.call_args[1]
        # System messages should be extracted; user/assistant messages remain
        passed_messages = call_kwargs.get("messages", [])
        assert any(m["role"] == "user" for m in passed_messages)

    @pytest.mark.asyncio
    async def test_generate_with_history_extracts_system_message(self):
        """system role in messages list is extracted to the `system` parameter."""
        from src.agents.llm import AnthropicClient

        mock_content = MagicMock()
        mock_content.type = "text"
        mock_content.text = "ok"
        mock_resp = MagicMock()
        mock_resp.content = [mock_content]
        mock_resp.model = "claude-sonnet-4-6"
        mock_resp.stop_reason = "end_turn"
        mock_resp.usage.input_tokens = 5
        mock_resp.usage.output_tokens = 2

        mock_sdk = MagicMock()
        mock_sdk.messages.create = AsyncMock(return_value=mock_resp)

        with patch("src.agents.llm.AnthropicClient._init_client"):
            client = AnthropicClient(api_key="sk-ant-test", model="claude-sonnet-4-6")
            client._client = mock_sdk

        messages = [
            {"role": "system", "content": "You are an expert."},
            {"role": "user", "content": "Question?"},
        ]
        await client.generate_with_history(messages)

        call_kwargs = mock_sdk.messages.create.call_args[1]
        assert call_kwargs.get("system") == "You are an expert."
        # system role should NOT appear in messages list
        passed = call_kwargs.get("messages", [])
        assert not any(m["role"] == "system" for m in passed)


# ---------------------------------------------------------------------------
# 6. _is_transient — Anthropic error types
# ---------------------------------------------------------------------------


class TestIsTransientAnthropic:
    def test_overloaded_529_is_transient(self):
        """anthropic.APIStatusError with status_code=529 is transient."""
        import anthropic

        from src.agents.llm import _is_transient

        exc = anthropic.APIStatusError(
            message="Overloaded",
            response=MagicMock(status_code=529),
            body={},
        )
        assert _is_transient(exc) is True

    def test_rate_limit_error_is_transient(self):
        import anthropic

        from src.agents.llm import _is_transient

        exc = anthropic.RateLimitError(
            message="Rate limited",
            response=MagicMock(status_code=429),
            body={},
        )
        assert _is_transient(exc) is True

    def test_authentication_error_is_not_transient(self):
        import anthropic

        from src.agents.llm import _is_transient

        exc = anthropic.AuthenticationError(
            message="Bad key",
            response=MagicMock(status_code=401),
            body={},
        )
        assert _is_transient(exc) is False

    def test_api_connection_error_is_transient(self):
        import anthropic

        from src.agents.llm import _is_transient

        exc = anthropic.APIConnectionError(request=MagicMock())
        assert _is_transient(exc) is True


# ---------------------------------------------------------------------------
# 7. Model registry
# ---------------------------------------------------------------------------


class TestAnthropicModelRegistry:
    def test_claude_sonnet_4_6_registered(self):
        from src.agents.model_registry import DEFAULT_CAPABILITY, get_capability

        cap = get_capability("anthropic", "claude-sonnet-4-6")
        assert cap is not DEFAULT_CAPABILITY
        assert cap.max_context_tokens >= 200_000

    def test_claude_opus_4_6_registered(self):
        from src.agents.model_registry import DEFAULT_CAPABILITY, get_capability

        cap = get_capability("anthropic", "claude-opus-4-6")
        assert cap is not DEFAULT_CAPABILITY
        assert cap.max_context_tokens >= 200_000

    def test_claude_haiku_4_5_registered(self):
        from src.agents.model_registry import DEFAULT_CAPABILITY, get_capability

        cap = get_capability("anthropic", "claude-haiku-4-5-20251001")
        assert cap is not DEFAULT_CAPABILITY

    def test_claude_models_support_system_prompt(self):
        from src.agents.model_registry import get_capability

        for model in ["claude-sonnet-4-6", "claude-opus-4-6", "claude-haiku-4-5-20251001"]:
            cap = get_capability("anthropic", model)
            assert cap.supports_system_prompt is True, f"{model} should support system prompt"

    def test_claude_models_support_temperature(self):
        from src.agents.model_registry import get_capability

        for model in ["claude-sonnet-4-6", "claude-opus-4-6", "claude-haiku-4-5-20251001"]:
            cap = get_capability("anthropic", model)
            assert cap.supports_temperature is True


# ---------------------------------------------------------------------------
# 8. Config
# ---------------------------------------------------------------------------


class TestAnthropicConfig:
    def test_config_has_anthropic_api_key_field(self):
        from src.core.config import Settings

        assert (
            hasattr(Settings.model_fields, "anthropic_api_key")
            or "anthropic_api_key" in Settings.model_fields
        )

    def test_config_has_anthropic_model_field(self):
        from src.core.config import Settings

        assert "anthropic_model" in Settings.model_fields

    def test_anthropic_in_llm_provider_literal(self):
        """settings.llm_provider should accept 'anthropic' without validation error."""
        from src.core.config import Settings

        # Pydantic will raise if "anthropic" is not in the Literal
        s = Settings(
            llm_provider="anthropic",
            anthropic_api_key="sk-ant-test",
            anthropic_model="claude-sonnet-4-6",
        )
        assert s.llm_provider == "anthropic"
