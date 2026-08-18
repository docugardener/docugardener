# SPDX-License-Identifier: AGPL-3.0-or-later
"""
SEC-M1 / SEC-M3: CORS configuration — no wildcard origins, explicit methods/headers.

Verifies that:
  1. When ALLOWED_ORIGINS is unset in dev, cors_origins does NOT contain "*"
  2. When ALLOWED_ORIGINS is unset in dev, localhost defaults are used
  3. Explicit ALLOWED_ORIGINS are passed through unchanged
  4. allow_methods does not contain "*"
  5. allow_headers does not contain "*", and X-Tenant-ID is present
"""

from unittest.mock import patch

from src.core.config import settings


def _get_cors_middleware(app):
    """Extract CORSMiddleware kwargs from a FastAPI app's middleware stack."""
    from starlette.middleware.cors import CORSMiddleware as StarletteCORS

    for mw in app.user_middleware:
        if mw.cls is StarletteCORS:
            return mw.kwargs
    return None


# ── Test 1: no wildcard when ALLOWED_ORIGINS is empty (dev) ───────────────────


def test_cors_dev_fallback_is_not_wildcard():
    with (
        patch.object(settings, "allowed_origins", []),
        patch.object(settings, "app_env", "development"),
    ):
        from src.main import create_app

        app = create_app()
        cors = _get_cors_middleware(app)
        assert cors is not None
        assert "*" not in cors["allow_origins"], "Wildcard origin must not appear in dev fallback"


# ── Test 2: dev fallback includes localhost:3003 ──────────────────────────────


def test_cors_dev_fallback_includes_localhost():
    with (
        patch.object(settings, "allowed_origins", []),
        patch.object(settings, "app_env", "development"),
    ):
        from src.main import create_app

        app = create_app()
        cors = _get_cors_middleware(app)
        origins = cors["allow_origins"]
        assert any("localhost" in o for o in origins), (
            f"Expected localhost in dev CORS origins, got {origins}"
        )
        assert "http://localhost:3003" in origins


# ── Test 3: explicit origins are used when set ────────────────────────────────


def test_cors_explicit_origins_used():
    with patch.object(settings, "allowed_origins", ["https://app.example.com"]):
        from src.main import create_app

        app = create_app()
        cors = _get_cors_middleware(app)
        assert cors["allow_origins"] == ["https://app.example.com"]


# ── Test 4: allow_methods does not contain wildcard ───────────────────────────


def test_cors_methods_are_explicit():
    with patch.object(settings, "allowed_origins", ["https://app.example.com"]):
        from src.main import create_app

        app = create_app()
        cors = _get_cors_middleware(app)
        methods = cors.get("allow_methods", [])
        assert "*" not in methods, f"Wildcard method must not appear: {methods}"
        assert "GET" in methods
        assert "POST" in methods


# ── Test 5: allow_headers does not contain wildcard, includes X-Tenant-ID ─────


def test_cors_headers_are_explicit():
    with patch.object(settings, "allowed_origins", ["https://app.example.com"]):
        from src.main import create_app

        app = create_app()
        cors = _get_cors_middleware(app)
        headers = cors.get("allow_headers", [])
        assert "*" not in headers, f"Wildcard header must not appear: {headers}"
        assert "X-Tenant-ID" in headers
        assert "Authorization" in headers
        assert "Content-Type" in headers
