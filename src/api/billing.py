# SPDX-License-Identifier: AGPL-3.0-or-later
"""Billing / deployment profile endpoints.

GET /billing/profile  — deployment identity fields for the Settings UI card.
GET /billing/pending-changes — always returns [] (PlatformCloud sync removed).
"""

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from src.core.config import settings

router = APIRouter()


@router.get("/profile")
async def get_billing_profile() -> JSONResponse:
    """Return deployment identity fields for the Settings profile card."""
    license_key = settings.license_key or ""
    return JSONResponse(
        {
            "deployment_mode": settings.deployment_mode,
            "github_org": settings.github_org or None,
            "cloud_service_url": settings.cloud_service_url or None,
            # Show only last 8 chars — never expose the full key
            "license_key_fingerprint": license_key[-8:] if license_key else None,
            "license_status": None,
            "current_plan": None,
            "cancel_at": None,
        }
    )


@router.get("/pending-changes")
async def get_pending_changes() -> JSONResponse:
    """Returns pending plan changes. Always empty — PlatformCloud sync removed."""
    return JSONResponse({"pending_changes": []})
