# SPDX-License-Identifier: AGPL-3.0-or-later
"""ENV-DUP-01: Internal environment profile endpoint.

Allows the Next.js frontend to read GitHub App credentials from the backend
instead of duplicating them in web/.env. Only accessible with the shared
ENCRYPTION_KEY as an X-Internal-Token header — never exposed publicly.
"""

from __future__ import annotations

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from src.core.config import settings
from src.core.logging import get_logger

logger = get_logger(__name__)

router = APIRouter()


class GitHubAppProfile(BaseModel):
    appId: str
    webhookSecret: str
    privateKey: str


@router.get("/environment/github-app-profile", response_model=GitHubAppProfile)
async def github_app_profile(
    x_internal_token: str | None = Header(default=None),
) -> GitHubAppProfile:
    """Return GitHub App credentials for the onboarding prefill form.

    Authenticated via X-Internal-Token matching ENCRYPTION_KEY — only the
    Next.js server (which shares the same key) can call this endpoint.
    Never returns the raw private key path; reads and returns the PEM content
    so the frontend never needs filesystem access.
    """
    if not x_internal_token or x_internal_token != settings.encryption_key:
        raise HTTPException(status_code=401, detail="Unauthorized")

    private_key = ""
    if settings.github_private_key_path:
        try:
            private_key = settings.github_private_key_path.read_text()
        except OSError:
            logger.warning("GitHub App PEM unreadable", path=str(settings.github_private_key_path))

    return GitHubAppProfile(
        appId=settings.github_app_id or "",
        webhookSecret=settings.github_webhook_secret or "",
        privateKey=private_key,
    )
