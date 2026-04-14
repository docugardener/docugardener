"""
ENT-12 SCIM 2.0 — unit tests for src/api/scim.py

Covers:
  - Authentication: valid token → 200, invalid → 401, no header → 401
  - GET  /scim/v2/ServiceProviderConfig
  - GET  /scim/v2/Schemas
  - GET  /scim/v2/Users (list, filter by userName)
  - POST /scim/v2/Users (create, idempotent re-create, conflict on cross-tenant)
  - GET  /scim/v2/Users/{id} (found, not found)
  - PUT  /scim/v2/Users/{id} (full replace including deactivation)
  - PATCH /scim/v2/Users/{id} (active=false, role change, bulk value dict)
  - DELETE /scim/v2/Users/{id} (deactivation, 204)
  - Helper: _parse_filter, _role_from_scim, _hash_token
"""

import hashlib
from datetime import datetime
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient


# ── App fixture ────────────────────────────────────────────────────────────────

@pytest.fixture
def client():
    from src.main import app
    return TestClient(app, raise_server_exceptions=False)


# ── Shared helpers ─────────────────────────────────────────────────────────────

RAW_TOKEN = "test-scim-token-abc123"
TOKEN_HASH = hashlib.sha256(RAW_TOKEN.encode()).hexdigest()
TENANT_ID = "tenant-scim-test"
USER_ID = "user-scim-001"

VALID_HEADERS = {"Authorization": f"Bearer {RAW_TOKEN}"}


def _make_tenant():
    t = MagicMock()
    t.id = TENANT_ID
    t.scimEnabled = True
    t.scimBearerTokenHash = TOKEN_HASH
    t.scimLastSyncAt = None
    return t


def _make_user(active=True, role="VIEWER"):
    u = MagicMock()
    u.id = USER_ID
    u.email = "alice@example.com"
    u.name = "Alice Smith"
    u.role = role
    u.tenantId = TENANT_ID
    u.externalId = "ext-001"
    u.scimActive = active
    u.createdAt = datetime(2026, 3, 10, 12, 0, 0)
    u.updatedAt = datetime(2026, 3, 10, 12, 0, 0)
    return u


# ── Helper unit tests ──────────────────────────────────────────────────────────

class TestHelpers:
    def test_hash_token(self):
        from src.api.scim import _hash_token
        assert _hash_token(RAW_TOKEN) == TOKEN_HASH

    def test_parse_filter_username(self):
        from src.api.scim import _parse_filter
        result = _parse_filter('userName eq "alice@example.com"')
        assert result == ("username", "alice@example.com")

    def test_parse_filter_emails(self):
        from src.api.scim import _parse_filter
        result = _parse_filter('emails.value eq "bob@example.com"')
        assert result == ("emails.value", "bob@example.com")

    def test_parse_filter_invalid(self):
        from src.api.scim import _parse_filter
        assert _parse_filter("id pr") is None
        assert _parse_filter("") is None

    def test_role_from_scim_admin(self):
        from src.api.scim import _role_from_scim
        assert _role_from_scim([{"value": "ADMIN", "primary": True}]) == "ADMIN"

    def test_role_from_scim_auditor(self):
        from src.api.scim import _role_from_scim
        assert _role_from_scim([{"value": "AUDITOR"}]) == "AUDITOR"

    def test_role_from_scim_invalid_defaults_viewer(self):
        from src.api.scim import _role_from_scim
        assert _role_from_scim([{"value": "SUPERUSER"}]) == "VIEWER"

    def test_role_from_scim_empty_defaults_viewer(self):
        from src.api.scim import _role_from_scim
        assert _role_from_scim(None) == "VIEWER"
        assert _role_from_scim([]) == "VIEWER"


# ── Authentication ─────────────────────────────────────────────────────────────

class TestScimAuth:
    def test_missing_authorization_header_returns_401(self, client):
        with patch("src.api.scim.SessionLocal") as mock_sl:
            response = client.get("/scim/v2/ServiceProviderConfig")
        assert response.status_code == 401

    def test_invalid_token_returns_401(self, client):
        with patch("src.api.scim.SessionLocal") as mock_sl:
            mock_db = MagicMock()
            mock_sl.return_value = mock_db
            mock_db.query.return_value.filter.return_value.first.return_value = None
            response = client.get(
                "/scim/v2/ServiceProviderConfig",
                headers={"Authorization": "Bearer wrong-token"},
            )
        assert response.status_code == 401

    def test_valid_token_resolves_tenant(self, client):
        tenant = _make_tenant()
        with patch("src.api.scim.SessionLocal") as mock_sl:
            mock_db = MagicMock()
            mock_sl.return_value = mock_db
            mock_db.query.return_value.filter.return_value.first.return_value = tenant
            response = client.get("/scim/v2/ServiceProviderConfig", headers=VALID_HEADERS)
        assert response.status_code == 200


