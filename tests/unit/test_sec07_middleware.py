"""
SEC-07: TenantContextMiddleware enforcement — unit tests.

Covers:
  1. Protected route without X-Tenant-ID → 401
  2. Protected route with X-Tenant-ID → passes middleware (reaches route)
  3. /health without X-Tenant-ID → 200 (public path, no auth needed)
  4. /webhooks/* without X-Tenant-ID → reaches route (self-auth prefix)
  5. /check/* without X-Tenant-ID → reaches route (self-auth prefix)
  6. /auth/saml/* without X-Tenant-ID → reaches route (self-auth prefix)
  7. /scim/v2/* without X-Tenant-ID → reaches route (self-auth prefix)
"""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from src.api.middleware import TenantContextMiddleware


# ── Minimal test app (does NOT import main.py to avoid lifespan/DB deps) ───────

def _make_test_app() -> FastAPI:
    """Lightweight FastAPI app with just the middleware and minimal routes."""
    app = FastAPI()
    app.add_middleware(TenantContextMiddleware)

    @app.get("/health")
    def health():
        return {"status": "ok"}

    @app.get("/ready")
    def ready():
        return {"ready": True}

    @app.get("/inbox/test")
    def inbox_test():
        return {"route": "inbox"}

    @app.get("/repos/owner/repo/contents/file.js")
    def repos_test():
        return {"route": "repos"}

    @app.post("/webhooks/github")
    def webhook_test():
        return {"route": "webhooks"}

    @app.get("/check/status")
    def check_test():
        return {"route": "check"}

    @app.get("/auth/saml/login")
    def saml_test():
        return {"route": "saml"}

    @app.get("/scim/v2/Users")
    def scim_users():
        return {"route": "scim"}

    @app.get("/scim/v2/ServiceProviderConfig")
    def scim_config():
        return {"route": "scim-config"}

    return app


@pytest.fixture(scope="module")
def client():
    return TestClient(_make_test_app(), raise_server_exceptions=False)


# ── Protected routes: enforce tenant header ─────────────────────────────────

class TestProtectedRoutes:

    def test_inbox_without_tenant_header_returns_401(self, client):
        """/inbox/* without X-Tenant-ID → 401 Unauthorized."""
        response = client.get("/inbox/test")
        assert response.status_code == 401
        assert "Missing X-Tenant-ID" in response.text

    def test_repos_without_tenant_header_returns_401(self, client):
        """/repos/* without X-Tenant-ID → 401 Unauthorized."""
        response = client.get("/repos/owner/repo/contents/file.js")
        assert response.status_code == 401

    def test_inbox_with_tenant_header_passes_middleware(self, client):
        """/inbox/* with X-Tenant-ID → middleware passes (route responds)."""
        response = client.get("/inbox/test", headers={"X-Tenant-ID": "tenant-abc"})
        # Middleware passed — route returns 200
        assert response.status_code == 200
        assert response.json()["route"] == "inbox"

    def test_repos_with_tenant_header_passes_middleware(self, client):
        """/repos/* with X-Tenant-ID → middleware passes."""
        response = client.get(
            "/repos/owner/repo/contents/file.js",
            headers={"X-Tenant-ID": "tenant-abc"},
        )
        assert response.status_code == 200


# ── Public paths: no auth required ──────────────────────────────────────────

class TestPublicPaths:

    def test_health_without_tenant_header_returns_200(self, client):
        """/health is public — no X-Tenant-ID required."""
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json()["status"] == "ok"

    def test_ready_without_tenant_header_returns_200(self, client):
        """/ready is public — no X-Tenant-ID required."""
        response = client.get("/ready")
        assert response.status_code == 200


# ── Self-auth routes: bypass tenant header check ─────────────────────────────

class TestSelfAuthRoutes:

    def test_webhooks_without_tenant_header_not_blocked(self, client):
        """/webhooks/* uses HMAC auth — must NOT be blocked by middleware."""
        response = client.post("/webhooks/github")
        # Middleware did not return 401 — route responded (200)
        assert response.status_code != 401

    def test_check_without_tenant_header_not_blocked(self, client):
        """/check/* uses API-key auth — must NOT be blocked by middleware."""
        response = client.get("/check/status")
        assert response.status_code != 401

    def test_saml_without_tenant_header_not_blocked(self, client):
        """/auth/saml/* uses SAML flow — must NOT be blocked by middleware."""
        response = client.get("/auth/saml/login")
        assert response.status_code != 401

    def test_scim_users_without_tenant_header_not_blocked(self, client):
        """/scim/v2/Users uses Bearer token auth — must NOT be blocked by middleware."""
        response = client.get("/scim/v2/Users")
        assert response.status_code != 401

    def test_scim_config_without_tenant_header_not_blocked(self, client):
        """/scim/v2/ServiceProviderConfig uses Bearer token auth — must NOT be blocked."""
        response = client.get("/scim/v2/ServiceProviderConfig")
        assert response.status_code != 401
