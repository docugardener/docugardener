"""
ENT-12: SAML 2.0 endpoint unit tests.

Tests are designed to run without libxmlsec1 installed (mocks python3-saml).

Covers:
  A. /auth/saml/metadata — 404 when SSO not enabled
  B. /auth/saml/login — 404 when SSO not enabled, redirect when enabled
  C. /auth/saml/callback — invalid (errors), replay, authenticated success
  D. /auth/saml/exchange — consume token, invalid token rejected
  E. JIT provisioning — user created on first SSO login
  F. Role mapping — admin group maps to ADMIN role, others get VIEWER
"""

import time
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

# ── App fixture ───────────────────────────────────────────────────────────────


@pytest.fixture(scope="module")
def client():
    from src.main import app

    return TestClient(app, raise_server_exceptions=False)


# ── Tenant / User factory ─────────────────────────────────────────────────────


def make_tenant(
    sso_enabled=True,
    idp_entity_id="https://idp.example.com",
    idp_sso_url="https://idp.example.com/sso",
    idp_cert="FAKECERT",
    attr_email="email",
    attr_role="groups",
    role_map_admin="dg-admin",
):
    t = MagicMock()
    t.id = "t-test"
    t.ssoEnabled = sso_enabled
    t.samlIdpEntityId = idp_entity_id
    t.samlIdpSsoUrl = idp_sso_url
    t.samlIdpCertificate = idp_cert
    t.samlAttrEmail = attr_email
    t.samlAttrRole = attr_role
    t.samlRoleMapAdmin = role_map_admin
    t.samlDefaultRole = None  # BUG-SSO-05: default is None → falls back to "VIEWER" in saml.py
    return t


def make_user(email="user@example.com", role="VIEWER", tenant_id="t-test"):
    u = MagicMock()
    u.id = "u-test"
    u.email = email
    u.role = role
    u.tenantId = tenant_id
    return u


# ── A. Metadata ───────────────────────────────────────────────────────────────


class TestSamlMetadata:
    def test_404_when_sso_not_enabled(self, client):
        with patch("src.api.saml._get_tenant_by_id") as mock_tenant:
            mock_tenant.return_value = make_tenant(sso_enabled=False)
            res = client.get("/auth/saml/metadata?tenant_id=t-test")
        assert res.status_code == 404

    def test_404_when_tenant_not_found(self, client):
        with patch("src.api.saml._get_tenant_by_id") as mock_tenant:
            mock_tenant.return_value = None
            res = client.get("/auth/saml/metadata?tenant_id=nonexistent")
        assert res.status_code == 404

    def test_returns_xml_when_saml_available(self, client):
        """Returns metadata XML when python3-saml is installed."""
        mock_auth = MagicMock()
        mock_settings = MagicMock()
        mock_settings.get_sp_metadata.return_value = b"<EntityDescriptor/>"
        mock_settings.validate_metadata.return_value = []
        mock_auth.get_settings.return_value = mock_settings

        with (
            patch("src.api.saml._get_tenant_by_id") as mock_tenant,
            patch("src.api.saml._get_saml_auth", return_value=mock_auth),
        ):
            mock_tenant.return_value = make_tenant()
            res = client.get("/auth/saml/metadata?tenant_id=t-test")
        assert res.status_code == 200
        assert "xml" in res.headers.get("content-type", "")


# ── B. Login ──────────────────────────────────────────────────────────────────


class TestSamlLogin:
    def test_404_when_sso_not_enabled(self, client):
        with patch("src.api.saml._get_tenant_by_id") as mock_tenant:
            mock_tenant.return_value = make_tenant(sso_enabled=False)
            res = client.get("/auth/saml/login?tenant_id=t-test", follow_redirects=False)
        assert res.status_code == 404

    def test_redirects_to_idp(self, client):
        mock_auth = MagicMock()
        mock_auth.login.return_value = "https://idp.example.com/sso?SAMLRequest=ABC"

        with (
            patch("src.api.saml._get_tenant_by_id") as mock_tenant,
            patch("src.api.saml._get_saml_auth", return_value=mock_auth),
        ):
            mock_tenant.return_value = make_tenant()
            res = client.get("/auth/saml/login?tenant_id=t-test", follow_redirects=False)
        assert res.status_code == 302
        assert "idp.example.com" in res.headers["location"]


# ── C. Callback ───────────────────────────────────────────────────────────────


