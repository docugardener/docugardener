# SPDX-License-Identifier: AGPL-3.0-or-later
"""HYB-03: TenantResolver abstraction for multi-tenant (SaaS) and single-tenant
(client-installed / air-gap) deployments.

All route handlers continue to call get_tenant_id() from middleware.py — they
are completely unaware of which resolver is active.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Protocol

from fastapi import Request

if TYPE_CHECKING:
    from src.core.config import Settings


class TenantResolver(Protocol):
    """Protocol that all tenant resolver implementations must satisfy."""

    async def resolve(self, request: Request) -> str | None:
        """Return the tenant ID for this request, or None if not resolvable."""
        ...


class MultiTenantResolver:
    """SaaS mode: resolves tenant from the X-Tenant-ID request header.

    This is the current (pre-HYB-03) behavior, extracted into a class so the
    middleware can delegate to it via the Protocol interface.
    """

    async def resolve(self, request: Request) -> str | None:
        return request.headers.get("X-Tenant-ID")


class SingleTenantResolver:
    """Client-installed / air-gap mode: returns a fixed tenant ID from config.

    The settings reference is held (not just the ID value) so that HYB-04
    auto-provisioning can mutate settings.single_tenant_id at startup and the
    resolver will immediately reflect the updated value on subsequent requests.
    """

    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    async def resolve(self, request: Request) -> str | None:
        # X-Tenant-ID header is irrelevant in single-tenant mode; always return
        # the configured tenant regardless of what the caller sends.
        return self._settings.single_tenant_id


def create_tenant_resolver(settings: Settings) -> TenantResolver:
    """Factory: select the correct TenantResolver based on deployment_mode.

    Called once at application startup in main.py and injected into
    TenantContextMiddleware. In single-tenant modes the resolver holds a
    reference to settings so that HYB-04 provisioning changes propagate
    automatically without restarting the resolver.
    """
    if settings.deployment_mode in ("client-installed", "air-gap"):
        return SingleTenantResolver(settings)
    # Default: SaaS multi-tenant header resolution
    return MultiTenantResolver()
