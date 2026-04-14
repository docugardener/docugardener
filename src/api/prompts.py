from fastapi import APIRouter, HTTPException, Depends, Header
from pydantic import BaseModel
from typing import List, Optional
import re
import uuid

from src.storage.sql_models import PromptConfig, Tenant
from src.pipeline.job_manager import SessionLocal
from src.api.middleware import get_tenant_id
from src.agents import prompts as default_prompts
from src.core.logging import get_logger

router = APIRouter()
logger = get_logger(__name__)

# ── SEC-02: Guardrail constants ───────────────────────────────────────────────

_MAX_PROMPT_LENGTH = 8_000

# Jailbreak / prompt-injection signals (case-insensitive). Do NOT echo which
# pattern matched — return a generic error to prevent trial-and-error bypass.
_FORBIDDEN_PATTERNS: list[re.Pattern] = [
    re.compile(p, re.IGNORECASE) for p in [
        r"ignore\s+(all\s+|your\s+)?(previous\s+|prior\s+)?instructions",
        r"forget\s+(your\s+|all\s+)?instructions",
        r"you\s+are\s+(now\s+|a\s+)?(?!docugardener)",
        r"act\s+as\s+(a\s+|an\s+)?(?!documentation)",
        r"disregard\s+(your\s+|all\s+)?rules",
        r"pretend\s+(you\s+are|to\s+be)",
        r"dan\s+mode",
        r"jailbreak",
        r"override\s+(your\s+)?system\s+prompt",
        r"from\s+now\s+on\s+(you\s+|ignore\s+)",
    ]
]

# At least 2 of these keywords must appear (case-insensitive).
_DOMAIN_KEYWORDS = [
    "documentation", "doc", "drift", "code", "review", "change", "file",
    "diff", "pull request", "pr", "analysis", "verify", "technical", "api",
    "function", "parameter", "annotation", "comment", "markdown", "repository",
]


def _validate_prompt_content(content: str) -> None:
    """
    AC-2: Length cap.
    AC-3: Forbidden pattern blocklist.
    AC-4: Domain scope gate.
    Raises HTTPException(400) on any violation.
    """
    # AC-2 — length cap
    if len(content) > _MAX_PROMPT_LENGTH:
        raise HTTPException(
            status_code=400,
            detail={"error": "prompt_too_long", "max": _MAX_PROMPT_LENGTH},
        )

    # AC-3 — forbidden patterns
    for pattern in _FORBIDDEN_PATTERNS:
        if pattern.search(content):
            raise HTTPException(
                status_code=400,
                detail={
                    "error": "forbidden_content",
                    "reason": "Prompt contains patterns that are not permitted.",
                },
            )

    # AC-4 — domain scope gate
    lower = content.lower()
    matches = sum(1 for kw in _DOMAIN_KEYWORDS if kw in lower)
    if matches < 2:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "out_of_domain",
                "reason": "Prompt must relate to code review and documentation analysis.",
            },
        )


# ── Models ────────────────────────────────────────────────────────────────────

class PromptUpdate(BaseModel):
    key: str
    content: str

class PromptInfo(BaseModel):
    key: str
    content: str
    is_custom: bool


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/", response_model=List[PromptInfo])
async def list_prompts():
    """List all available prompts with their current content (custom or default)."""
    tenant_id = get_tenant_id()
    session = SessionLocal()
    try:
        custom_configs = session.query(PromptConfig).filter_by(tenantId=tenant_id).all()
        custom_map = {c.key: c.content for c in custom_configs}

        prompts = []
        for key in dir(default_prompts):
            if key.isupper() and isinstance(getattr(default_prompts, key), str):
                prompts.append(PromptInfo(
                    key=key,
                    content=custom_map.get(key, getattr(default_prompts, key)),
                    is_custom=key in custom_map,
                ))
        return prompts
    finally:
        session.close()


@router.post("/")
async def update_prompt(update: PromptUpdate):
    """
    Update (or create) a custom prompt override for the current tenant.
    SEC-02: Enforces length cap, forbidden-pattern blocklist, and domain scope.
    """
    tenant_id = get_tenant_id()

    # AC-2 / AC-3 / AC-4 — validate before touching the DB
    _validate_prompt_content(update.content)

    session = SessionLocal()
    try:
        tenant = session.query(Tenant).filter_by(id=tenant_id).first()
        if not tenant:
            raise HTTPException(status_code=404, detail="Tenant not found")

        if not hasattr(default_prompts, update.key):
            raise HTTPException(status_code=400, detail=f"Invalid prompt key: {update.key}")

        config = session.query(PromptConfig).filter_by(tenantId=tenant_id, key=update.key).first()
        if config:
            config.content = update.content
        else:
            config = PromptConfig(
                id=str(uuid.uuid4()),
                tenantId=tenant_id,
                key=update.key,
                content=update.content,
            )
            session.add(config)

        session.commit()
        logger.info("Updated custom prompt", tenant_id=tenant_id, key=update.key,
                    content_length=len(update.content))
        return {"status": "success", "key": update.key}
    except HTTPException:
        raise
    except Exception as e:
        session.rollback()
        logger.error("Failed to update prompt", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        session.close()


@router.post("/reset")
async def reset_prompt(key: str):
    """Delete a custom prompt override, reverting to system default."""
    tenant_id = get_tenant_id()
    session = SessionLocal()
    try:
        config = session.query(PromptConfig).filter_by(tenantId=tenant_id, key=key).first()
        if config:
            session.delete(config)
            session.commit()
            logger.info("Reset prompt to default", tenant_id=tenant_id, key=key)
            return {"status": "success", "message": f"Prompt {key} reset to default"}

        return {"status": "success", "message": "Prompt was already at default"}
    except Exception as e:
        session.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        session.close()