class TestSamlCallback:
    def _post_callback(self, client, relay_state="tenant_id=t-test", saml_response="FAKERESP"):
        return client.post(
            "/auth/saml/callback",
            data={"SAMLResponse": saml_response, "RelayState": relay_state},
            follow_redirects=False,
        )

    def test_400_when_no_tenant_in_relay_state(self, client):
        res = self._post_callback(client, relay_state="")
        assert res.status_code == 400

    def test_403_when_tenant_not_found(self, client):
        with patch("src.api.saml._get_tenant_by_id") as mock_tenant:
            mock_tenant.return_value = None
            res = self._post_callback(client)
        assert res.status_code == 403

    def test_401_when_saml_has_errors(self, client):
        mock_auth = MagicMock()
        mock_auth.process_response.return_value = None
        mock_auth.get_errors.return_value = ["invalid_response"]
        mock_auth.get_last_error_reason.return_value = "Signature mismatch"

        with (
            patch("src.api.saml._get_tenant_by_id") as mock_tenant,
            patch("src.api.saml._get_saml_auth", return_value=mock_auth),
        ):
            mock_tenant.return_value = make_tenant()
            res = self._post_callback(client)
        assert res.status_code == 401

    def test_401_when_not_authenticated(self, client):
        mock_auth = MagicMock()
        mock_auth.process_response.return_value = None
        mock_auth.get_errors.return_value = []
        mock_auth.is_authenticated.return_value = False

        with (
            patch("src.api.saml._get_tenant_by_id") as mock_tenant,
            patch("src.api.saml._get_saml_auth", return_value=mock_auth),
        ):
            mock_tenant.return_value = make_tenant()
            res = self._post_callback(client)
        assert res.status_code == 401

    def test_401_on_replay_attack(self, client):
        mock_auth = MagicMock()
        mock_auth.process_response.return_value = None
        mock_auth.get_errors.return_value = []
        mock_auth.is_authenticated.return_value = True
        mock_auth.get_last_message_id.return_value = "assertion-id-123"
        mock_auth.get_last_assertion_not_on_or_after.return_value = None
        mock_auth.get_attributes.return_value = {"email": ["user@example.com"]}
        mock_auth.get_nameid.return_value = "user@example.com"

        with (
            patch("src.api.saml._get_tenant_by_id") as mock_tenant,
            patch("src.api.saml._get_saml_auth", return_value=mock_auth),
            patch("src.api.saml._is_replay", return_value=True),  # Simulates replay
        ):
            mock_tenant.return_value = make_tenant()
            res = self._post_callback(client)
        assert res.status_code == 401
        assert "replay" in res.json()["detail"].lower()

    def test_redirects_to_saml_complete_on_success(self, client):
        mock_auth = MagicMock()
        mock_auth.process_response.return_value = None
        mock_auth.get_errors.return_value = []
        mock_auth.is_authenticated.return_value = True
        mock_auth.get_last_message_id.return_value = "assertion-id-unique"
        mock_auth.get_last_assertion_not_on_or_after.return_value = None
        mock_auth.get_attributes.return_value = {"email": ["user@example.com"]}
        mock_auth.get_nameid.return_value = "user@example.com"

        mock_user = make_user()

        with (
            patch("src.api.saml._get_tenant_by_id") as mock_tenant,
            patch("src.api.saml._get_saml_auth", return_value=mock_auth),
            patch("src.api.saml._is_replay", return_value=False),
            patch("src.api.saml._get_or_create_user", return_value=mock_user),
            patch("src.api.saml._store_exchange_token") as mock_store,
        ):
            mock_tenant.return_value = make_tenant()
            res = self._post_callback(client)

        assert res.status_code == 302
        assert "saml-complete" in res.headers["location"]
        assert "token=" in res.headers["location"]
        mock_store.assert_called_once()


# ── D. Exchange token ─────────────────────────────────────────────────────────


class TestSamlExchange:
    def test_401_for_invalid_token(self, client):
        with patch("src.api.saml._consume_exchange_token", return_value=None):
            res = client.get("/auth/saml/exchange?token=invalid")
        assert res.status_code == 401

    def test_401_for_expired_token(self, client):
        expired_payload = {
            "user_id": "u-1",
            "email": "user@example.com",
            "role": "VIEWER",
            "tenant_id": "t-1",
            "issued_at": time.time() - 999,  # Way past TTL
        }
        with patch("src.api.saml._consume_exchange_token", return_value=expired_payload):
            res = client.get("/auth/saml/exchange?token=old-token")
        assert res.status_code == 401

    def test_returns_user_data_for_valid_token(self, client):
        valid_payload = {
            "user_id": "u-1",
            "email": "user@example.com",
            "role": "VIEWER",
            "tenant_id": "t-1",
            "issued_at": time.time(),
        }
        with patch("src.api.saml._consume_exchange_token", return_value=valid_payload):
            res = client.get("/auth/saml/exchange?token=valid-token")
        assert res.status_code == 200
        data = res.json()
        assert data["email"] == "user@example.com"
        assert data["role"] == "VIEWER"


