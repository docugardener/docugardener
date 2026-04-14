# SPDX-License-Identifier: AGPL-3.0-or-later
"""HYB-04: Single-tenant auto-provisioning for client-installed and air-gap modes.

At startup (after DB is confirmed healthy), ensure_tenant_provisioned() checks
whether a tenant already exists. If not, it creates one with a deterministic ID
and optionally creates an initial ADMIN user from ADMIN_EMAIL.

SaaS mode: this function is a no-op — tenant management is handled by the
onboarding flow.
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import text
from sqlalchemy.orm import Session

from src.core.logging import get_logger

if TYPE_CHECKING:
    from src.core.config import Settings

logger = get_logger(__name__)

DEFAULT_TENANT_ID = "default"


async def ensure_tenant_provisioned(db: Session, settings: "Settings") -> None:
    """Create the default tenant and admin user for non-SaaS deployments.

    This function is idempotent — calling it multiple times produces the same
    result. It relies on the Prisma-managed schema (tenants + users tables) and
    uses raw SQL so it has no dependency on Prisma's generated client.

    Args:
        db:       SQLAlchemy Session connected to the web database.
        settings: Application settings; single_tenant_id is mutated in-place
                  so that SingleTenantResolver (HYB-03) picks up the value
                  immediately without a restart.
    """
    if settings.deployment_mode not in ("client-installed", "air-gap"):
        return  # No-op for SaaS (and any unknown value) — onboarding flow handles tenants

    _validate_required_env(settings)

    tenant_id = await _ensure_tenant(db, settings)
    settings.single_tenant_id = tenant_id

    if settings.admin_email:
        await _ensure_admin_user(db, tenant_id, settings.admin_email)
    else:
        logger.warning(
            "HYB-04: ADMIN_EMAIL not set — no admin user created. "
            "Set ADMIN_EMAIL to create an initial admin account at startup.",
            deployment_mode=settings.deployment_mode,
        )


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _validate_required_env(settings: "Settings") -> None:
    """Raise RuntimeError for missing required env vars in non-SaaS modes."""
    if not settings.github_org:
        raise RuntimeError(
            f"HYB-04: GITHUB_ORG is required when DEPLOYMENT_MODE="
            f"{settings.deployment_mode!r}. "
            "Set it to your GitHub organization name (e.g. GITHUB_ORG=acme-corp)."
        )


async def _ensure_tenant(db: Session, settings: "Settings") -> str:
    """Find or create the single tenant. Returns the tenant ID."""
    # If SINGLE_TENANT_ID is pre-configured, verify it exists and use it directly
    if settings.single_tenant_id:
        result = db.execute(
            text('SELECT id FROM "Tenant" WHERE id = :id'),
            {"id": settings.single_tenant_id},
        ).fetchone()
        if result:
            logger.info(
                "HYB-04: Existing tenant found — reusing",
                tenant_id=result[0],
                deployment_mode=settings.deployment_mode,
            )
            return result[0]

    # Check if any tenant exists
    result = db.execute(text('SELECT id FROM "Tenant" LIMIT 1')).fetchone()
    if result:
        tenant_id = result[0]
        logger.info(
            "HYB-04: Existing tenant found — reusing",
            tenant_id=tenant_id,
            deployment_mode=settings.deployment_mode,
        )
        return tenant_id

    # No tenant — create default
    tenant_id = DEFAULT_TENANT_ID
    now = "NOW()"
    db.execute(
        text(
            'INSERT INTO "Tenant" (id, name, plan, "createdAt", "updatedAt") '
            "VALUES (:id, :name, :plan, NOW(), NOW()) "
            'ON CONFLICT (id) DO NOTHING'
        ),
        {
            "id": tenant_id,
            "name": settings.github_org or "Default Organization",
            "plan": "FREE",
        },
    )
    db.commit()
    logger.info(
        "HYB-04: Default tenant created",
        tenant_id=tenant_id,
        name=settings.github_org,
        deployment_mode=settings.deployment_mode,
    )
    return tenant_id


async def _ensure_admin_user(db: Session, tenant_id: str, admin_email: str) -> None:
    """Upsert an ADMIN user for the given tenant."""
    existing = db.execute(
        text('SELECT id FROM "User" WHERE email = :email AND "tenantId" = :tenant_id'),
        {"email": admin_email, "tenant_id": tenant_id},
    ).fetchone()

    if existing:
        logger.info(
            "HYB-04: Admin user already exists — skipping creation",
            email=admin_email,
            tenant_id=tenant_id,
        )
        return

    user_id = str(uuid.uuid4())
    db.execute(
        text(
            'INSERT INTO "User" (id, email, name, role, "tenantId", "createdAt", "updatedAt") '
            "VALUES (:id, :email, :name, :role, :tenant_id, NOW(), NOW()) "
            "ON CONFLICT DO NOTHING"
        ),
        {
            "id": user_id,
            "email": admin_email,
            "name": admin_email.split("@")[0],
            "role": "ADMIN",
            "tenant_id": tenant_id,
        },
    )
    db.commit()
    logger.info(
        "HYB-04: Admin user created",
        email=admin_email,
        user_id=user_id,
        tenant_id=tenant_id,
    )
