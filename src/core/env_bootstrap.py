# SPDX-License-Identifier: AGPL-3.0-or-later
"""ENV-BOOTSTRAP-01: Auto-populate tenant configuration from environment variables.

Safe rule: only write to a tenant field that is currently NULL / empty.
Never overwrite existing tenant configuration.
Errors are caught and logged — bootstrap failure must never block login.
"""

from __future__ import annotations

import logging
import os
from typing import Any

import httpx

from src.pipeline.job_manager import SessionLocal
from src.security.encryption import encrypt_credential as encrypt

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


def bootstrap_tenant_from_env(tenant_id: str) -> None:
    """Populate tenant DB fields from env vars where fields are currently empty.

    Called once at the end of ``auto_provision_single_tenant()`` and from the
    first-login hook ``ensure_tenant_bootstrapped()``.  Wrapped in try/except
    so that any failure is logged but never surfaced to the caller.

    Args:
        tenant_id: The UUID string of the tenant to bootstrap.
    """
    try:
        _bootstrap_github_app(tenant_id)
    except Exception:
        logger.exception(
            "GitHub App bootstrap failed — continuing without it",
            extra={"tenant_id": tenant_id},
        )

    try:
        _bootstrap_llm_config(tenant_id)
    except Exception:
        logger.exception(
            "LLM config bootstrap failed — continuing without it",
            extra={"tenant_id": tenant_id},
        )


# ---------------------------------------------------------------------------
# GitHub App bootstrap
# ---------------------------------------------------------------------------

_GITHUB_ENV_VARS = ("GITHUB_APP_ID", "GITHUB_WEBHOOK_SECRET", "GITHUB_PRIVATE_KEY_PATH")


def _bootstrap_github_app(tenant_id: str) -> None:
    """Write GitHub App credentials from env to tenant if appId is NULL."""
    app_id = os.getenv("GITHUB_APP_ID", "").strip()
    webhook_secret = os.getenv("GITHUB_WEBHOOK_SECRET", "").strip()
    pem_path = os.getenv("GITHUB_PRIVATE_KEY_PATH", "").strip()

    if not (app_id and webhook_secret and pem_path):
        logger.debug(
            "GitHub App env vars not fully set — skipping bootstrap",
            extra={"tenant_id": tenant_id},
        )
        return

    with SessionLocal() as db:
        tenant = _get_tenant(db, tenant_id)
        if tenant is None:
            logger.warning(
                "Tenant not found during GitHub App bootstrap",
                extra={"tenant_id": tenant_id},
            )
            return

        if tenant.appId:
            logger.debug(
                "tenant.appId already set — skipping GitHub App bootstrap",
                extra={"tenant_id": tenant_id},
            )
            return

        # Read PEM file
        try:
            with open(pem_path) as f:
                pem_content = f.read()
        except OSError as exc:
            raise RuntimeError(f"Cannot read private key from {pem_path}: {exc}") from exc

        # Encrypt before storing
        encrypted_pem = encrypt(pem_content)

        # Discover installation ID
        installation_id: str | None = None
        try:
            installation_id = _fetch_installation_id(app_id, pem_content)
        except Exception:
            logger.warning(
                "Could not fetch GitHub App installation ID — will be discovered later",
                extra={"tenant_id": tenant_id},
            )

        # Write to DB
        tenant.appId = app_id
        tenant.webhookSecret = webhook_secret
        tenant.privateKey = encrypted_pem
        if installation_id:
            tenant.installationId = installation_id

        db.commit()

        logger.info(
            "GitHub App bootstrapped from env",
            extra={
                "tenant_id": tenant_id,
                "app_id": app_id,
                "installation_id": installation_id,
            },
        )


