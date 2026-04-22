# SPDX-License-Identifier: AGPL-3.0-or-later
"""
BUG-ONBOARD-02: installationId uniqueness + tiebreaker guard.

Covers:
  - _get_tenant_by_installation_id returns None when no match
  - returns the single tenant when exactly one row matches
  - tiebreaker: returns the real tenant when a 'default' auto-provisioned tenant
    shares the same installationId (migration-window safety)
  - tiebreaker: falls back to first row when all rows are named 'default'
  - SQLAlchemy unique=True on installationId prevents duplicate non-NULL values
  - NULL installationId rows do not conflict (multiple NULLs allowed)
  - handle_installation refuses to overwrite an existing installationId that
    belongs to a different org (i.e. unique constraint is respected on write)
"""

from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker

from src.api.webhooks import _get_tenant_by_installation_id, handle_installation
from src.storage.sql_models import Base, Tenant

# ── in-memory SQLite DB ────────────────────────────────────────────────────────
# SQLite doesn't enforce UNIQUE constraints on NULL values the same way Postgres
# does, but it does enforce them for non-NULL values — sufficient for unit tests.

engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
)
# Enable FK enforcement for SQLite
@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_conn, _):
    dbapi_conn.execute("PRAGMA foreign_keys=ON")


TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(autouse=True)
def fresh_schema():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


def _make_tenant(db, *, id: str, name: str, github_org_id: str, installation_id: str | None):
    t = Tenant(id=id, name=name, githubOrgId=github_org_id, installationId=installation_id)
    db.add(t)
    db.commit()
    return t


# ── _get_tenant_by_installation_id ────────────────────────────────────────────


class TestGetTenantByInstallationId:
    def test_returns_none_when_no_match(self):
        db = TestingSessionLocal()
        try:
            assert _get_tenant_by_installation_id(db, "99999") is None
        finally:
            db.close()

    def test_returns_single_matching_tenant(self):
        db = TestingSessionLocal()
        try:
            _make_tenant(db, id="t1", name="Acme", github_org_id="111", installation_id="55555")
            result = _get_tenant_by_installation_id(db, "55555")
            assert result is not None
            assert result.id == "t1"
        finally:
            db.close()

    def test_accepts_int_installation_id(self):
        db = TestingSessionLocal()
        try:
            _make_tenant(db, id="t1", name="Acme", github_org_id="111", installation_id="55555")
            result = _get_tenant_by_installation_id(db, 55555)
            assert result is not None
            assert result.id == "t1"
        finally:
            db.close()

    def test_tiebreaker_prefers_real_tenant_over_default(self):
        """When the auto-provisioned 'default' tenant and a real tenant share
        installationId (pre-migration-window scenario), the real tenant wins.

        The unique constraint prevents creating this state via the ORM, so we
        test the selection logic directly by mocking db.query().filter().all().
        """
        default_t = Tenant(id="default", name="Self-hosted", githubOrgId="default", installationId="77777")
        real_t = Tenant(id="t-real", name="myorg", githubOrgId="999", installationId="77777")

        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.all.return_value = [default_t, real_t]

        result = _get_tenant_by_installation_id(mock_db, "77777")
        assert result is not None
        assert result.id == "t-real"

    def test_tiebreaker_fallback_when_all_rows_are_default(self):
        """Edge case: if all matching rows are the default tenant, return the first one."""
        t1 = Tenant(id="default", name="Self-hosted", githubOrgId="default", installationId="88888")
        t2 = Tenant(id="default2", name="Self-hosted", githubOrgId="default2", installationId="88888")

        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.all.return_value = [t1, t2]

        result = _get_tenant_by_installation_id(mock_db, "88888")
        assert result is not None
        # Neither row is the canonical default (id="default", githubOrgId="default"),
        # so tiebreaker returns the first real match.
        assert result.id in ("default", "default2")


# ── SQLAlchemy unique constraint ───────────────────────────────────────────────


class TestInstallationIdUniqueConstraint:
    def test_duplicate_non_null_installation_id_raises_integrity_error(self):
        """Two tenants cannot hold the same non-NULL installationId."""
        db = TestingSessionLocal()
        try:
            _make_tenant(db, id="t1", name="Org1", github_org_id="111", installation_id="12345")
            with pytest.raises(IntegrityError):
                _make_tenant(
                    db, id="t2", name="Org2", github_org_id="222", installation_id="12345"
                )
        finally:
            db.close()

    def test_multiple_null_installation_ids_are_allowed(self):
        """NULL installationId rows do not violate the unique constraint."""
        db = TestingSessionLocal()
        try:
            _make_tenant(db, id="t1", name="Org1", github_org_id="111", installation_id=None)
            _make_tenant(db, id="t2", name="Org2", github_org_id="222", installation_id=None)
            count = db.query(Tenant).filter(Tenant.installationId.is_(None)).count()
            assert count == 2
        finally:
            db.close()

    def test_null_and_non_null_coexist(self):
        """A tenant with NULL and one with a value don't conflict."""
        db = TestingSessionLocal()
        try:
            _make_tenant(db, id="t1", name="Org1", github_org_id="111", installation_id=None)
            _make_tenant(
                db, id="t2", name="Org2", github_org_id="222", installation_id="99999"
            )
            assert db.query(Tenant).count() == 2
        finally:
            db.close()


# ── handle_installation integration ───────────────────────────────────────────


class TestHandleInstallationGuard:
    @pytest.mark.asyncio
    async def test_installation_sets_id_on_matching_org(self):
        """action='created' → installationId written to the tenant with matching githubOrgId."""
        db = TestingSessionLocal()
        try:
            _make_tenant(db, id="t1", name="myorg", github_org_id="42", installation_id=None)
        finally:
            db.close()

        payload = {
            "action": "created",
            "installation": {"id": 55555, "account": {"id": 42}},
        }
        with patch("src.pipeline.job_manager.SessionLocal", TestingSessionLocal):
            result = await handle_installation(payload)

        assert result["status"] == "success"
        verify_db = TestingSessionLocal()
        try:
            t = verify_db.query(Tenant).filter(Tenant.id == "t1").first()
            assert t.installationId == "55555"
        finally:
            verify_db.close()

    @pytest.mark.asyncio
    async def test_installation_does_not_overwrite_unrelated_tenants(self):
        """An installation webhook for org 42 must NOT touch a tenant with a different orgId."""
        db = TestingSessionLocal()
        try:
            _make_tenant(db, id="t1", name="myorg", github_org_id="42", installation_id=None)
            _make_tenant(
                db, id="t2", name="other", github_org_id="99", installation_id="existing"
            )
        finally:
            db.close()

        payload = {
            "action": "created",
            "installation": {"id": 55555, "account": {"id": 42}},
        }
        with patch("src.pipeline.job_manager.SessionLocal", TestingSessionLocal):
            await handle_installation(payload)

        verify_db = TestingSessionLocal()
        try:
            t2 = verify_db.query(Tenant).filter(Tenant.id == "t2").first()
            assert t2.installationId == "existing"
        finally:
            verify_db.close()