# ── ServiceProviderConfig ──────────────────────────────────────────────────────

class TestServiceProviderConfig:
    def test_returns_scim_schema(self, client):
        tenant = _make_tenant()
        with patch("src.api.scim.SessionLocal") as mock_sl:
            mock_db = MagicMock()
            mock_sl.return_value = mock_db
            mock_db.query.return_value.filter.return_value.first.return_value = tenant
            response = client.get("/scim/v2/ServiceProviderConfig", headers=VALID_HEADERS)
        data = response.json()
        assert "urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig" in data["schemas"]
        assert data["patch"]["supported"] is True
        assert data["filter"]["supported"] is True


# ── Schemas ────────────────────────────────────────────────────────────────────

class TestSchemas:
    def test_returns_user_schema(self, client):
        tenant = _make_tenant()
        with patch("src.api.scim.SessionLocal") as mock_sl:
            mock_db = MagicMock()
            mock_sl.return_value = mock_db
            mock_db.query.return_value.filter.return_value.first.return_value = tenant
            response = client.get("/scim/v2/Schemas", headers=VALID_HEADERS)
        assert response.status_code == 200
        data = response.json()
        assert data["totalResults"] == 1
        assert data["Resources"][0]["id"] == "urn:ietf:params:scim:schemas:core:2.0:User"


# ── GET /Users ─────────────────────────────────────────────────────────────────

class TestListUsers:
    def _db_with_users(self, mock_sl, tenant, users):
        mock_db = MagicMock()
        mock_sl.return_value = mock_db
        # First call resolves tenant (auth), second is the user query
        q1 = MagicMock()
        q1.filter.return_value.first.return_value = tenant
        q2 = MagicMock()
        q2.filter.return_value = q2
        q2.count.return_value = len(users)
        q2.offset.return_value.limit.return_value.all.return_value = users
        mock_db.query.side_effect = [q1, q2]

    def test_list_returns_all_users(self, client):
        tenant = _make_tenant()
        users = [_make_user()]
        with patch("src.api.scim.SessionLocal") as mock_sl:
            self._db_with_users(mock_sl, tenant, users)
            response = client.get("/scim/v2/Users", headers=VALID_HEADERS)
        assert response.status_code == 200
        data = response.json()
        assert data["totalResults"] == 1
        assert data["Resources"][0]["userName"] == "alice@example.com"

    def test_filter_by_username(self, client):
        tenant = _make_tenant()
        users = [_make_user()]
        with patch("src.api.scim.SessionLocal") as mock_sl:
            self._db_with_users(mock_sl, tenant, users)
            response = client.get(
                '/scim/v2/Users?filter=userName+eq+"alice%40example.com"',
                headers=VALID_HEADERS,
            )
        assert response.status_code == 200

    def test_active_flag_in_response(self, client):
        tenant = _make_tenant()
        users = [_make_user(active=False)]
        with patch("src.api.scim.SessionLocal") as mock_sl:
            self._db_with_users(mock_sl, tenant, users)
            response = client.get("/scim/v2/Users", headers=VALID_HEADERS)
        data = response.json()
        assert data["Resources"][0]["active"] is False


# ── POST /Users ────────────────────────────────────────────────────────────────