def _fetch_installation_id(app_id: str, pem_content: str) -> str:
    """Call GET /app/installations and return the first installation ID.

    Args:
        app_id: Numeric GitHub App ID (as string).
        pem_content: Raw PEM text of the private key.

    Returns:
        The installation ID as a string.

    Raises:
        RuntimeError: If the API call fails or no installations are found.
    """
    try:
        import time

        import jwt as pyjwt  # type: ignore[import]

        now = int(time.time())
        payload = {"iat": now - 60, "exp": now + 600, "iss": app_id}
        token = pyjwt.encode(payload, pem_content, algorithm="RS256")
    except Exception as exc:
        raise RuntimeError(f"JWT signing failed: {exc}") from exc

    resp = httpx.get(
        "https://api.github.com/app/installations",
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        },
        timeout=10,
    )

    if resp.status_code != 200:
        raise RuntimeError(f"GitHub API returned {resp.status_code}: {resp.text[:200]}")

    installations = resp.json()
    if not installations:
        raise RuntimeError("No GitHub App installations found")

    return str(installations[0]["id"])


# ---------------------------------------------------------------------------
# LLM config bootstrap
# ---------------------------------------------------------------------------

_PROVIDER_KEY_MAP: dict[str, str] = {
    "gemini": "GEMINI_API_KEY",
    "openai": "OPENAI_API_KEY",
    "anthropic": "ANTHROPIC_API_KEY",
    "ollama": "",  # ollama uses base URL, not API key
}

_PROVIDER_BASE_URL_MAP: dict[str, str] = {
    "ollama": "OLLAMA_BASE_URL",
}


def _bootstrap_llm_config(tenant_id: str) -> None:
    """Write llmConfig to tenant if it is currently NULL or empty dict."""
    provider = os.getenv("LLM_PROVIDER", "").strip().lower()
    if not provider:
        return

    key_env_var = _PROVIDER_KEY_MAP.get(provider, "")
    api_key = os.getenv(key_env_var, "").strip() if key_env_var else ""

    base_url_env_var = _PROVIDER_BASE_URL_MAP.get(provider, "")
    base_url = os.getenv(base_url_env_var, "").strip() if base_url_env_var else ""

    # For non-ollama providers, require an API key
    if provider != "ollama" and not api_key:
        logger.debug(
            "LLM_PROVIDER set but %s not found — skipping LLM bootstrap",
            key_env_var,
            extra={"tenant_id": tenant_id},
        )
        return

    with SessionLocal() as db:
        tenant = _get_tenant(db, tenant_id)
        if tenant is None:
            logger.warning(
                "Tenant not found during LLM config bootstrap",
                extra={"tenant_id": tenant_id},
            )
            return

        # Skip if already configured (any non-empty dict)
        existing: dict[str, Any] | None = tenant.llmConfig
        if existing and isinstance(existing, dict) and existing:
            logger.debug(
                "tenant.llmConfig already set — skipping LLM bootstrap",
                extra={"tenant_id": tenant_id},
            )
            return

        # Build llmConfig in the format expected by the Settings UI and
        # src/worker/context.py (nested keys/models/baseUrls per provider)
        llm_model = os.getenv("LLM_MODEL", "").strip()

        llm_config: dict[str, Any] = {
            "provider": provider,
            "keys": {},
            "models": {},
            "baseUrls": {},
        }

        if api_key:
            llm_config["keys"][provider] = api_key

        if llm_model:
            llm_config["models"][provider] = llm_model

        if base_url:
            llm_config["baseUrls"][provider] = base_url

        tenant.llmConfig = llm_config
        db.commit()

        logger.info(
            "LLM config bootstrapped from env",
            extra={"tenant_id": tenant_id, "provider": provider},
        )


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------


def _get_tenant(db: Any, tenant_id: str) -> Any | None:
    """Fetch tenant record by ID using the Prisma/SQLAlchemy ORM."""
    # Import here to avoid circular imports at module load time
    try:
        from src.storage.sql_models import Tenant  # type: ignore[import]

        return db.query(Tenant).filter(Tenant.id == tenant_id).first()
    except Exception:
        logger.exception(
            "Failed to query tenant",
            extra={"tenant_id": tenant_id},
        )
        return None
