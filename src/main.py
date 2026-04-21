# SPDX-License-Identifier: AGPL-3.0-or-later
"""DocuGardener FastAPI Application Entry Point."""

import time
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from prometheus_client import make_asgi_app as make_metrics_app

from src.api.billing import router as billing_router
from src.api.check import router as check_router
from src.api.diagnostics import router as diagnostics_router
from src.api.feedback import router as feedback_router
from src.api.health import router as health_router
from src.api.inbox import router as inbox_router
from src.api.middleware import TenantContextMiddleware
from src.api.plugin_key import router as plugin_key_router
from src.api.prompts import router as prompts_router
from src.api.repos import router as repos_router
from src.api.rules import router as rules_router
from src.api.saml import router as saml_router
from src.api.scim import router as scim_router
from src.api.webhooks import router as webhooks_router
from src.core.config import settings
from src.core.logging import get_logger
from src.core.provisioning import ensure_tenant_provisioned
from src.core.tenant import create_tenant_resolver
from src.monitoring.metrics import HTTP_REQUEST_DURATION, HTTP_REQUESTS_TOTAL
from src.stripe.webhooks import router as stripe_router

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan manager for startup/shutdown events."""
    # Startup
    print(f"🌱 Starting {settings.app_name} v{settings.version}")
    print(f"   Environment: {settings.app_env}")
    print(f"   Debug: {settings.debug}")

    # SEC-11: Validate CORS origins and DB URL are explicitly set in production.
    settings.validate_production_config()

    # HYB-07: Air-gap license validation (optional — AGPL self-hosters skip this)
    if settings.deployment_mode in ("air-gap",):
        from pathlib import Path

        from src.core.license import LicenseError, validate_license_file

        if Path(settings.license_file_path).exists():
            try:
                license_payload = validate_license_file(settings.license_file_path)
                logger.info(
                    "HYB-07: Air-gap license validated",
                    org=license_payload.org_name,
                    plan=license_payload.plan,
                    expires=str(license_payload.expires_at.date()),
                )
                # Warn if LLM provider is not Ollama — only local LLM works in air-gap
                if settings.llm_provider != "ollama":
                    logger.warning(
                        "HYB-07: LLM provider is not 'ollama' in air-gap mode — "
                        "bundled cloud LLM keys are ignored. Set LLM_PROVIDER=ollama.",
                        llm_provider=settings.llm_provider,
                    )
            except LicenseError as _lic_err:
                logger.warning(
                    "HYB-07: Air-gap license validation failed — continuing without license",
                    error=str(_lic_err),
                )
        else:
            logger.debug(
                "HYB-07: No license file found — running as AGPL self-hosted",
                license_file_path=settings.license_file_path,
            )

    # HYB-04: Single-tenant auto-provisioning (client-installed / air-gap only)
    if settings.deployment_mode in ("client-installed", "air-gap"):
        try:
            from src.pipeline.job_manager import SessionLocal

            with SessionLocal() as db:
                await ensure_tenant_provisioned(db, settings)
        except Exception as _prov_err:
            logger.critical(
                "HYB-04: Tenant provisioning failed — aborting startup",
                error=str(_prov_err),
                deployment_mode=settings.deployment_mode,
            )
            raise

    # SEC-06: Validate encryption key at startup so a misconfigured production
    # environment fails immediately rather than silently using the dev fallback.
    if settings.app_env != "development":
        if not settings.encryption_key:
            raise RuntimeError(
                "ENCRYPTION_KEY is required in non-development environments. "
                "Generate with: openssl rand -hex 32"
            )
        try:
            key_bytes = bytes.fromhex(settings.encryption_key)
            if len(key_bytes) != 32:
                raise ValueError(f"got {len(key_bytes)} bytes")
        except ValueError as exc:
            raise RuntimeError(
                f"ENCRYPTION_KEY is invalid — must be 64 hex characters (32 bytes): {exc}"
            ) from exc
        logger.info("SEC-06: Encryption key validated", app_env=settings.app_env)

    # GAP-03: Validate Weaviate schema at startup so the app fails fast
    # when the vector DB is unreachable rather than at first query.
    # Graceful degradation — the app still starts; vector search is simply unavailable.
    try:
        from src.storage.weaviate_db import COLLECTION_NAME, WeaviateDB

        _weaviate = WeaviateDB()
        await _weaviate.initialize()
        logger.info(
            "GAP-03: Weaviate schema validated",
            collection=COLLECTION_NAME,
            url=settings.weaviate_url,
        )
        await _weaviate.close()
    except Exception as _wv_err:
        logger.critical(
            "GAP-03: Weaviate unreachable at startup — vector search degraded",
            error=str(_wv_err),
            url=settings.weaviate_url,
        )

    yield

    # Shutdown
    print(f"🛑 Shutting down {settings.app_name}")


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    app = FastAPI(
        title=settings.app_name,
        description="AI-powered documentation drift detection service",
        version=settings.version,
        lifespan=lifespan,
        docs_url="/docs" if settings.debug else None,
        redoc_url="/redoc" if settings.debug else None,
    )

    # CORS middleware
    # Never use wildcard origins/methods/headers — even in dev.
    # Fall back to localhost ports used by the dev Next.js server.
    cors_origins = settings.allowed_origins or [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3003",
    ]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization", "X-Tenant-ID", "X-Request-ID"],
    )

    # Prometheus HTTP instrumentation middleware
    @app.middleware("http")
    async def prometheus_http_middleware(request: Request, call_next):
        start = time.time()
        # Normalise path — strip UUIDs/IDs so cardinality stays low
        path = request.url.path
        for segment in path.split("/"):
            if len(segment) > 20 or (segment and segment[0].isdigit()):
                path = path.replace(segment, "{id}", 1)
        response = await call_next(request)
        duration = time.time() - start
        HTTP_REQUESTS_TOTAL.labels(
            method=request.method,
            endpoint=path,
            status=str(response.status_code),
        ).inc()
        HTTP_REQUEST_DURATION.labels(method=request.method, endpoint=path).observe(duration)
        return response

    # HYB-03: Tenant Context Middleware — resolver selected by deployment_mode
    resolver = create_tenant_resolver(settings)
    app.add_middleware(TenantContextMiddleware, resolver=resolver)

    # Register routers
    app.include_router(health_router, tags=["Health"])
    app.include_router(diagnostics_router, tags=["Diagnostics"])
    app.include_router(webhooks_router, prefix="/webhooks", tags=["Webhooks"])
    # HYB-05: Only mount Stripe webhook router in SaaS mode.
    # In client-installed / air-gap modes Stripe is not configured.
    if settings.deployment_mode == "saas":
        app.include_router(stripe_router, prefix="/webhooks", tags=["Stripe"])
    app.include_router(prompts_router, prefix="/prompts", tags=["Prompts"])
    app.include_router(inbox_router, tags=["Inbox"])
    app.include_router(repos_router, prefix="/repos", tags=["Repos"])
    app.include_router(check_router, tags=["Plugin"])
    app.include_router(plugin_key_router, tags=["Plugin"])
    app.include_router(saml_router, tags=["SSO"])
    app.include_router(scim_router, tags=["SCIM"])
    app.include_router(feedback_router, tags=["Feedback"])
    app.include_router(rules_router, tags=["Rules"])
    app.include_router(billing_router, prefix="/billing", tags=["Billing"])

    # Prometheus metrics endpoint — public, scraped by Prometheus every 15s
    app.mount("/metrics", make_metrics_app())

    # Global fallback: Starlette's default error handler returns plain text,
    # which breaks the Next.js proxy's res.json() call. Always return JSON.
    @app.exception_handler(Exception)
    async def _json_500_handler(request: Request, exc: Exception) -> JSONResponse:
        logger.error(
            "Unhandled exception",
            path=request.url.path,
            method=request.method,
            error=repr(exc),
        )
        return JSONResponse({"detail": "Internal server error"}, status_code=500)

    return app


# Application instance
app = create_app()
