# SPDX-License-Identifier: AGPL-3.0-or-later
from contextvars import ContextVar
from typing import TYPE_CHECKING

from fastapi import Request, status
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response
from starlette.types import ASGIApp

from src.core.logging import get_logger

if TYPE_CHECKING:
    from src.core.tenant import TenantResolver

logger = get_logger(__name__)

# Context variable to store the tenant ID for the current request/task
tenant_id_context: ContextVar[str | None] = ContextVar("tenant_id", default=None)


class TenantContextMiddleware(BaseHTTPMiddleware):
    """Middleware that resolves Tenant ID and sets it in a ContextVar.

    The resolution strategy is injected via a TenantResolver:
    - SaaS mode:              MultiTenantResolver (reads X-Tenant-ID header)
    - client-installed/air-gap: SingleTenantResolver (returns fixed tenant from config)

    All downstream code continues to call get_tenant_id() unchanged.
    """

    def __init__(self, app: ASGIApp, resolver: "TenantResolver | None" = None) -> None:
        super().__init__(app)
        if resolver is None:
            # Lazy import to avoid circular dependency at module load time;
            # falls back to the original header-based behaviour.
            from src.core.tenant import MultiTenantResolver

            resolver = MultiTenantResolver()
        self._resolver = resolver

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        # Exact-match public paths (no auth required at all)
        public_paths = ["/health", "/ready", "/docs", "/openapi.json", "/redoc",
                        "/diagnostics", "/diagnostics/db"]

        # Prefix-match paths that authenticate via their own mechanism and
        # resolve tenant server-side — X-Tenant-ID header is not sent for these.
        #
        # /webhooks  — GitHub/Stripe webhooks: HMAC signature, tenant from installation_id
        # /check     — VS Code plugin: Bearer API key, tenant resolved by key lookup
        # /auth/saml — SAML flow: tenant from ?tenant_id= query param
        # /scim/v2   — SCIM provisioning: Bearer scim token, tenant from token hash
        self_auth_prefixes = [
            "/webhooks",
            "/check",
            "/auth/saml",
            "/scim/v2",
            "/metrics",
            "/api/feedback",
        ]

        path = request.url.path
        tenant_id = await self._resolver.resolve(request)

        is_public = any(path == p for p in public_paths)
        is_self_auth = any(path.startswith(p) for p in self_auth_prefixes)

        # SEC-07: Enforce tenant context on all protected routes.
        if not tenant_id and not is_public and not is_self_auth:
            logger.warning("Missing X-Tenant-ID header — request rejected", path=path)
            return Response(content="Missing X-Tenant-ID", status_code=status.HTTP_401_UNAUTHORIZED)

        # Set the context variable
        token = tenant_id_context.set(tenant_id)
        try:
            response = await call_next(request)
            return response
        finally:
            # Reset context after request processed
            tenant_id_context.reset(token)


def get_tenant_id() -> str:
    """
    Retrieve the current tenant ID from context.

    Raises:
        RuntimeError: If no tenant ID is set in the current context.
    """
    tid = tenant_id_context.get()
    if tid is None:
        raise RuntimeError("No tenant context established")
    return tid


def set_tenant_id(tid: str):
    """Manually set tenant ID in context (useful for workers or webhooks)."""
    return tenant_id_context.set(tid)