# ── E. JIT provisioning ───────────────────────────────────────────────────────


class TestJitProvisioning:
    def test_user_gets_viewer_role_by_default(self, client):
        mock_auth = MagicMock()
        mock_auth.process_response.return_value = None
        mock_auth.get_errors.return_value = []
        mock_auth.is_authenticated.return_value = True
        mock_auth.get_last_message_id.return_value = "agg-new"
        mock_auth.get_last_assertion_not_on_or_after.return_value = None
        mock_auth.get_attributes.return_value = {"email": ["newuser@example.com"]}
        mock_auth.get_nameid.return_value = "newuser@example.com"

        captured_role = {}

        def fake_get_or_create(email, tenant_id, role):
            captured_role["role"] = role
            return make_user(email=email, role=role)

        # Tenant has no role mapping configured
        tenant = make_tenant(attr_role="", role_map_admin="")

        with (
            patch("src.api.saml._get_tenant_by_id", return_value=tenant),
            patch("src.api.saml._get_saml_auth", return_value=mock_auth),
            patch("src.api.saml._is_replay", return_value=False),
            patch("src.api.saml._get_or_create_user", side_effect=fake_get_or_create),
            patch("src.api.saml._store_exchange_token"),
        ):
            client.post(
                "/auth/saml/callback",
                data={"SAMLResponse": "X", "RelayState": "tenant_id=t-test"},
                follow_redirects=False,
            )
        assert captured_role.get("role") == "VIEWER"


# ── F. Role mapping ───────────────────────────────────────────────────────────


# ── G. _build_request_data scheme detection ───────────────────────────────────


# ── H. First-user-ADMIN JIT provisioning ─────────────────────────────────────


class TestFirstUserAdmin:
    """
    _get_or_create_user() must promote the first SSO user in a tenant to ADMIN.
    All subsequent users keep the role resolved from the SAML assertion.
    """

    def _call(self, mock_db, email="user@example.com", tenant_id="t-test", role="VIEWER"):
        from src.api.saml import _get_or_create_user

        with patch("src.api.saml.SessionLocal", return_value=mock_db):
            return _get_or_create_user(email, tenant_id, role)

    def _make_db(self, existing_user=None, tenant_user_count=0):
        """Build a mock DB session. existing_user=None simulates new user."""
        db = MagicMock()
        query_mock = MagicMock()
        db.query.return_value = query_mock

        # Chain: db.query(User).filter(...).first() → existing_user
        filter_mock = MagicMock()
        query_mock.filter.return_value = filter_mock
        filter_mock.first.return_value = existing_user

        # Chain: db.query(User).filter(...).count() → tenant_user_count
        filter_mock.count.return_value = tenant_user_count

        db.add = MagicMock()
        db.commit = MagicMock()
        db.refresh = MagicMock(side_effect=lambda u: None)
        db.__enter__ = MagicMock(return_value=db)
        db.__exit__ = MagicMock(return_value=False)
        db.close = MagicMock()
        return db

    def test_first_user_in_tenant_gets_admin(self):
        """No existing users in tenant → new SSO user promoted to ADMIN."""
        db = self._make_db(existing_user=None, tenant_user_count=0)
        user = self._call(db, role="VIEWER")
        db.add.assert_called_once()
        created_user = db.add.call_args[0][0]
        assert created_user.role == "ADMIN"

    def test_first_user_viewer_role_overridden_to_admin(self):
        """Even if assertion resolves VIEWER, first user in tenant becomes ADMIN."""
        db = self._make_db(existing_user=None, tenant_user_count=0)
        self._call(db, role="VIEWER")
        created_user = db.add.call_args[0][0]
        assert created_user.role == "ADMIN"

    def test_second_user_keeps_viewer_role(self):
        """Tenant already has one user → second SSO user stays VIEWER."""
        db = self._make_db(existing_user=None, tenant_user_count=1)
        self._call(db, role="VIEWER")
        created_user = db.add.call_args[0][0]
        assert created_user.role == "VIEWER"

    def test_second_user_idp_mapped_admin_kept(self):
        """Tenant already has users but IdP explicitly maps this user to ADMIN → ADMIN."""
        db = self._make_db(existing_user=None, tenant_user_count=2)
        self._call(db, role="ADMIN")
        created_user = db.add.call_args[0][0]
        assert created_user.role == "ADMIN"

    def test_existing_user_role_not_changed(self):
        """User already in DB (returning login) → no DB write, role untouched."""
        existing = make_user(email="user@example.com", role="VIEWER")
        db = self._make_db(existing_user=existing, tenant_user_count=1)
        result = self._call(db, role="VIEWER")
        db.add.assert_not_called()
        assert result.role == "VIEWER"

    def test_first_user_correct_tenant_id_set(self):
        """First user created with the correct tenantId."""
        db = self._make_db(existing_user=None, tenant_user_count=0)
        self._call(db, tenant_id="tenant-abc", role="VIEWER")
        created_user = db.add.call_args[0][0]
        assert created_user.tenantId == "tenant-abc"


