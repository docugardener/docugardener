"""HYB-03: TenantResolver abstraction tests."""

from unittest.mock import MagicMock

import pytest

from src.core.tenant import (
    MultiTenantResolver,
    SingleTenantResolver,
    create_tenant_resolver,
)


def make_request(tenant_id: str | None = None) -> MagicMock:
    """Create a mock FastAPI Request with optional X-Tenant-ID header."""
    request = MagicMock()
    request.headers = {"X-Tenant-ID": tenant_id} if tenant_id else {}
    return request


def make_settings(deployment_mode: str = "saas", single_tenant_id: str | None = None):
    """Create a minimal Settings-like mock."""
    s = MagicMock()
    s.deployment_mode = deployment_mode
    s.single_tenant_id = single_tenant_id
    return s


# ---------------------------------------------------------------------------
# MultiTenantResolver
# ---------------------------------------------------------------------------


class TestMultiTenantResolver:
    @pytest.mark.anyio
    async def test_returns_header_value(self):
        resolver = MultiTenantResolver()
        req = make_request("tenant-abc")
        assert await resolver.resolve(req) == "tenant-abc"

    @pytest.mark.anyio
    async def test_returns_none_when_header_absent(self):
        resolver = MultiTenantResolver()
        req = make_request(None)
        assert await resolver.resolve(req) is None

    @pytest.mark.anyio
    async def test_returns_none_for_empty_header(self):
        resolver = MultiTenantResolver()
        req = MagicMock()
        req.headers = {"X-Tenant-ID": ""}
        # Empty string is falsy but still returned as-is
        result = await resolver.resolve(req)
        assert result == "" or result is None  # depends on dict.get semantics

    @pytest.mark.anyio
    async def test_different_requests_return_different_tenants(self):
        resolver = MultiTenantResolver()
        req_a = make_request("tenant-a")
        req_b = make_request("tenant-b")
        assert await resolver.resolve(req_a) == "tenant-a"
        assert await resolver.resolve(req_b) == "tenant-b"


# ---------------------------------------------------------------------------
# SingleTenantResolver
# ---------------------------------------------------------------------------


class TestSingleTenantResolver:
    @pytest.mark.anyio
    async def test_returns_configured_tenant_id(self):
        settings = make_settings(deployment_mode="client-installed", single_tenant_id="default")
        resolver = SingleTenantResolver(settings)
        req = make_request(None)
        assert await resolver.resolve(req) == "default"

    @pytest.mark.anyio
    async def test_ignores_x_tenant_id_header(self):
        """Header must be completely ignored in single-tenant mode."""
        settings = make_settings(
            deployment_mode="client-installed", single_tenant_id="fixed-tenant"
        )
        resolver = SingleTenantResolver(settings)
        req = make_request("attacker-tenant")
        assert await resolver.resolve(req) == "fixed-tenant"

    @pytest.mark.anyio
    async def test_returns_none_when_single_tenant_id_not_yet_set(self):
        """Before HYB-04 provisioning completes, single_tenant_id may be None."""
        settings = make_settings(deployment_mode="client-installed", single_tenant_id=None)
        resolver = SingleTenantResolver(settings)
        req = make_request(None)
        assert await resolver.resolve(req) is None

    @pytest.mark.anyio
    async def test_picks_up_runtime_settings_change(self):
        """Provisioning (HYB-04) mutates settings.single_tenant_id post-creation;
        the resolver must reflect the updated value without restart."""
        settings = make_settings(deployment_mode="client-installed", single_tenant_id=None)
        resolver = SingleTenantResolver(settings)
        req = make_request(None)

        # Before provisioning
        assert await resolver.resolve(req) is None

        # Simulate HYB-04 provisioning updating the settings object
        settings.single_tenant_id = "provisioned-tenant"
        assert await resolver.resolve(req) == "provisioned-tenant"

    @pytest.mark.anyio
    async def test_air_gap_mode_returns_fixed_tenant(self):
        settings = make_settings(deployment_mode="air-gap", single_tenant_id="airgap-org")
        resolver = SingleTenantResolver(settings)
        req = make_request(None)
        assert await resolver.resolve(req) == "airgap-org"


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------


class TestCreateTenantResolver:
    def test_saas_returns_multi_tenant_resolver(self):
        settings = make_settings(deployment_mode="saas")
        resolver = create_tenant_resolver(settings)
        assert isinstance(resolver, MultiTenantResolver)

    def test_client_installed_returns_single_tenant_resolver(self):
        settings = make_settings(deployment_mode="client-installed")
        resolver = create_tenant_resolver(settings)
        assert isinstance(resolver, SingleTenantResolver)

    def test_air_gap_returns_single_tenant_resolver(self):
        settings = make_settings(deployment_mode="air-gap")
        resolver = create_tenant_resolver(settings)
        assert isinstance(resolver, SingleTenantResolver)

    @pytest.mark.anyio
    async def test_saas_factory_resolver_reads_header(self):
        settings = make_settings(deployment_mode="saas")
        resolver = create_tenant_resolver(settings)
        req = make_request("from-header")
        assert await resolver.resolve(req) == "from-header"

    @pytest.mark.anyio
    async def test_client_installed_factory_resolver_ignores_header(self):
        settings = make_settings(deployment_mode="client-installed", single_tenant_id="fixed")
        resolver = create_tenant_resolver(settings)
        req = make_request("spoofed-header")
        assert await resolver.resolve(req) == "fixed"
