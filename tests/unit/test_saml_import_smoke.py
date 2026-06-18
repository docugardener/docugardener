# SPDX-License-Identifier: AGPL-3.0-or-later
"""Smoke tests: python3-saml importable + SAML routes registered.

These tests are designed to run inside the Docker container where libxmlsec1-dev
is installed. They are skipped locally when the package is not available.
"""

import importlib

import pytest

# Skip entire module if python3-saml (onelogin) is not installed.
# In CI/Docker these pass; locally they skip cleanly.
onelogin = pytest.importorskip("onelogin.saml2.auth", reason="python3-saml not installed locally")


def test_python3_saml_importable():
    """Verify python3-saml and its C deps are installed correctly."""
    mod = importlib.import_module("onelogin.saml2.auth")
    assert mod is not None


def _collect_route_paths(routes: list) -> list[str]:
    """Recursively collect route paths, robust across FastAPI/Starlette versions.

    FastAPI >= 0.129 wraps ``include_router`` results in ``_IncludedRouter``
    objects that have no ``.path`` and expose their sub-routes via
    ``.original_router.routes`` instead of flattening them into ``app.routes``.
    Older versions flatten included routes as ``APIRoute`` with ``.path``.
    This walks both shapes (plus Starlette ``Mount.routes``).
    """
    paths: list[str] = []
    for route in routes:
        path = getattr(route, "path", None)
        if path is not None:
            paths.append(path)
        original_router = getattr(route, "original_router", None)
        sub_routes = getattr(original_router, "routes", None)
        if sub_routes is None:
            sub_routes = getattr(route, "routes", None)
        if sub_routes:
            paths.extend(_collect_route_paths(sub_routes))
    return paths


def test_saml_routes_registered():
    """Verify SAML callback and SLO endpoints are registered in the FastAPI app."""
    from src.main import app

    routes = _collect_route_paths(list(app.routes))
    assert "/auth/saml/callback" in routes, f"SAML callback route missing. Routes: {routes}"
    assert "/auth/saml/logout" in routes, f"SAML SLO route missing. Routes: {routes}"
