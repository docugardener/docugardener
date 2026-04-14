"""
ENT-12 SCIM 2.0 — User provisioning / deprovisioning for Okta and compatible IdPs.

Endpoints (RFC 7644):
  GET  /scim/v2/ServiceProviderConfig  — capability discovery
  GET  /scim/v2/Schemas                — schema discovery
  GET  /scim/v2/Users                  — list + filter (userName eq / emails.value eq)
  POST /scim/v2/Users                  — provision new user
  GET  /scim/v2/Users/{user_id}        — get single user
  PUT  /scim/v2/Users/{user_id}        — full user replace
  PATCH /scim/v2/Users/{user_id}       — partial update (active, role, name)
  DELETE /scim/v2/Users/{user_id}      — deactivate (soft delete)

Authentication:
  All endpoints require "Authorization: Bearer <token>" where the token was
  generated via POST /api/settings/scim { action: "generate" } in the Next.js
  admin UI. The raw token is shown once; only its SHA-256 hash is stored in
  Tenant.scimBearerTokenHash.

Tenant resolution:
  The bearer token is per-tenant (Okta associates one token per SCIM app).
  We look up Tenant by hashing the incoming token — no X-Tenant-ID header needed.

Deprovisioning:
  DELETE (and PATCH active=false) sets User.scimActive = false.
  The NextAuth JWT callback refuses tokens for inactive users, effectively
  blocking the user from signing in without deleting their data.
"""

import hashlib
import re
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Header, HTTPException, Query, Request
from fastapi.responses import JSONResponse

from src.core.logging import get_logger
from src.pipeline.job_manager import SessionLocal
from src.storage.sql_models import Tenant, User
from src.api.scim_models import (
    SCIM_ERROR_SCHEMA,
    SCIM_LIST_SCHEMA,
    SCIM_SCHEMA_SCHEMA,
    SCIM_SP_CFG_SCHEMA,
    SCIM_USER_SCHEMA,
    VALID_ROLES,
    ScimError,
    ScimListResponse,
    ScimPatchOp,
    ScimUser,
    ScimEmail,
    ScimMeta,
    ScimName,
    ScimRole,
)

logger = get_logger(__name__)

router = APIRouter(prefix="/scim/v2", tags=["SCIM"])

SCIM_CONTENT_TYPE = "application/scim+json"

# ── Helpers ────────────────────────────────────────────────────────────────────

def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _scim_response(data: dict, status: int = 200) -> JSONResponse:
    return JSONResponse(content=data, status_code=status, media_type=SCIM_CONTENT_TYPE)


def _scim_error(status: int, detail: str, scim_type: Optional[str] = None) -> JSONResponse:
    body = ScimError(status=str(status), detail=detail, scimType=scim_type).model_dump(
        exclude_none=True
    )
    return JSONResponse(content=body, status_code=status, media_type=SCIM_CONTENT_TYPE)