class TestCreateUser:
    def test_create_new_user_returns_201(self, client):
        tenant = _make_tenant()
        new_user = _make_user()
        with patch("src.api.scim.SessionLocal") as mock_sl:
            mock_db = MagicMock()
            mock_sl.return_value = mock_db
            q_tenant = MagicMock()
            q_tenant.filter.return_value.first.return_value = tenant
            q_existing = MagicMock()
            q_existing.filter.return_value.first.return_value = None  # no existing user
            q_update = MagicMock()
            mock_db.query.side_effect = [q_tenant, q_existing, q_update]
            mock_db.refresh.side_effect = lambda u: None
            # attach fields after add
            mock_db.add.side_effect = lambda u: setattr(u, "createdAt", datetime(2026, 3, 10)) or setattr(u, "updatedAt", datetime(2026, 3, 10))
            response = client.post(
                "/scim/v2/Users",
                headers={**VALID_HEADERS, "Content-Type": "application/json"},
                json={
                    "schemas": ["urn:ietf:params:scim:schemas:core:2.0:User"],
                    "userName": "alice@example.com",
                    "name": {"givenName": "Alice", "familyName": "Smith"},
                    "active": True,
                    "roles": [{"value": "VIEWER", "primary": True}],
                },
            )
        assert response.status_code == 201
        data = response.json()
        assert data["userName"] == "alice@example.com"

    def test_idempotent_create_returns_existing_user(self, client):
        tenant = _make_tenant()
        existing = _make_user()
        with patch("src.api.scim.SessionLocal") as mock_sl:
            mock_db = MagicMock()
            mock_sl.return_value = mock_db
            q_tenant = MagicMock()
            q_tenant.filter.return_value.first.return_value = tenant
            q_existing = MagicMock()
            q_existing.filter.return_value.first.return_value = existing
            mock_db.query.side_effect = [q_tenant, q_existing]
            response = client.post(
                "/scim/v2/Users",
                headers={**VALID_HEADERS, "Content-Type": "application/json"},
                json={"userName": "alice@example.com"},
            )
        assert response.status_code == 200  # idempotent

    def test_cross_tenant_conflict_returns_409(self, client):
        tenant = _make_tenant()
        conflict_user = _make_user()
        conflict_user.tenantId = "other-tenant"
        with patch("src.api.scim.SessionLocal") as mock_sl:
            mock_db = MagicMock()
            mock_sl.return_value = mock_db
            q_tenant = MagicMock()
            q_tenant.filter.return_value.first.return_value = tenant
            q_existing = MagicMock()
            q_existing.filter.return_value.first.return_value = conflict_user
            mock_db.query.side_effect = [q_tenant, q_existing]
            response = client.post(
                "/scim/v2/Users",
                headers={**VALID_HEADERS, "Content-Type": "application/json"},
                json={"userName": "alice@example.com"},
            )
        assert response.status_code == 409

    def test_missing_username_returns_400(self, client):
        tenant = _make_tenant()
        with patch("src.api.scim.SessionLocal") as mock_sl:
            mock_db = MagicMock()
            mock_sl.return_value = mock_db
            mock_db.query.return_value.filter.return_value.first.return_value = tenant
            response = client.post(
                "/scim/v2/Users",
                headers={**VALID_HEADERS, "Content-Type": "application/json"},
                json={"displayName": "No Email"},
            )
        assert response.status_code == 400


# ── GET /Users/{id} ────────────────────────────────────────────────────────────

class TestGetUser:
    def test_found(self, client):
        tenant = _make_tenant()
        user = _make_user()
        with patch("src.api.scim.SessionLocal") as mock_sl:
            mock_db = MagicMock()
            mock_sl.return_value = mock_db
            q1 = MagicMock()
            q1.filter.return_value.first.return_value = tenant
            q2 = MagicMock()
            q2.filter.return_value.first.return_value = user
            mock_db.query.side_effect = [q1, q2]
            response = client.get(f"/scim/v2/Users/{USER_ID}", headers=VALID_HEADERS)
        assert response.status_code == 200
        assert response.json()["id"] == USER_ID

    def test_not_found_returns_404(self, client):
        tenant = _make_tenant()
        with patch("src.api.scim.SessionLocal") as mock_sl:
            mock_db = MagicMock()
            mock_sl.return_value = mock_db
            q1 = MagicMock()
            q1.filter.return_value.first.return_value = tenant
            q2 = MagicMock()
            q2.filter.return_value.first.return_value = None
            mock_db.query.side_effect = [q1, q2]
            response = client.get(f"/scim/v2/Users/missing-id", headers=VALID_HEADERS)
        assert response.status_code == 404


# ── PUT /Users/{id} ────────────────────────────────────────────────────────────

class TestReplaceUser:
    def test_deactivate_via_put(self, client):
        tenant = _make_tenant()
        user = _make_user(active=True)
        with patch("src.api.scim.SessionLocal") as mock_sl:
            mock_db = MagicMock()
            mock_sl.return_value = mock_db
            q1 = MagicMock()
            q1.filter.return_value.first.return_value = tenant
            q2 = MagicMock()
            q2.filter.return_value.first.return_value = user
            q3 = MagicMock()  # tenant update
            mock_db.query.side_effect = [q1, q2, q3]
            response = client.put(
                f"/scim/v2/Users/{USER_ID}",
                headers={**VALID_HEADERS, "Content-Type": "application/json"},
                json={"userName": "alice@example.com", "active": False},
            )
        assert response.status_code == 200
        assert user.scimActive is False

    def test_role_change_via_put(self, client):
        tenant = _make_tenant()
        user = _make_user(role="VIEWER")
        with patch("src.api.scim.SessionLocal") as mock_sl:
            mock_db = MagicMock()
            mock_sl.return_value = mock_db
            q1 = MagicMock()
            q1.filter.return_value.first.return_value = tenant
            q2 = MagicMock()
            q2.filter.return_value.first.return_value = user
            q3 = MagicMock()
            mock_db.query.side_effect = [q1, q2, q3]
            response = client.put(
                f"/scim/v2/Users/{USER_ID}",
                headers={**VALID_HEADERS, "Content-Type": "application/json"},
                json={
                    "userName": "alice@example.com",
                    "active": True,
                    "roles": [{"value": "ADMIN", "primary": True}],
                },
            )
        assert response.status_code == 200
        assert user.role == "ADMIN"


