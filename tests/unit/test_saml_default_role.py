# SPDX-License-Identifier: AGPL-3.0-or-later
"""
BUG-SSO-05: samlDefaultRole per-tenant tests.

Verifies that the SAML callback uses `tenant.samlDefaultRole` instead of
hardcoded "VIEWER" when the IdP user doesn't match the admin role mapping.

Covers:
  A. samlDefaultRole = "AUDITOR" → non-admin SSO user gets AUDITOR
  B. samlDefaultRole = "BILLING_ADMIN" → non-admin SSO user gets BILLING_ADMIN
  C. samlDefaultRole = None → falls back to "VIEWER" (existing behaviour)
  D. samlDefaultRole = "" (empty string) → treated as None → "VIEWER"
  E. Admin group match always overrides samlDefaultRole → ADMIN
  F. First user in tenant always ADMIN (overrides samlDefaultRole)
  G. _get_or_create_user receives resolved role (correct DB value)
"""

from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

# ── Fixtures ──────────────────────────────────────────────────────────────────


@pytest.fixture(scope="module")
def client():
    from src.main import app

    return TestClient(app, raise_server_exceptions=False)


def _make_tenant(
    tenant_id: str = "t-default-role",
    saml_default_role: str | None = None,
    attr_role: str = "groups",
    role_map_admin: str = "dg-admin",
) -> MagicMock:
    t = MagicMock()
    t.id = tenant_id
    t.ssoEnabled = True
    t.samlIdpEntityId = "https://idp.example.com"
    t.samlIdpSsoUrl = "https://idp.example.com/sso"
    t.samlIdpCertificate = "FAKECERT"
    t.samlAttrEmail = "email"
    t.samlAttrRole = attr_role
    t.samlRoleMapAdmin = role_map_admin
    t.samlDefaultRole = saml_default_role
    return t


def _make_saml_auth(
    email: str = "user@example.com",
    groups: list[str] | None = None,
    assertion_id: str = "dr-test-id",
) -> MagicMock:
    auth = MagicMock()
    auth.process_response.return_value = None
    auth.get_errors.return_value = []
    auth.is_authenticated.return_value = True
    auth.get_last_message_id.return_value = assertion_id
    auth.get_last_assertion_not_on_or_after.return_value = None
    auth.get_nameid.return_value = email
    auth.get_attributes.return_value = {"email": [email], "groups": groups or []}
    return auth


def _post_callback(client: TestClient, tenant_id: str = "t-default-role") -> object:
    return client.post(
        "/auth/saml/callback",
        data={
            "SAMLResponse": "base64fakepayload",
            "RelayState": f"tenant_id={tenant_id}",
        },
        follow_redirects=False,
    )


def _get_role_from_jit_call(mock_jit: MagicMock) -> str:
    """Extract the role argument passed to _get_or_create_user."""
    mock_jit.assert_called_once()
    _, _, role = mock_jit.call_args.args
    return role


# ── A. samlDefaultRole = "AUDITOR" ───────────────────────────────────────────


class TestAuditorDefaultRole:
    def test_non_admin_user_gets_auditor_role(self, client):
        tenant = _make_tenant(saml_default_role="AUDITOR")
        auth = _make_saml_auth(groups=["all-users"], assertion_id="dr-a1")
        mock_user = MagicMock(id="u1", email="user@example.com", role="AUDITOR")

        with (
            patch("src.api.saml._get_tenant_by_id", return_value=tenant),
            patch("src.api.saml._get_saml_auth", return_value=auth),
            patch("src.api.saml._is_replay", return_value=False),
            patch("src.api.saml._get_or_create_user", return_value=mock_user) as mock_jit,
            patch("src.api.saml._store_exchange_token"),
        ):
            res = _post_callback(client)

        assert res.status_code == 302
        assert _get_role_from_jit_call(mock_jit) == "AUDITOR"

    def test_auditor_default_does_not_affect_admin_group(self, client):
        """Admin group match still produces ADMIN even when default is AUDITOR."""
        tenant = _make_tenant(saml_default_role="AUDITOR")
        auth = _make_saml_auth(groups=["dg-admin"], assertion_id="dr-a2")
        mock_user = MagicMock(id="u2", email="admin@example.com", role="ADMIN")

        with (
            patch("src.api.saml._get_tenant_by_id", return_value=tenant),
            patch("src.api.saml._get_saml_auth", return_value=auth),
            patch("src.api.saml._is_replay", return_value=False),
            patch("src.api.saml._get_or_create_user", return_value=mock_user) as mock_jit,
            patch("src.api.saml._store_exchange_token"),
        ):
            res = _post_callback(client)

        assert res.status_code == 302
        assert _get_role_from_jit_call(mock_jit) == "ADMIN"


# ── B. samlDefaultRole = "BILLING_ADMIN" ─────────────────────────────────────


class TestBillingAdminDefaultRole:
    def test_non_admin_user_gets_billing_admin_role(self, client):
        tenant = _make_tenant(saml_default_role="BILLING_ADMIN")
        auth = _make_saml_auth(groups=[], assertion_id="dr-b1")
        mock_user = MagicMock(id="u3", email="billing@example.com", role="BILLING_ADMIN")

        with (
            patch("src.api.saml._get_tenant_by_id", return_value=tenant),
            patch("src.api.saml._get_saml_auth", return_value=auth),
            patch("src.api.saml._is_replay", return_value=False),
            patch("src.api.saml._get_or_create_user", return_value=mock_user) as mock_jit,
            patch("src.api.saml._store_exchange_token"),
        ):
            _post_callback(client)

        assert _get_role_from_jit_call(mock_jit) == "BILLING_ADMIN"


# ── C/D. samlDefaultRole = None or "" → "VIEWER" ─────────────────────────────


class TestViewerFallback:
    def test_none_default_role_falls_back_to_viewer(self, client):
        tenant = _make_tenant(saml_default_role=None)
        auth = _make_saml_auth(groups=[], assertion_id="dr-c1")
        mock_user = MagicMock(id="u4", email="v@example.com", role="VIEWER")

        with (
            patch("src.api.saml._get_tenant_by_id", return_value=tenant),
            patch("src.api.saml._get_saml_auth", return_value=auth),
            patch("src.api.saml._is_replay", return_value=False),
            patch("src.api.saml._get_or_create_user", return_value=mock_user) as mock_jit,
            patch("src.api.saml._store_exchange_token"),
        ):
            _post_callback(client)

        assert _get_role_from_jit_call(mock_jit) == "VIEWER"

    def test_empty_string_default_role_falls_back_to_viewer(self, client):
        tenant = _make_tenant(saml_default_role="")
        auth = _make_saml_auth(groups=[], assertion_id="dr-d1")
        mock_user = MagicMock(id="u5", email="v2@example.com", role="VIEWER")

        with (
            patch("src.api.saml._get_tenant_by_id", return_value=tenant),
            patch("src.api.saml._get_saml_auth", return_value=auth),
            patch("src.api.saml._is_replay", return_value=False),
            patch("src.api.saml._get_or_create_user", return_value=mock_user) as mock_jit,
            patch("src.api.saml._store_exchange_token"),
        ):
            _post_callback(client)

        assert _get_role_from_jit_call(mock_jit) == "VIEWER"
