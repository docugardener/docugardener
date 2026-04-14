"""
TEST-01 / A6: handle_installation() — GitHub App install webhook.

Covers:
  - action="created"  → tenant.installationId updated in DB
  - action="new_permissions_accepted" → also updates installationId
  - Tenant already has installationId → idempotent re-install, no crash
  - Tenant not found for owner_id → warning logged, returns success (no crash)
  - action="deleted" (not in handled list) → DB never touched

Implementation note: handle_installation creates its own DB session via
SessionLocal() and calls db.close() when done. Tests patch SessionLocal
with the test factory (not a fixed instance) and open a fresh verify session
for assertions — this avoids SQLAlchemy detached-object errors.
"""

import pytest
from unittest.mock import patch
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from src.storage.sql_models import Base, Tenant
from src.api.webhooks import handle_installation


# ── DB fixture ────────────────────────────────────────────────────────────────

engine = create_engine("sqlite:///:memory:")
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(autouse=True)
def fresh_schema():
    """Create all tables before each test and drop them after."""
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def seed_tenant():
    """Seed a tenant with no installationId and return its id."""
    db = TestingSessionLocal()
    try:
        t = Tenant(id="t-install", name="Install Org", githubOrgId="88888", installationId=None)
        db.add(t)
        db.commit()
    finally:
        db.close()
    return "t-install"


def _get_installation_id(tenant_id: str) -> str | None:
    """Open a fresh session and return current installationId for the tenant."""
    db = TestingSessionLocal()
    try:
        t = db.query(Tenant).filter(Tenant.id == tenant_id).first()
        return t.installationId if t else None
    finally:
        db.close()


def _install_payload(action: str = "created", org_id: int = 88888, installation_id: int = 55555) -> dict:
    return {
        "action": action,
        "installation": {
            "id": installation_id,
            "account": {"id": org_id},
        },
    }


# ── tests ─────────────────────────────────────────────────────────────────────

class TestHandleInstallation:

    @pytest.mark.asyncio
    async def test_created_action_updates_installation_id(self, seed_tenant):
        """action='created' → tenant.installationId set to the installation id from payload."""
        with patch("src.pipeline.job_manager.SessionLocal", TestingSessionLocal):
            result = await handle_installation(_install_payload(action="created", installation_id=55555))

        assert _get_installation_id(seed_tenant) == "55555"
        assert result["status"] == "success"
        assert result["action"] == "created"

    @pytest.mark.asyncio
    async def test_new_permissions_accepted_also_updates(self, seed_tenant):
        """action='new_permissions_accepted' is also handled — installationId updated."""
        with patch("src.pipeline.job_manager.SessionLocal", TestingSessionLocal):
            result = await handle_installation(
                _install_payload(action="new_permissions_accepted", installation_id=66666)
            )

        assert _get_installation_id(seed_tenant) == "66666"

    @pytest.mark.asyncio
    async def test_reinstall_is_idempotent(self, seed_tenant):
        """Calling handle_installation twice doesn't raise and leaves correct installationId."""
        with patch("src.pipeline.job_manager.SessionLocal", TestingSessionLocal):
            await handle_installation(_install_payload(installation_id=11111))
            await handle_installation(_install_payload(installation_id=22222))

        assert _get_installation_id(seed_tenant) == "22222"  # second call wins

    @pytest.mark.asyncio
    async def test_unknown_action_is_noop(self, seed_tenant):
        """action='deleted' is not in the handled list → installationId NOT touched."""
        with patch("src.pipeline.job_manager.SessionLocal", TestingSessionLocal):
            result = await handle_installation(_install_payload(action="deleted"))

        assert _get_installation_id(seed_tenant) is None  # unchanged
        assert result["action"] == "deleted"

    @pytest.mark.asyncio
    async def test_tenant_not_found_does_not_crash(self, seed_tenant):
        """No tenant with matching githubOrgId → logs warning, returns success, no exception."""
        with patch("src.pipeline.job_manager.SessionLocal", TestingSessionLocal):
            result = await handle_installation(
                _install_payload(org_id=99999999, installation_id=77777)
            )

        # Should not raise; must return a sensible response
        assert result["status"] == "success"

    @pytest.mark.asyncio
    async def test_returns_success_action_field(self, seed_tenant):
        """Return dict always contains status='success' and the original action string."""
        with patch("src.pipeline.job_manager.SessionLocal", TestingSessionLocal):
            result = await handle_installation(_install_payload(action="created"))

        assert result["status"] == "success"
        assert result["action"] == "created"