# ── PATCH /Users/{id} ─────────────────────────────────────────────────────────

class TestPatchUser:
    def _patch_response(self, client, user, patch_body):
        tenant = _make_tenant()
        with patch("src.api.scim.SessionLocal") as mock_sl:
            mock_db = MagicMock()
            mock_sl.return_value = mock_db
            q1 = MagicMock()
            q1.filter.return_value.first.return_value = tenant
            q2 = MagicMock()
            q2.filter.return_value.first.return_value = user
            q3 = MagicMock()
            mock_db.query.side_effect = [q1, q2, q3]
            return client.patch(
                f"/scim/v2/Users/{USER_ID}",
                headers={**VALID_HEADERS, "Content-Type": "application/json"},
                json=patch_body,
            )

    def test_deactivate_via_patch_active_false(self, client):
        user = _make_user(active=True)
        response = self._patch_response(client, user, {
            "schemas": ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
            "Operations": [{"op": "replace", "path": "active", "value": False}],
        })
        assert response.status_code == 200
        assert user.scimActive is False

    def test_reactivate_via_patch(self, client):
        user = _make_user(active=False)
        response = self._patch_response(client, user, {
            "schemas": ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
            "Operations": [{"op": "replace", "path": "active", "value": True}],
        })
        assert response.status_code == 200
        assert user.scimActive is True

    def test_bulk_value_dict_patch(self, client):
        user = _make_user(active=True, role="VIEWER")
        response = self._patch_response(client, user, {
            "schemas": ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
            "Operations": [
                {
                    "op": "replace",
                    "value": {"active": False, "roles": [{"value": "ADMIN"}]},
                }
            ],
        })
        assert response.status_code == 200
        assert user.scimActive is False
        assert user.role == "ADMIN"

    def test_patch_not_found_returns_404(self, client):
        tenant = _make_tenant()
        with patch("src.api.scim.SessionLocal") as mock_sl:
            mock_db = MagicMock()
            mock_sl.return_value = mock_db
            q1 = MagicMock()
            q1.filter.return_value.first.return_value = tenant
            q2 = MagicMock()
            q2.filter.return_value.first.return_value = None
            mock_db.query.side_effect = [q1, q2]
            response = client.patch(
                "/scim/v2/Users/missing",
                headers={**VALID_HEADERS, "Content-Type": "application/json"},
                json={
                    "schemas": ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
                    "Operations": [{"op": "replace", "path": "active", "value": False}],
                },
            )
        assert response.status_code == 404


# ── DELETE /Users/{id} ────────────────────────────────────────────────────────

class TestDeleteUser:
    def test_delete_deactivates_user_and_returns_204(self, client):
        tenant = _make_tenant()
        user = _make_user(active=True)
        with patch("src.api.scim.SessionLocal") as mock_sl:
            mock_db = MagicMock()
            mock_sl.return_value = mock_db
            q1 = MagicMock()
            q1.filter.return_value.first.return_value = tenant
            q2 = MagicMock()
            q2.filter.return_value.first.return_value = user
            q3 = MagicMock()
            mock_db.query.side_effect = [q1, q2, q3]
            response = client.delete(f"/scim/v2/Users/{USER_ID}", headers=VALID_HEADERS)
        assert response.status_code == 204
        assert user.scimActive is False

    def test_delete_not_found_returns_404(self, client):
        tenant = _make_tenant()
        with patch("src.api.scim.SessionLocal") as mock_sl:
            mock_db = MagicMock()
            mock_sl.return_value = mock_db
            q1 = MagicMock()
            q1.filter.return_value.first.return_value = tenant
            q2 = MagicMock()
            q2.filter.return_value.first.return_value = None
            mock_db.query.side_effect = [q1, q2]
            response = client.delete("/scim/v2/Users/missing", headers=VALID_HEADERS)
        assert response.status_code == 404
