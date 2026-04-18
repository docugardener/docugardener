# SPDX-License-Identifier: AGPL-3.0-or-later
"""
TEST-SSO-01: Integration tests for SAML JIT user provisioning.

Tests _get_or_create_user() against the real SQLAlchemy schema (SQLite
in-memory via the shared integration conftest). No mocks — verifies
actual DB writes and reads.

Covers:
  A. First SSO user in a tenant → promoted to ADMIN regardless of IdP role
  B. Second SSO user with IdP role VIEWER → stays VIEWER
  C. Second SSO user with IdP role ADMIN → gets ADMIN
  D. Same email twice → returns existing user, no duplicate row
  E. User row persisted with correct tenantId
  F. User name defaults to email local-part
  G. Third user in tenant gets IdP role (not auto-ADMIN)
"""

from unittest.mock import patch

import pytest

from src.storage.sql_models import Base, Tenant, User
from tests.integration.conftest import TENANT_ID, TestingSessionLocal

# ── Fixtures ──────────────────────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def _reset_db():
    """Recreate schema before each test (isolated from conftest autouse
    which runs at the integration level; keeps each test hermetic)."""
    from tests.integration.conftest import engine

    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def tenant():
    """Seed a minimal tenant row."""
    db = TestingSessionLocal()
    try:
        t = Tenant(
            id=TENANT_ID,
            name="SSO Corp",
            githubOrgId="sso-org-99",
            ssoEnabled=True,
            samlAttrRole="groups",
            samlRoleMapAdmin="dg-admin",
        )
        db.add(t)
        db.commit()
    finally:
        db.close()
    return TENANT_ID


def _call_jit(email: str, tenant_id: str, role: str) -> User:
    """Import and call the real _get_or_create_user with the test session factory."""
    with patch("src.api.saml.SessionLocal", TestingSessionLocal):
        from src.api.saml import _get_or_create_user  # type: ignore[import-untyped]

        return _get_or_create_user(email, tenant_id, role)


def _count_users(tenant_id: str) -> int:
    db = TestingSessionLocal()
    try:
        return db.query(User).filter(User.tenantId == tenant_id).count()
    finally:
        db.close()


def _fetch_user(email: str) -> User | None:
    db = TestingSessionLocal()
    try:
        return db.query(User).filter(User.email == email).first()
    finally:
        db.close()


# ── A. First user → ADMIN ─────────────────────────────────────────────────────


class TestFirstUserPromotion:
    def test_first_user_promoted_to_admin_even_if_idp_says_viewer(self, tenant):
        user = _call_jit("alice@example.com", TENANT_ID, "VIEWER")
        assert user.role == "ADMIN"

    def test_first_user_promoted_to_admin_even_if_idp_says_auditor(self, tenant):
        user = _call_jit("alice@example.com", TENANT_ID, "AUDITOR")
        assert user.role == "ADMIN"

    def test_first_user_keeps_admin_when_idp_also_says_admin(self, tenant):
        user = _call_jit("alice@example.com", TENANT_ID, "ADMIN")
        assert user.role == "ADMIN"


# ── B/C. Subsequent users keep IdP role ──────────────────────────────────────


class TestSubsequentUserRoles:
    def test_second_user_viewer_role_preserved(self, tenant):
        _call_jit("alice@example.com", TENANT_ID, "VIEWER")  # seeds first user
        user2 = _call_jit("bob@example.com", TENANT_ID, "VIEWER")
        assert user2.role == "VIEWER"

    def test_second_user_admin_role_preserved(self, tenant):
        _call_jit("alice@example.com", TENANT_ID, "VIEWER")
        user2 = _call_jit("bob@example.com", TENANT_ID, "ADMIN")
        assert user2.role == "ADMIN"

    def test_third_user_gets_idp_role_not_admin(self, tenant):
        _call_jit("alice@example.com", TENANT_ID, "VIEWER")
        _call_jit("bob@example.com", TENANT_ID, "VIEWER")
        user3 = _call_jit("carol@example.com", TENANT_ID, "AUDITOR")
        assert user3.role == "AUDITOR"


# ── D. Idempotency — same email returns existing user ────────────────────────


class TestIdempotency:
    def test_same_email_twice_returns_same_user(self, tenant):
        u1 = _call_jit("alice@example.com", TENANT_ID, "VIEWER")
        u2 = _call_jit("alice@example.com", TENANT_ID, "VIEWER")
        assert u1.id == u2.id

    def test_no_duplicate_row_on_second_call(self, tenant):
        _call_jit("alice@example.com", TENANT_ID, "VIEWER")
        _call_jit("alice@example.com", TENANT_ID, "VIEWER")
        assert _count_users(TENANT_ID) == 1

    def test_role_not_changed_on_repeat_login(self, tenant):
        """Existing ADMIN is not downgraded if IdP sends VIEWER on re-login."""
        _call_jit("alice@example.com", TENANT_ID, "VIEWER")  # becomes ADMIN
        _call_jit("alice@example.com", TENANT_ID, "VIEWER")  # second login
        stored = _fetch_user("alice@example.com")
        assert stored is not None
        assert stored.role == "ADMIN"


# ── E. tenantId persisted correctly ──────────────────────────────────────────


class TestPersistence:
    def test_user_tenant_id_matches(self, tenant):
        _call_jit("alice@example.com", TENANT_ID, "VIEWER")
        stored = _fetch_user("alice@example.com")
        assert stored is not None
        assert stored.tenantId == TENANT_ID

    def test_user_email_stored(self, tenant):
        _call_jit("alice@example.com", TENANT_ID, "VIEWER")
        stored = _fetch_user("alice@example.com")
        assert stored is not None
        assert stored.email == "alice@example.com"

    def test_user_id_is_non_empty(self, tenant):
        user = _call_jit("alice@example.com", TENANT_ID, "VIEWER")
        assert user.id and len(user.id) > 0


# ── F. Name defaults to email local-part ─────────────────────────────────────


class TestNameDefault:
    def test_name_is_email_local_part(self, tenant):
        _call_jit("alice@example.com", TENANT_ID, "VIEWER")
        stored = _fetch_user("alice@example.com")
        assert stored is not None
        assert stored.name == "alice"

    def test_name_with_dots_in_local_part(self, tenant):
        _call_jit("john.doe@corp.com", TENANT_ID, "VIEWER")
        stored = _fetch_user("john.doe@corp.com")
        assert stored is not None
        assert stored.name == "john.doe"
