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


def test_saml_routes_registered():
    """Verify SAML callback and SLO endpoints are registered in the FastAPI app."""
    from src.main import app

    # Some Starlette route entries (e.g. _IncludedRouter mounts) lack `.path`;
    # guard with getattr so introspection is robust across FastAPI/Starlette versions.
    routes = [getattr(r, "path", None) for r in app.routes]
    assert "/auth/saml/callback" in routes, f"SAML callback route missing. Routes: {routes}"
    assert "/auth/saml/logout" in routes, f"SAML SLO route missing. Routes: {routes}"