class TestBuildRequestDataScheme:
    """
    SEC-04 / Okta QA fix: _build_request_data must trust X-Forwarded-Proto so
    that the ACS URL matches when the app sits behind ngrok or a TLS-terminating
    reverse proxy.
    """

    def _make_request(self, url: str, headers: dict):
        scope = {
            "type": "http",
            "method": "GET",
            "path": "/auth/saml/callback",
            "query_string": b"",
            "headers": [(k.lower().encode(), v.encode()) for k, v in headers.items()],
            "server": ("localhost", 8000),
        }
        # Build a minimal Starlette Request from raw scope
        from starlette.requests import Request as SR

        req = SR(scope)
        return req

    def test_https_when_x_forwarded_proto_is_https(self):
        from unittest.mock import MagicMock

        from src.api.saml import _build_request_data

        req = MagicMock()
        req.headers = {"x-forwarded-proto": "https", "host": "example.ngrok.io"}
        req.url.scheme = "http"  # ngrok forwards as http internally
        req.url.port = None
        req.url.path = "/auth/saml/callback"
        req.query_params = {}

        data = _build_request_data(req)
        assert data["https"] == "on"
        assert data["server_port"] == 443

    def test_http_when_no_forwarded_proto_and_scheme_is_http(self):
        from unittest.mock import MagicMock

        from src.api.saml import _build_request_data

        req = MagicMock()
        req.headers = {"host": "localhost"}
        req.url.scheme = "http"
        req.url.port = 8000
        req.url.path = "/auth/saml/callback"
        req.query_params = {}

        data = _build_request_data(req)
        assert data["https"] == "off"
        assert data["server_port"] == 8000

    def test_https_when_scheme_is_https_directly(self):
        from unittest.mock import MagicMock

        from src.api.saml import _build_request_data

        req = MagicMock()
        req.headers = {"host": "app.docugardener.dev"}
        req.url.scheme = "https"
        req.url.port = None
        req.url.path = "/auth/saml/callback"
        req.query_params = {}

        data = _build_request_data(req)
        assert data["https"] == "on"
        assert data["server_port"] == 443


# ── F. Role mapping ───────────────────────────────────────────────────────────


class TestRoleMapping:
    def test_admin_group_maps_to_admin_role(self, client):
        mock_auth = MagicMock()
        mock_auth.process_response.return_value = None
        mock_auth.get_errors.return_value = []
        mock_auth.is_authenticated.return_value = True
        mock_auth.get_last_message_id.return_value = "agg-admin"
        mock_auth.get_last_assertion_not_on_or_after.return_value = None
        mock_auth.get_attributes.return_value = {
            "email": ["admin@example.com"],
            "groups": ["dg-admin", "developers"],
        }
        mock_auth.get_nameid.return_value = "admin@example.com"

        captured_role = {}

        def fake_get_or_create(email, tenant_id, role):
            captured_role["role"] = role
            return make_user(email=email, role=role)

        with (
            patch("src.api.saml._get_tenant_by_id", return_value=make_tenant()),
            patch("src.api.saml._get_saml_auth", return_value=mock_auth),
            patch("src.api.saml._is_replay", return_value=False),
            patch("src.api.saml._get_or_create_user", side_effect=fake_get_or_create),
            patch("src.api.saml._store_exchange_token"),
        ):
            client.post(
                "/auth/saml/callback",
                data={"SAMLResponse": "X", "RelayState": "tenant_id=t-test"},
                follow_redirects=False,
            )
        assert captured_role.get("role") == "ADMIN"
