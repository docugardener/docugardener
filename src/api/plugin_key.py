"""Plugin API key management — generate and retrieve the VS Code plugin key (DX-02)."""

import secrets

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional

from src.api.middleware import get_tenant_id
from src.pipeline.job_manager import get_db
from src.storage.sql_models import Tenant
from src.core.logging import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/plugin-key", tags=["Plugin"])

_KEY_PREFIX = "dg_"
_KEY_RANDOM_BYTES = 24  # 48 hex chars → 192-bit entropy


class PluginKeyResponse(BaseModel):
    pluginApiKey: Optional[str]
    isSet: bool


@router.get("", response_model=PluginKeyResponse)
def get_plugin_key(db: Session = Depends(get_db)):
    """
    Return whether a plugin API key exists and a masked preview of it.
    The full key is only returned immediately after generation (POST).
    """
    tenant_id = get_tenant_id()
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")

    config = dict(tenant.workflowConfig or {})
    key = config.get("pluginApiKey")
    if key:
        # Show prefix + first 8 chars, then mask the rest
        visible = key[:len(_KEY_PREFIX) + 8]
        masked = visible + "..." + key[-4:]
        return PluginKeyResponse(pluginApiKey=masked, isSet=True)
    return PluginKeyResponse(pluginApiKey=None, isSet=False)


@router.post("", response_model=PluginKeyResponse)
def rotate_plugin_key(db: Session = Depends(get_db)):
    """
    Generate a new plugin API key and persist it to workflowConfig.
    Returns the full key — this is the only time it is shown in plain text.
    Calling this endpoint again invalidates the previous key.
    """
    tenant_id = get_tenant_id()
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")

    new_key = _KEY_PREFIX + secrets.token_hex(_KEY_RANDOM_BYTES)
    config = dict(tenant.workflowConfig or {})
    config["pluginApiKey"] = new_key
    tenant.workflowConfig = config
    db.commit()

    logger.info("Plugin API key rotated", tenant_id=tenant_id)

    return PluginKeyResponse(pluginApiKey=new_key, isSet=True)