def _resolve_tenant(authorization: Optional[str]) -> Tenant:
    """Validate Bearer token and return the matching Tenant. Raises 401 on failure."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Missing or invalid Authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )
    raw_token = authorization[len("Bearer "):]
    token_hash = _hash_token(raw_token)
    db = SessionLocal()
    try:
        tenant = (
            db.query(Tenant)
            .filter(
                Tenant.scimEnabled == True,  # noqa: E712
                Tenant.scimBearerTokenHash == token_hash,
            )
            .first()
        )
    finally:
        db.close()
    if not tenant:
        raise HTTPException(
            status_code=401,
            detail="Invalid SCIM bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return tenant


def _user_to_scim(user: User, base_url: str = "") -> dict:
    """Convert a User SQLAlchemy model to a SCIM User dict."""
    roles = [{"value": user.role, "primary": True}] if user.role else []
    emails = [{"value": user.email, "primary": True, "type": "work"}] if user.email else []
    name_parts = (user.name or "").split(" ", 1)
    scim = ScimUser(
        id=user.id,
        externalId=user.externalId,
        userName=user.email or "",
        displayName=user.name,
        name=ScimName(
            formatted=user.name,
            givenName=name_parts[0] if name_parts else None,
            familyName=name_parts[1] if len(name_parts) > 1 else None,
        ),
        emails=[ScimEmail(value=e["value"], primary=e["primary"], type=e["type"]) for e in emails],
        active=bool(user.scimActive),
        roles=[ScimRole(value=r["value"], primary=r["primary"]) for r in roles],
        meta=ScimMeta(
            resourceType="User",
            created=user.createdAt.isoformat() if hasattr(user, "createdAt") and user.createdAt else None,
            lastModified=user.updatedAt.isoformat() if hasattr(user, "updatedAt") and user.updatedAt else None,
            location=f"{base_url}/scim/v2/Users/{user.id}" if base_url else None,
        ),
    )
    return scim.model_dump(exclude_none=True)


def _parse_filter(filter_str: str) -> Optional[tuple[str, str]]:
    """
    Parse a minimal SCIM filter: 'userName eq "value"' or 'emails.value eq "value"'.
    Returns (field, value) or None if unrecognised.
    """
    m = re.match(r'(userName|emails\.value)\s+eq\s+"([^"]+)"', filter_str.strip(), re.IGNORECASE)
    if m:
        return m.group(1).lower(), m.group(2)
    return None


def _role_from_scim(roles: Optional[list]) -> str:
    """Extract DocuGardener role from SCIM roles list; default VIEWER."""
    if not roles:
        return "VIEWER"
    for r in roles:
        val = (r.get("value") or "").upper()
        if val in VALID_ROLES:
            return val
    return "VIEWER"


def _generate_id() -> str:
    try:
        import cuid  # type: ignore
        return cuid.cuid()
    except Exception:
        return str(uuid.uuid4())


# ── Discovery endpoints ────────────────────────────────────────────────────────

@router.get("/ServiceProviderConfig")
async def service_provider_config(authorization: Optional[str] = Header(None)):
    _resolve_tenant(authorization)
    return _scim_response({
        "schemas": [SCIM_SP_CFG_SCHEMA],
        "documentationUri": "https://docs.docugardener.io/scim",
        "patch": {"supported": True},
        "bulk": {"supported": False, "maxOperations": 0, "maxPayloadSize": 0},
        "filter": {"supported": True, "maxResults": 200},
        "changePassword": {"supported": False},
        "sort": {"supported": False},
        "etag": {"supported": False},
        "authenticationSchemes": [
            {
                "type": "oauthbearertoken",
                "name": "OAuth Bearer Token",
                "description": "Authentication scheme using the OAuth Bearer Token standard",
            }
        ],
    })


@router.get("/Schemas")
async def list_schemas(authorization: Optional[str] = Header(None)):
    _resolve_tenant(authorization)
    user_schema = {
        "schemas": [SCIM_SCHEMA_SCHEMA],
        "id": SCIM_USER_SCHEMA,
        "name": "User",
        "description": "User Account",
        "attributes": [
            {"name": "userName", "type": "string", "required": True, "caseExact": False, "mutability": "readWrite", "returned": "default", "uniqueness": "server"},
            {"name": "name", "type": "complex", "required": False, "mutability": "readWrite", "returned": "default"},
            {"name": "displayName", "type": "string", "required": False, "mutability": "readWrite", "returned": "default"},
            {"name": "emails", "type": "complex", "multiValued": True, "required": False, "mutability": "readWrite", "returned": "default"},
            {"name": "active", "type": "boolean", "required": False, "mutability": "readWrite", "returned": "default"},
            {"name": "roles", "type": "complex", "multiValued": True, "required": False, "mutability": "readWrite", "returned": "default"},
        ],
        "meta": {"resourceType": "Schema", "location": "/scim/v2/Schemas/" + SCIM_USER_SCHEMA},
    }
    return _scim_response({
        "schemas": [SCIM_LIST_SCHEMA],
        "totalResults": 1,
        "itemsPerPage": 1,
        "startIndex": 1,
        "Resources": [user_schema],
    })


# ── User CRUD ──────────────────────────────────────────────────────────────────

@router.get("/Users")
async def list_users(
    request: Request,
    authorization: Optional[str] = Header(None),
    filter: Optional[str] = Query(None),
    startIndex: int = Query(1, ge=1),
    count: int = Query(100, ge=1, le=200),
):
    tenant = _resolve_tenant(authorization)
    base_url = str(request.base_url).rstrip("/")

    db = SessionLocal()
    try:
        query = db.query(User).filter(User.tenantId == tenant.id)

        if filter:
            parsed = _parse_filter(filter)
            if parsed:
                _, email_val = parsed
                query = query.filter(User.email == email_val)
            else:
                logger.warning("scim.unsupported_filter", filter=filter)

        total = query.count()
        users = query.offset(startIndex - 1).limit(count).all()

        resources = [_user_to_scim(u, base_url) for u in users]
        body = ScimListResponse(
            totalResults=total,
            startIndex=startIndex,
            itemsPerPage=len(resources),
            Resources=[],
        ).model_dump(exclude_none=True)
        body["Resources"] = resources
        return _scim_response(body)
    finally:
        db.close()


@router.post("/Users", status_code=201)
async def create_user(request: Request, authorization: Optional[str] = Header(None)):
    tenant = _resolve_tenant(authorization)
    base_url = str(request.base_url).rstrip("/")

    try:
        payload = await request.json()
    except Exception:
        return _scim_error(400, "Invalid JSON body", "invalidValue")

    email = payload.get("userName") or next(
        (e.get("value") for e in (payload.get("emails") or []) if e.get("primary")), None
    )
    if not email:
        return _scim_error(400, "userName is required", "invalidValue")

    external_id = payload.get("externalId")
    active = payload.get("active", True)
    role = _role_from_scim(payload.get("roles"))

    # Build display name
    name_obj = payload.get("name") or {}
    display_name = (
        payload.get("displayName")
        or name_obj.get("formatted")
        or f"{name_obj.get('givenName', '')} {name_obj.get('familyName', '')}".strip()
        or email.split("@")[0]
    )

    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.email == email).first()
        if existing:
            if existing.tenantId != tenant.id:
                return _scim_error(409, "User already belongs to another tenant", "uniqueness")
            # Idempotent: return existing user
            return _scim_response(_user_to_scim(existing, base_url), status=200)

        user = User(
            id=_generate_id(),
            email=email,
            name=display_name,
            role=role,
            tenantId=tenant.id,
            externalId=external_id,
            scimActive=active,
        )
        db.add(user)
        # Update last sync timestamp
        db.query(Tenant).filter(Tenant.id == tenant.id).update(
            {"scimLastSyncAt": datetime.now(timezone.utc)}
        )
        db.commit()
        db.refresh(user)
        logger.info("scim.user_created", email=email, tenant_id=tenant.id, role=role)
        return _scim_response(_user_to_scim(user, base_url), status=201)
    finally:
        db.close()


@router.get("/Users/{user_id}")
async def get_user(
    user_id: str,
    request: Request,
    authorization: Optional[str] = Header(None),
):
    tenant = _resolve_tenant(authorization)
    base_url = str(request.base_url).rstrip("/")

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id, User.tenantId == tenant.id).first()
        if not user:
            return _scim_error(404, f"User {user_id} not found")
        return _scim_response(_user_to_scim(user, base_url))
    finally:
        db.close()


@router.put("/Users/{user_id}")
async def replace_user(
    user_id: str,
    request: Request,
    authorization: Optional[str] = Header(None),
):
    tenant = _resolve_tenant(authorization)
    base_url = str(request.base_url).rstrip("/")

    try:
        payload = await request.json()
    except Exception:
        return _scim_error(400, "Invalid JSON body", "invalidValue")

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id, User.tenantId == tenant.id).first()
        if not user:
            return _scim_error(404, f"User {user_id} not found")

        name_obj = payload.get("name") or {}
        display_name = (
            payload.get("displayName")
            or name_obj.get("formatted")
            or f"{name_obj.get('givenName', '')} {name_obj.get('familyName', '')}".strip()
            or user.name
        )
        new_active = payload.get("active", True)
        old_active = bool(user.scimActive)
        new_role = _role_from_scim(payload.get("roles"))

        user.name = display_name or user.name
        user.role = new_role
        user.scimActive = new_active
        user.externalId = payload.get("externalId", user.externalId)
        db.query(Tenant).filter(Tenant.id == tenant.id).update(
            {"scimLastSyncAt": datetime.now(timezone.utc)}
        )
        db.commit()
        db.refresh(user)

        if old_active and not new_active:
            logger.info("scim.user_deactivated", user_id=user_id, tenant_id=tenant.id)
        elif not old_active and new_active:
            logger.info("scim.user_reactivated", user_id=user_id, tenant_id=tenant.id)

        return _scim_response(_user_to_scim(user, base_url))
    finally:
        db.close()


@router.patch("/Users/{user_id}")
async def patch_user(
    user_id: str,
    request: Request,
    authorization: Optional[str] = Header(None),
):
    tenant = _resolve_tenant(authorization)
    base_url = str(request.base_url).rstrip("/")

    try:
        raw = await request.json()
    except Exception:
        return _scim_error(400, "Invalid JSON body", "invalidValue")

    try:
        patch = ScimPatchOp(**raw)
    except Exception:
        return _scim_error(400, "Invalid PatchOp body", "invalidValue")

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id, User.tenantId == tenant.id).first()
        if not user:
            return _scim_error(404, f"User {user_id} not found")

        old_active = bool(user.scimActive)

        for op in patch.Operations:
            op_name = op.op.lower()
            path = (op.path or "").lower()
            value = op.value

            if op_name in ("replace", "add"):
                if path == "active":
                    user.scimActive = value if isinstance(value, bool) else bool(value)
                elif path in ("username", 'emails[type eq "work"].value'):
                    if isinstance(value, str):
                        user.email = value
                elif path in ("displayname", "name.formatted"):
                    if isinstance(value, str):
                        user.name = value
                elif path == "roles":
                    roles_list = value if isinstance(value, list) else ([value] if value else [])
                    user.role = _role_from_scim(roles_list)
                elif not path and isinstance(value, dict):
                    # Bulk replace: no path, value is a dict of attributes
                    if "active" in value:
                        user.scimActive = value["active"]
                    if "displayName" in value:
                        user.name = value["displayName"]
                    if "roles" in value:
                        user.role = _role_from_scim(value["roles"])
            elif op_name == "remove":
                if path == "active":
                    user.scimActive = False

        db.query(Tenant).filter(Tenant.id == tenant.id).update(
            {"scimLastSyncAt": datetime.now(timezone.utc)}
        )
        db.commit()
        db.refresh(user)

        new_active = bool(user.scimActive)
        if old_active and not new_active:
            logger.info("scim.user_deactivated", user_id=user_id, tenant_id=tenant.id)
        elif not old_active and new_active:
            logger.info("scim.user_reactivated", user_id=user_id, tenant_id=tenant.id)

        return _scim_response(_user_to_scim(user, base_url))
    finally:
        db.close()


@router.delete("/Users/{user_id}", status_code=204)
async def delete_user(
    user_id: str,
    authorization: Optional[str] = Header(None),
):
    """Deactivate (soft-delete) a user. Data is preserved; sign-in is blocked."""
    tenant = _resolve_tenant(authorization)

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id, User.tenantId == tenant.id).first()
        if not user:
            return _scim_error(404, f"User {user_id} not found")
        user.scimActive = False
        db.query(Tenant).filter(Tenant.id == tenant.id).update(
            {"scimLastSyncAt": datetime.now(timezone.utc)}
        )
        db.commit()
        logger.info("scim.user_deactivated", user_id=user_id, tenant_id=tenant.id)
        # 204 No Content — no body
        from fastapi.responses import Response
        return Response(status_code=204)
    finally:
        db.close()
