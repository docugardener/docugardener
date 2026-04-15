"""HYB-04: Single-tenant auto-provisioning tests."""

from unittest.mock import MagicMock

import pytest

from src.core.provisioning import (
    DEFAULT_TENANT_ID,
    ensure_tenant_provisioned,
)


def make_settings(**kwargs):
    s = MagicMock()
    s.deployment_mode = kwargs.get("deployment_mode", "client-installed")
    s.github_org = kwargs.get("github_org", "acme-corp")
    s.admin_email = kwargs.get("admin_email")
    s.single_tenant_id = kwargs.get("single_tenant_id")
    return s


def make_db(tenant_row=None, user_row=None):
    """Return a mock SQLAlchemy Session."""
    db = MagicMock()
    # Configure execute().fetchone() return values
    # First call → tenant lookup, second call → user lookup
    fetchone_results = [tenant_row, user_row]
    call_count = [0]

    def side_effect(*args, **kwargs):
        result = MagicMock()
        idx = call_count[0]
        call_count[0] += 1
        result.fetchone.return_value = (
            fetchone_results[idx] if idx < len(fetchone_results) else None
        )
        return result

    db.execute.side_effect = side_effect
    return db


class TestSaasNoOp:
    @pytest.mark.anyio
    async def test_saas_mode_is_noop(self):
        settings = make_settings(deployment_mode="saas")
        db = MagicMock()
        await ensure_tenant_provisioned(db, settings)
        db.execute.assert_not_called()
        db.commit.assert_not_called()

    @pytest.mark.anyio
    async def test_saas_does_not_mutate_single_tenant_id(self):
        settings = make_settings(deployment_mode="saas")
        settings.single_tenant_id = None
        db = MagicMock()
        await ensure_tenant_provisioned(db, settings)
        assert settings.single_tenant_id is None


class TestRequiredEnvValidation:
    @pytest.mark.anyio
    async def test_raises_when_github_org_missing_in_client_installed(self):
        settings = make_settings(deployment_mode="client-installed", github_org=None)
        db = MagicMock()
        with pytest.raises(RuntimeError, match="GITHUB_ORG"):
            await ensure_tenant_provisioned(db, settings)

    @pytest.mark.anyio
    async def test_raises_when_github_org_missing_in_air_gap(self):
        settings = make_settings(deployment_mode="air-gap", github_org=None)
        db = MagicMock()
        with pytest.raises(RuntimeError, match="GITHUB_ORG"):
            await ensure_tenant_provisioned(db, settings)


class TestTenantCreation:
    @pytest.mark.anyio
    async def test_creates_tenant_when_none_exists(self):
        settings = make_settings(github_org="acme")
        db = make_db(tenant_row=None)  # No existing tenant
        await ensure_tenant_provisioned(db, settings)
        # INSERT should have been called
        assert db.execute.call_count >= 1
        assert db.commit.called

    @pytest.mark.anyio
    async def test_reuses_existing_tenant(self):
        settings = make_settings(github_org="acme")
        existing_row = MagicMock()
        existing_row.__getitem__ = lambda self, i: "existing-id" if i == 0 else None
        db = make_db(tenant_row=existing_row)
        await ensure_tenant_provisioned(db, settings)
        assert settings.single_tenant_id == "existing-id"

    @pytest.mark.anyio
    async def test_single_tenant_id_set_after_provisioning(self):
        settings = make_settings(github_org="acme")
        db = make_db(tenant_row=None)
        await ensure_tenant_provisioned(db, settings)
        assert settings.single_tenant_id == DEFAULT_TENANT_ID

    @pytest.mark.anyio
    async def test_idempotent_when_called_twice(self):
        """Second call finds existing tenant and does not duplicate."""
        settings = make_settings(github_org="acme")
        # Simulate first call: no tenant → creates
        db1 = make_db(tenant_row=None)
        await ensure_tenant_provisioned(db1, settings)

        # Simulate second call: tenant now exists
        existing_row = MagicMock()
        existing_row.__getitem__ = lambda self, i: DEFAULT_TENANT_ID if i == 0 else None
        db2 = make_db(tenant_row=existing_row)
        s2 = make_settings(github_org="acme", single_tenant_id=None)
        await ensure_tenant_provisioned(db2, s2)
        assert s2.single_tenant_id == DEFAULT_TENANT_ID


class TestAdminUserProvisioning:
    @pytest.mark.anyio
    async def test_creates_admin_user_when_admin_email_set(self):
        settings = make_settings(github_org="acme", admin_email="admin@acme.com")
        # Tenant exists, user does not
        tenant_row = MagicMock()
        tenant_row.__getitem__ = lambda self, i: DEFAULT_TENANT_ID
        db = make_db(tenant_row=tenant_row, user_row=None)
        await ensure_tenant_provisioned(db, settings)
        # At least two execute calls: tenant lookup + user insert
        assert db.execute.call_count >= 2

    @pytest.mark.anyio
    async def test_skips_admin_user_creation_when_admin_email_not_set(self):
        settings = make_settings(github_org="acme", admin_email=None)
        tenant_row = MagicMock()
        tenant_row.__getitem__ = lambda self, i: DEFAULT_TENANT_ID
        db = make_db(tenant_row=tenant_row)
        await ensure_tenant_provisioned(db, settings)
        # Only tenant lookup executed — no user insert
        assert db.execute.call_count == 1

    @pytest.mark.anyio
    async def test_skips_user_creation_when_user_already_exists(self):
        settings = make_settings(github_org="acme", admin_email="admin@acme.com")
        tenant_row = MagicMock()
        tenant_row.__getitem__ = lambda self, i: DEFAULT_TENANT_ID
        existing_user_row = MagicMock()
        existing_user_row.__getitem__ = lambda self, i: "existing-user-id"
        db = make_db(tenant_row=tenant_row, user_row=existing_user_row)
        await ensure_tenant_provisioned(db, settings)
        # 2 selects (tenant + user), 0 inserts beyond that
        assert db.commit.call_count <= 1  # At most 1 commit (the tenant insert)
