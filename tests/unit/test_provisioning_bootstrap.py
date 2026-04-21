# SPDX-License-Identifier: AGPL-3.0-or-later
"""Unit tests for ENV-BOOTSTRAP-01: env-to-tenant bootstrap.

Tests cover src/core/env_bootstrap.py:
  - bootstrap_tenant_from_env()
  - GitHub App field population
  - LLM config population
  - Safe-overwrite guard (never clobber existing config)
  - Failure isolation (bootstrap errors never block login)
"""
from __future__ import annotations

import os
from typing import Any
from unittest.mock import MagicMock, patch

import pytest


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_tenant(
    *,
    app_id: str | None = None,
    webhook_secret: str | None = None,
    private_key: str | None = None,
    installation_id: str | None = None,
    llm_config: dict[str, Any] | None = None,
) -> MagicMock:
    """Return a mock tenant object that records attribute assignments."""
    t = MagicMock()
    t.appId = app_id
    t.webhookSecret = webhook_secret
    t.privateKey = private_key
    t.installationId = installation_id
    t.llmConfig = llm_config
    return t


def _mock_db_with_tenant(tenant: MagicMock) -> MagicMock:
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = tenant
    return db


def _patch_session(tenant: MagicMock):
    """Context manager that patches SessionLocal to return a mock DB."""
    db = _mock_db_with_tenant(tenant)
    mock_session = MagicMock()
    mock_session.return_value.__enter__ = MagicMock(return_value=db)
    mock_session.return_value.__exit__ = MagicMock(return_value=False)
    return patch("src.core.env_bootstrap.SessionLocal", mock_session), db


# ---------------------------------------------------------------------------
# GitHub App bootstrap
# ---------------------------------------------------------------------------


class TestBootstrapGitHubApp:
    """GitHub App bootstrap — ENV-BOOTSTRAP-01 §GitHub App Bootstrap."""

    def test_bootstrap_when_tenant_empty(self, tmp_path: Any) -> None:
        """Bootstrap writes appId/webhookSecret/privateKey when tenant.appId is NULL."""
        pem_file = tmp_path / "test_key.pem"
        pem_file.write_text(
            "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA\n-----END RSA PRIVATE KEY-----\n"
        )

        env = {
            "GITHUB_APP_ID": "999",
            "GITHUB_WEBHOOK_SECRET": "mysecret",
            "GITHUB_PRIVATE_KEY_PATH": str(pem_file),
        }
        tenant = _make_tenant()  # appId=None → bootstrap should run

        session_patch, db = _patch_session(tenant)

        with (
            patch.dict(os.environ, env),
            session_patch,
            patch(
                "src.core.env_bootstrap.encrypt",
                return_value="encrypted_pem",
            ) as mock_encrypt,
            patch(
                "src.core.env_bootstrap._fetch_installation_id",
                return_value="42",
            ) as mock_install,
        ):
            from src.core.env_bootstrap import bootstrap_tenant_from_env

            bootstrap_tenant_from_env("tenant-123")

        assert tenant.appId == "999"
        assert tenant.webhookSecret == "mysecret"
        assert tenant.privateKey == "encrypted_pem"
        assert tenant.installationId == "42"
        mock_encrypt.assert_called_once()
        db.commit.assert_called()

    def test_bootstrap_skipped_when_app_id_already_set(self, tmp_path: Any) -> None:
        """Bootstrap does NOT overwrite an existing appId."""
        pem_file = tmp_path / "key.pem"
        pem_file.write_text("-----BEGIN RSA PRIVATE KEY-----\nfake\n-----END RSA PRIVATE KEY-----\n")

        env = {
            "GITHUB_APP_ID": "999",
            "GITHUB_WEBHOOK_SECRET": "mysecret",
            "GITHUB_PRIVATE_KEY_PATH": str(pem_file),
        }
        tenant = _make_tenant(app_id="existing-app-id")

        session_patch, db = _patch_session(tenant)

        with (
            patch.dict(os.environ, env),
            session_patch,
            patch("src.core.env_bootstrap.encrypt") as mock_encrypt,
            patch("src.core.env_bootstrap._fetch_installation_id") as mock_install,
        ):
            from src.core.env_bootstrap import bootstrap_tenant_from_env

            bootstrap_tenant_from_env("tenant-123")

        assert tenant.appId == "existing-app-id"
        mock_encrypt.assert_not_called()
        mock_install.assert_not_called()
        db.commit.assert_not_called()

    def test_bootstrap_skipped_when_env_vars_missing(self) -> None:
        """Bootstrap does nothing when GITHUB_APP_ID is not in env."""
        tenant = _make_tenant()

        session_patch, db = _patch_session(tenant)

        env: dict[str, str] = {}
        # Ensure vars are absent
        for key in ("GITHUB_APP_ID", "GITHUB_WEBHOOK_SECRET", "GITHUB_PRIVATE_KEY_PATH"):
            os.environ.pop(key, None)

        with (
            patch.dict(os.environ, env),
            session_patch,
            patch("src.core.env_bootstrap.encrypt") as mock_encrypt,
        ):
            from src.core.env_bootstrap import bootstrap_tenant_from_env

            bootstrap_tenant_from_env("tenant-123")

        assert tenant.appId is None
        mock_encrypt.assert_not_called()

    def test_bootstrap_failure_does_not_raise(self, tmp_path: Any) -> None:
        """A bootstrap error is swallowed and logged — never blocks login."""
        pem_file = tmp_path / "key.pem"
        pem_file.write_text("bad pem content")

        env = {
            "GITHUB_APP_ID": "999",
            "GITHUB_WEBHOOK_SECRET": "mysecret",
            "GITHUB_PRIVATE_KEY_PATH": str(pem_file),
        }
        tenant = _make_tenant()

        session_patch, db = _patch_session(tenant)

        with (
            patch.dict(os.environ, env),
            session_patch,
            patch(
                "src.core.env_bootstrap.encrypt",
                side_effect=RuntimeError("encryption service unavailable"),
            ),
        ):
            from src.core.env_bootstrap import bootstrap_tenant_from_env

            # Must not raise
            bootstrap_tenant_from_env("tenant-123")

        assert tenant.appId is None  # unchanged on failure


