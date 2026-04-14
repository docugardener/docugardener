"""
Tests for VerificationAgent zero-config bundled LLM key fallback (UX-03).

Verifies three behaviours in VerificationAgent.__init__:
  1. Uses the bundled key when tenant has no llmConfig.
  2. Tenant's own key always takes priority over the bundled key.
  3. No fallback when BUNDLED_GEMINI_KEY env var is not set (empty string).
"""

import pytest
from unittest.mock import MagicMock, patch, call

from src.agents.llm import LLMProvider
from src.agents.verifier import VerificationAgent
from src.core.config import settings


# ── DB / tenant mock helpers ──────────────────────────────────────────────────

def _make_mock_db(llm_config):
    """
    Build a mock DB that returns a Tenant with the given llmConfig.

    VerificationAgent.__init__ calls next(get_db()) twice:
      - once to load LLM provider config
      - once to load scoring model preference
    Using side_effect=lambda keeps returning a fresh iterator each call.
    """
    mock_tenant = MagicMock()
    mock_tenant.llmConfig = llm_config

    mock_session = MagicMock()
    # db_session.query(Tenant).filter(Tenant.id == ...).first() → mock_tenant
    mock_session.query.return_value.filter.return_value.first.return_value = mock_tenant

    # side_effect: each call to get_db() yields a fresh iterator with the session
    return lambda: iter([mock_session])


# ── Tests ─────────────────────────────────────────────────────────────────────

class TestVerificationAgentFallbackKey:
    """Tests for the zero-config bundled LLM key fallback."""

    @patch("src.agents.verifier.get_tenant_id", return_value="tenant-test")
    @patch("src.agents.verifier.get_db")
    @patch("src.agents.verifier.create_llm_client")
    def test_uses_bundled_key_when_no_tenant_config(
        self, mock_create_client, mock_get_db, mock_get_tenant_id
    ):
        """
        When tenant.llmConfig is None and BUNDLED_GEMINI_KEY is set,
        VerificationAgent must call create_llm_client with the bundled key.
        """
        mock_get_db.side_effect = _make_mock_db(llm_config=None)
        mock_create_client.return_value = MagicMock()

        with patch.object(settings, "bundled_gemini_key", "test-bundled-key"), \
             patch.object(settings, "bundled_gemini_model", "gemini-2.0-flash"):
            agent = VerificationAgent()

        mock_create_client.assert_called_once_with(
            provider=LLMProvider.GEMINI,
            api_key="test-bundled-key",
            model="gemini-2.0-flash",
        )

    @patch("src.agents.verifier.get_tenant_id", return_value="tenant-test")
    @patch("src.agents.verifier.get_db")
    @patch("src.agents.verifier.create_llm_client")
    @patch("src.agents.verifier.decrypt", return_value="real-tenant-key")
    def test_tenant_config_takes_priority_over_bundled_key(
        self, mock_decrypt, mock_create_client, mock_get_db, mock_get_tenant_id
    ):
        """
        When tenant has a valid llmConfig, it must be used regardless of whether
        BUNDLED_GEMINI_KEY is also set. The bundled key must never override a
        tenant's explicit configuration.
        """
        tenant_llm_config = {
            "provider": "gemini",
            "apiKey": "encrypted-tenant-key",
            "modelName": "gemini-2.0-flash",
        }
        mock_get_db.side_effect = _make_mock_db(llm_config=tenant_llm_config)
        mock_create_client.return_value = MagicMock()

        with patch.object(settings, "bundled_gemini_key", "bundled-key-should-not-be-used"), \
             patch.object(settings, "bundled_gemini_model", "gemini-2.0-flash"):
            agent = VerificationAgent()

        # Must be called with the decrypted tenant key, not the bundled key
        mock_create_client.assert_called_once_with(
            provider=LLMProvider.GEMINI,
            api_key="real-tenant-key",
            model="gemini-2.0-flash",
        )
        # Verify the bundled key was never passed
        _, kwargs = mock_create_client.call_args
        assert kwargs.get("api_key") != "bundled-key-should-not-be-used"

    @patch("src.agents.verifier.get_tenant_id", return_value="tenant-test")
    @patch("src.agents.verifier.get_db")
    @patch("src.agents.verifier.create_llm_client")
    def test_no_fallback_when_bundled_key_not_set(
        self, mock_create_client, mock_get_db, mock_get_tenant_id
    ):
        """
        When BUNDLED_GEMINI_KEY is empty and tenant has no llmConfig,
        the fallback must not activate — create_llm_client is called
        without an api_key kwarg, falling back to the global settings default.
        """
        mock_get_db.side_effect = _make_mock_db(llm_config=None)
        mock_create_client.return_value = MagicMock()

        with patch.object(settings, "bundled_gemini_key", ""), \
             patch.object(settings, "bundled_gemini_model", "gemini-2.0-flash"):
            agent = VerificationAgent()

        # create_llm_client must be called without api_key or model from bundled config
        _, kwargs = mock_create_client.call_args
        assert "api_key" not in kwargs
        assert "model" not in kwargs

    @patch("src.agents.verifier.get_tenant_id", return_value="tenant-test")
    @patch("src.agents.verifier.get_db")
    @patch("src.agents.verifier.create_llm_client")
    @patch("src.agents.verifier.decrypt")
    def test_platform_default_provider_activates_bundled_key(
        self, mock_decrypt, mock_create_client, mock_get_db, mock_get_tenant_id
    ):
        """
        When tenant.llmConfig has provider="platform_default" (set from the UI),
        the fallback must treat it the same as no config — bundled key is used,
        the stored encrypted key is ignored, and decrypt() is never called.
        """
        # Tenant has switched back to Platform Default from the UI;
        # their old encrypted key is still in the JSON but should not be used.
        tenant_llm_config = {
            "provider": "platform_default",
            "apiKey": "old-encrypted-key",
            "modelName": "gemini-2.0-flash",
        }
        mock_get_db.side_effect = _make_mock_db(llm_config=tenant_llm_config)
        mock_create_client.return_value = MagicMock()

        with patch.object(settings, "bundled_gemini_key", "bundled-active-key"), \
             patch.object(settings, "bundled_gemini_model", "gemini-2.0-flash"):
            agent = VerificationAgent()

        # Must use the bundled key, not the old tenant key
        mock_create_client.assert_called_once_with(
            provider=LLMProvider.GEMINI,
            api_key="bundled-active-key",
            model="gemini-2.0-flash",
        )
        # decrypt() must never be called — the stored key must not be touched
        mock_decrypt.assert_not_called()

    @patch("src.agents.verifier.get_tenant_id", return_value="tenant-test")
    @patch("src.agents.verifier.get_db")
    @patch("src.agents.verifier.create_llm_client")
    def test_bundled_key_sets_gemini_provider(
        self, mock_create_client, mock_get_db, mock_get_tenant_id
    ):
        """
        The bundled key always uses LLMProvider.GEMINI regardless of the
        global LLM_PROVIDER setting.
        """
        mock_get_db.side_effect = _make_mock_db(llm_config=None)
        mock_create_client.return_value = MagicMock()

        with patch.object(settings, "bundled_gemini_key", "bundled-key"), \
             patch.object(settings, "bundled_gemini_model", "gemini-2.0-flash"):
            agent = VerificationAgent()

        args, _ = mock_create_client.call_args
        assert mock_create_client.call_args.kwargs["provider"] == LLMProvider.GEMINI
