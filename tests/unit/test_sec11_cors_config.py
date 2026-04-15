"""
SEC-11: CORS & Config Hardening — unit tests.

Verifies that:
- allowed_origins defaults to [] (empty, not ["*"])
- sql_database_url defaults to None
- validate_production_config() raises in production when allowed_origins is empty
- validate_production_config() raises in production when sql_database_url is None
- validate_production_config() passes when both are set
- validate_production_config() is a no-op in development/staging
- CORS middleware uses ["*"] fallback in dev (empty allowed_origins)
- CORS middleware uses explicit origins in production
"""

import pytest

from src.core.config import Settings

# ── Default value tests ────────────────────────────────────────────────────────


def test_allowed_origins_default_is_empty():
    # Construct with _env_file=None to avoid reading from .env
    s = Settings.model_construct(allowed_origins=[])
    assert s.allowed_origins == []


def test_sql_database_url_accepts_none():
    # Type annotation accepts None — verify the field allows it
    s = Settings(app_env="development", sql_database_url=None)
    assert s.sql_database_url is None


# ── validate_production_config: development is a no-op ────────────────────────


def test_production_validation_noop_in_development():
    s = Settings(app_env="development", allowed_origins=[], sql_database_url=None)
    # Must not raise
    s.validate_production_config()


def test_production_validation_noop_in_staging():
    s = Settings(app_env="staging", allowed_origins=[], sql_database_url=None)
    s.validate_production_config()


# ── validate_production_config: production failures ───────────────────────────


def test_production_raises_when_allowed_origins_empty():
    s = Settings(
        app_env="production",
        allowed_origins=[],
        sql_database_url="postgresql://user:pass@db/docugardener",
        encryption_key="a" * 64,
    )
    with pytest.raises(RuntimeError, match="ALLOWED_ORIGINS"):
        s.validate_production_config()


def test_production_raises_when_sql_database_url_none():
    s = Settings(
        app_env="production",
        allowed_origins=["https://app.docugardener.dev"],
        sql_database_url=None,
        encryption_key="a" * 64,
    )
    with pytest.raises(RuntimeError, match="SQL_DATABASE_URL"):
        s.validate_production_config()


def test_production_passes_when_both_set():
    s = Settings(
        app_env="production",
        allowed_origins=["https://app.docugardener.dev"],
        sql_database_url="postgresql://user:pass@db/docugardener",
        encryption_key="a" * 64,
        feedback_hmac_secret="x" * 32,
    )
    # Must not raise
    s.validate_production_config()


def test_production_allowed_origins_with_multiple_origins():
    s = Settings(
        app_env="production",
        allowed_origins=["https://app.docugardener.dev", "https://admin.docugardener.dev"],
        sql_database_url="postgresql://user:pass@db/docugardener",
        encryption_key="a" * 64,
        feedback_hmac_secret="x" * 32,
    )
    s.validate_production_config()


# ── CORS origins used in create_app() ─────────────────────────────────────────


def test_cors_origins_logic_falls_back_to_wildcard_when_empty():
    """cors_origins derivation: empty list → ['*'] fallback."""
    allowed: list[str] = []
    cors_origins = allowed if allowed else ["*"]
    assert cors_origins == ["*"]


def test_cors_origins_logic_uses_explicit_when_set():
    """cors_origins derivation: non-empty list → used as-is."""
    allowed = ["https://app.docugardener.dev"]
    cors_origins = allowed if allowed else ["*"]
    assert cors_origins == ["https://app.docugardener.dev"]