# ---------------------------------------------------------------------------
# LLM config bootstrap
# ---------------------------------------------------------------------------


class TestBootstrapLLMConfig:
    """LLM config bootstrap — ENV-BOOTSTRAP-01 §LLM Config Bootstrap."""

    def test_openai_bootstrap_when_llm_config_null(self) -> None:
        """Builds and saves llmConfig when tenant.llmConfig is NULL."""
        tenant = _make_tenant(llm_config=None)
        session_patch, db = _patch_session(tenant)

        env = {"LLM_PROVIDER": "openai", "OPENAI_API_KEY": "sk-test-key"}

        with patch.dict(os.environ, env), session_patch:
            from src.core.env_bootstrap import bootstrap_tenant_from_env

            bootstrap_tenant_from_env("tenant-123")

        assert tenant.llmConfig is not None
        assert tenant.llmConfig["provider"] == "openai"
        assert tenant.llmConfig["keys"]["openai"] == "sk-test-key"
        db.commit.assert_called()

    def test_anthropic_bootstrap(self) -> None:
        """Builds llmConfig for Anthropic provider."""
        tenant = _make_tenant(llm_config=None)
        session_patch, db = _patch_session(tenant)

        env = {"LLM_PROVIDER": "anthropic", "ANTHROPIC_API_KEY": "ant-key-xyz"}

        with patch.dict(os.environ, env), session_patch:
            from src.core.env_bootstrap import bootstrap_tenant_from_env

            bootstrap_tenant_from_env("tenant-123")

        assert tenant.llmConfig["provider"] == "anthropic"
        assert tenant.llmConfig["keys"]["anthropic"] == "ant-key-xyz"

    def test_gemini_bootstrap(self) -> None:
        """Builds llmConfig for Gemini provider."""
        tenant = _make_tenant(llm_config=None)
        session_patch, db = _patch_session(tenant)

        env = {"LLM_PROVIDER": "gemini", "GEMINI_API_KEY": "gmn-key"}

        with patch.dict(os.environ, env), session_patch:
            from src.core.env_bootstrap import bootstrap_tenant_from_env

            bootstrap_tenant_from_env("tenant-123")

        assert tenant.llmConfig["provider"] == "gemini"
        assert tenant.llmConfig["keys"]["gemini"] == "gmn-key"

    def test_llm_bootstrap_skipped_when_already_configured(self) -> None:
        """Does NOT overwrite an existing llmConfig."""
        existing_cfg: dict[str, Any] = {
            "provider": "openai",
            "keys": {"openai": "existing-key"},
            "models": {},
            "baseUrls": {},
        }
        tenant = _make_tenant(llm_config=existing_cfg)
        session_patch, db = _patch_session(tenant)

        env = {"LLM_PROVIDER": "anthropic", "ANTHROPIC_API_KEY": "new-key"}

        with patch.dict(os.environ, env), session_patch:
            from src.core.env_bootstrap import bootstrap_tenant_from_env

            bootstrap_tenant_from_env("tenant-123")

        assert tenant.llmConfig["provider"] == "openai"
        assert tenant.llmConfig["keys"]["openai"] == "existing-key"
        db.commit.assert_not_called()

    def test_llm_bootstrap_runs_when_empty_dict(self) -> None:
        """An empty dict {} is treated the same as NULL — bootstrap runs."""
        tenant = _make_tenant(llm_config={})
        session_patch, db = _patch_session(tenant)

        env = {"LLM_PROVIDER": "openai", "OPENAI_API_KEY": "sk-abc"}

        with patch.dict(os.environ, env), session_patch:
            from src.core.env_bootstrap import bootstrap_tenant_from_env

            bootstrap_tenant_from_env("tenant-123")

        assert tenant.llmConfig is not None
        assert tenant.llmConfig.get("provider") == "openai"

    def test_llm_bootstrap_skipped_when_api_key_missing(self) -> None:
        """No bootstrap when LLM_PROVIDER is set but the API key is absent."""
        tenant = _make_tenant(llm_config=None)
        session_patch, db = _patch_session(tenant)

        os.environ.pop("OPENAI_API_KEY", None)
        env: dict[str, str] = {"LLM_PROVIDER": "openai"}

        with patch.dict(os.environ, env), session_patch:
            from src.core.env_bootstrap import bootstrap_tenant_from_env

            bootstrap_tenant_from_env("tenant-123")

        assert tenant.llmConfig is None
        db.commit.assert_not_called()

    def test_llm_bootstrap_failure_does_not_raise(self) -> None:
        """LLM bootstrap errors are swallowed — login never blocked."""
        tenant = _make_tenant(llm_config=None)
        session_patch, db = _patch_session(tenant)
        db.commit.side_effect = Exception("DB is down")

        env = {"LLM_PROVIDER": "openai", "OPENAI_API_KEY": "sk-test"}

        with patch.dict(os.environ, env), session_patch:
            from src.core.env_bootstrap import bootstrap_tenant_from_env

            # Must not raise
            bootstrap_tenant_from_env("tenant-123")

    def test_llm_model_populated_when_env_var_set(self) -> None:
        """LLM_MODEL env var is written to models.{provider} in llmConfig."""
        tenant = _make_tenant(llm_config=None)
        session_patch, db = _patch_session(tenant)

        env = {
            "LLM_PROVIDER": "openai",
            "OPENAI_API_KEY": "sk-key",
            "LLM_MODEL": "gpt-4o",
        }

        with patch.dict(os.environ, env), session_patch:
            from src.core.env_bootstrap import bootstrap_tenant_from_env

            bootstrap_tenant_from_env("tenant-123")

        assert tenant.llmConfig["models"]["openai"] == "gpt-4o"
