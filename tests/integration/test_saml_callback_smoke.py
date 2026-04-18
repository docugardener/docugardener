# SPDX-License-Identifier: AGPL-3.0-or-later
"""
TEST-SSO-02: Smoke tests for POST /auth/saml/callback.

Focuses on the endpoint's role resolution, redirect, and error paths.
_get_or_create_user is mocked here — SSO-01 already covers JIT DB integration.
python3-saml is mocked (no libxmlsec1 needed).

Covers:
  A. Admin IdP group → ADMIN role passed to _get_or_create_user
  B. No matching group → VIEWER role passed to _get_or_create_user
  C. First SSO call → redirect to /auth/saml-complete with token
  D. Exchange token is one-time-use (second /auth/saml/exchange → 401)
  E. Expired SAML assertion → 401
  F. Replay attack → 401, _get_or_create_user never called
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
    tenant_id: str = "t-smoke",
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
    t.samlDefaultRole = None  # BUG-SSO-05: None -> "VIEWER" fallback in saml.py
    return t


def _make_saml_auth(
    email: str = "user@example.com",
    groups: list[str] | None = None,
    is_authenticated: bool = True,
    assertion_id: str = "test-assertion-id",
    not_on_or_after: float | None = None,
) -> MagicMock:
    auth = MagicMock()
    auth.process_response.return_value = None
    auth.get_errors.return_value = []
    auth.is_authenticated.return_value = is_authenticated
    auth.get_last_message_id.return_value = assertion_id
    auth.get_last_assertion_not_on_or_after.return_value = not_on_or_after
    auth.get_nameid.return_value = email
    auth.get_attributes.return_value = {
        "email": [email],
        "groups": groups or [],
    }
    return auth


def _make_user(email: str = "user@example.com", role: str = "VIEWER") -> MagicMock:
    u = MagicMock()
    u.id = "u-test"
    u.email = email
    u.role = role
    return u


def _post_callback(client: TestClient, tenant_id: str = "t-smoke") -> object:
    # tenant_id must be in RelayState (not query param)
    return client.post(
        "/auth/saml/callback",
        data={
            "SAMLResponse": "base64fakepayload",
            "RelayState": f"tenant_id={tenant_id}",
        },
        follow_redirects=False,
    )


# ── A. Admin IdP group → ADMIN role ──────────────────────────────────────────


class TestRoleResolution:
    def test_admin_group_passes_admin_role_to_jit(self, client):
        tenant = _make_tenant()
        auth = _make_saml_auth(
            email="admin@example.com", groups=["dg-admin", "all-users"], assertion_id="a1"
        )
        mock_user = _make_user("admin@example.com", "ADMIN")

        with (
            patch("src.api.saml._get_tenant_by_id", return_value=tenant),
            patch("src.api.saml._get_saml_auth", return_value=auth),
            patch("src.api.saml._is_replay", return_value=False),
            patch("src.api.saml._get_or_create_user", return_value=mock_user) as mock_jit,
            patch("src.api.saml._store_exchange_token"),
        ):
            res = _post_callback(client)

        assert res.status_code == 302
        # JIT was called with ADMIN role
        mock_jit.assert_called_once()
        _, _, role_arg = mock_jit.call_args.args
        assert role_arg == "ADMIN"

    def test_no_matching_group_passes_viewer_role_to_jit(self, client):
        tenant = _make_tenant()
        auth = _make_saml_auth(email="viewer@example.com", groups=["all-users"], assertion_id="a2")
        mock_user = _make_user("viewer@example.com", "VIEWER")

        with (
            patch("src.api.saml._get_tenant_by_id", return_value=tenant),
            patch("src.api.saml._get_saml_auth", return_value=auth),
            patch("src.api.saml._is_replay", return_value=False),
            patch("src.api.saml._get_or_create_user", return_value=mock_user) as mock_jit,
            patch("src.api.saml._store_exchange_token"),
        ):
            res = _post_callback(client)

        assert res.status_code == 302
        mock_jit.assert_called_once()
        _, _, role_arg = mock_jit.call_args.args
        assert role_arg == "VIEWER"

    def test_empty_groups_attr_passes_viewer_role(self, client):
        tenant = _make_tenant()
        auth = _make_saml_auth(email="nogroup@example.com", groups=[], assertion_id="a3")
        mock_user = _make_user("nogroup@example.com", "VIEWER")

        with (
            patch("src.api.saml._get_tenant_by_id", return_value=tenant),
            patch("src.api.saml._get_saml_auth", return_value=auth),
            patch("src.api.saml._is_replay", return_value=False),
            patch("src.api.saml._get_or_create_user", return_value=mock_user) as mock_jit,
            patch("src.api.saml._store_exchange_token"),
        ):
            res = _post_callback(client)

        assert res.status_code == 302
        _, _, role_arg = mock_jit.call_args.args
        assert role_arg == "VIEWER"


# ── C. Redirect to /auth/saml-complete with token ────────────────────────────


class TestSuccessRedirect:
    def test_redirects_to_saml_complete(self, client):
        tenant = _make_tenant()
        auth = _make_saml_auth(assertion_id="b1")
        mock_user = _make_user()

        with (
            patch("src.api.saml._get_tenant_by_id", return_value=tenant),
            patch("src.api.saml._get_saml_auth", return_value=auth),
            patch("src.api.saml._is_replay", return_value=False),
            patch("src.api.saml._get_or_create_user", return_value=mock_user),
            patch("src.api.saml._store_exchange_token"),
        ):
            res = _post_callback(client)

        assert res.status_code == 302
        location = res.headers["location"]
        assert "saml-complete" in location
        assert "token=" in location

    def test_exchange_token_is_stored(self, client):
        tenant = _make_tenant()
        auth = _make_saml_auth(assertion_id="b2")
        mock_user = _make_user()

        with (
            patch("src.api.saml._get_tenant_by_id", return_value=tenant),
            patch("src.api.saml._get_saml_auth", return_value=auth),
            patch("src.api.saml._is_replay", return_value=False),
            patch("src.api.saml._get_or_create_user", return_value=mock_user),
            patch("src.api.saml._store_exchange_token") as mock_store,
        ):
            res = _post_callback(client)

        assert res.status_code == 302
        mock_store.assert_called_once()
        _, payload = mock_store.call_args.args
        assert payload["email"] == mock_user.email
        assert payload["user_id"] == mock_user.id


# ── D. Exchange token one-time-use ────────────────────────────────────────────


class TestExchangeTokenOneTimeUse:
    def test_valid_token_returns_user_data(self, client):
        import time

        payload = {
            "user_id": "u-test",
            "email": "user@example.com",
            "role": "VIEWER",
            "tenant_id": "t-smoke",
            "issued_at": time.time(),
        }
        with patch("src.api.saml._consume_exchange_token", return_value=payload):
            res = client.get("/auth/saml/exchange?token=valid-token")
        assert res.status_code == 200
        assert res.json()["email"] == "user@example.com"

    def test_consumed_token_returns_401(self, client):
        with patch("src.api.saml._consume_exchange_token", return_value=None):
            res = client.get("/auth/saml/exchange?token=already-used")
        assert res.status_code == 401

    def test_jit_not_called_on_second_use(self, client):
        """Once the token is consumed, _get_or_create_user is not called again."""
        with (
            patch("src.api.saml._consume_exchange_token", return_value=None),
            patch("src.api.saml._get_or_create_user") as mock_jit,
        ):
            client.get("/auth/saml/exchange?token=already-used")
        mock_jit.assert_not_called()


# ── E. Assertion age check (requires onelogin.saml2.utils) ───────────────────
#
# onelogin is an optional prod dep (libxmlsec1 system lib required).
# We inject a fake module via sys.modules so the test runs without it.


class TestExpiredAssertion:
    def _with_onelogin(self, parse_result: float):
        """Context manager that injects a fake onelogin module returning parse_result."""
        import sys
        import types

        fake_utils = MagicMock()
        fake_utils.parse_SAML_to_time.return_value = parse_result

        fake_saml2 = types.ModuleType("onelogin.saml2")
        fake_utils_mod = types.ModuleType("onelogin.saml2.utils")
        fake_utils_mod.OneLogin_Saml2_Utils = fake_utils

        fake_onelogin = types.ModuleType("onelogin")
        fake_onelogin.saml2 = fake_saml2

        return patch.dict(
            sys.modules,
            {
                "onelogin": fake_onelogin,
                "onelogin.saml2": fake_saml2,
                "onelogin.saml2.utils": fake_utils_mod,
            },
        )

    def test_expired_assertion_returns_401(self, client):
        import time

        tenant = _make_tenant()
        auth = _make_saml_auth(email="late@example.com", assertion_id="expired-1")
        past_time = time.time() - 3600  # 1 hour ago

        with (
            self._with_onelogin(past_time),
            patch("src.api.saml._get_tenant_by_id", return_value=tenant),
            patch("src.api.saml._get_saml_auth", return_value=auth),
            patch("src.api.saml._is_replay", return_value=False),
            patch("src.api.saml._get_or_create_user") as mock_jit,
        ):
            res = _post_callback(client)

        assert res.status_code == 401
        mock_jit.assert_not_called()

    def test_valid_assertion_not_rejected(self, client):
        import time

        tenant = _make_tenant()
        auth = _make_saml_auth(email="ok@example.com", assertion_id="valid-1")
        future_time = time.time() + 3600  # 1 hour from now
        mock_user = _make_user("ok@example.com")

        with (
            self._with_onelogin(future_time),
            patch("src.api.saml._get_tenant_by_id", return_value=tenant),
            patch("src.api.saml._get_saml_auth", return_value=auth),
            patch("src.api.saml._is_replay", return_value=False),
            patch("src.api.saml._get_or_create_user", return_value=mock_user),
            patch("src.api.saml._store_exchange_token"),
        ):
            res = _post_callback(client)

        assert res.status_code == 302


# ── F. Replay attack → 401 ───────────────────────────────────────────────────


class TestReplayAttack:
    def test_replay_returns_401(self, client):
        tenant = _make_tenant()
        auth = _make_saml_auth(assertion_id="replay-id-1")

        with (
            patch("src.api.saml._get_tenant_by_id", return_value=tenant),
            patch("src.api.saml._get_saml_auth", return_value=auth),
            patch("src.api.saml._is_replay", return_value=True),
            patch("src.api.saml._get_or_create_user") as mock_jit,
        ):
            res = _post_callback(client)

        assert res.status_code == 401
        assert "replay" in res.json().get("detail", "").lower()

    def test_replay_does_not_call_jit(self, client):
        tenant = _make_tenant()
        auth = _make_saml_auth(assertion_id="replay-id-2")

        with (
            patch("src.api.saml._get_tenant_by_id", return_value=tenant),
            patch("src.api.saml._get_saml_auth", return_value=auth),
            patch("src.api.saml._is_replay", return_value=True),
            patch("src.api.saml._get_or_create_user") as mock_jit,
        ):
            _post_callback(client)

        mock_jit.assert_not_called()
