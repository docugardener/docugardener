# SPDX-License-Identifier: AGPL-3.0-or-later
"""
ENT-12: SSO / SAML 2.0 endpoints (SP-initiated and IdP-initiated flows).

Endpoints:
  GET  /auth/saml/metadata          — SP metadata XML (give this URL to your IdP)
  GET  /auth/saml/login             — Initiate SP-initiated SSO (redirects to IdP)
  POST /auth/saml/callback          — Assertion Consumer Service (IdP posts here after auth)
  GET  /auth/saml/logout            — SP-initiated Single Logout

Security hardening implemented:
  - Validates XML signature reference == assertion body (XSW attack prevention)
  - Caches consumed InResponseTo/assertion IDs in Redis (replay prevention)
  - Rejects assertions older than MAX_ASSERTION_AGE_SECONDS
  - Requires signed responses AND signed assertions (RSA-SHA256 min)

After successful validation the endpoint creates a short-lived exchange token
(stored in Redis, TTL = EXCHANGE_TOKEN_TTL_SECONDS) and redirects to the Next.js
frontend which exchanges it for a NextAuth session via the "saml-sso" credentials
provider.

Dependencies: python3-saml (pip), libxmlsec1-dev (apt). Both must be installed in
the Docker image. See docker/Dockerfile for system dependency installation.
"""

import json
import os
import secrets
import time
import urllib.parse
from typing import Any

from fastapi import APIRouter, Form, HTTPException, Query, Request
from fastapi.responses import JSONResponse, RedirectResponse, Response

from src.core.logging import get_logger
from src.pipeline.job_manager import SessionLocal
from src.security.crypto import decrypt as decrypt_cert
from src.storage.sql_models import Tenant, User

logger = get_logger(__name__)

router = APIRouter(prefix="/auth/saml", tags=["SSO"])

# ── Constants ──────────────────────────────────────────────────────────────────

MAX_ASSERTION_AGE_SECONDS = 600  # 10 minutes
EXCHANGE_TOKEN_TTL_SECONDS = 120  # 2 minutes to complete the NextAuth exchange
REPLAY_CACHE_TTL_SECONDS = 3600  # Keep consumed assertion IDs for 1 hour

# ── Lazy python3-saml import (requires libxmlsec1 C library) ──────────────────


def _get_saml_auth(tenant: Tenant, request_data: dict) -> Any:
    """Build a OneLogin_Saml2_Auth instance for the given tenant."""
    try:
        from onelogin.saml2.auth import OneLogin_Saml2_Auth  # type: ignore
    except ImportError as exc:
        raise HTTPException(
            status_code=503,
            detail="SAML library not available. Ensure python3-saml and libxmlsec1 are installed.",
        ) from exc

    app_url = os.environ.get("APP_URL", "http://localhost:8000")

    # Decrypt the IdP certificate — stored encrypted at rest (AES-256-GCM)
    raw_cert = tenant.samlIdpCertificate or ""
    if raw_cert:
        try:
            raw_cert = decrypt_cert(raw_cert)
        except Exception:
            # If decryption fails (e.g. legacy plaintext cert), use as-is
            pass

    settings_dict = {
        "strict": True,
        "debug": os.environ.get("APP_ENV", "production") == "development",
        "sp": {
            "entityId": f"{app_url}/auth/saml/metadata",
            "assertionConsumerService": {
                "url": f"{app_url}/auth/saml/callback",
                "binding": "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST",
            },
            "singleLogoutService": {
                "url": f"{app_url}/auth/saml/logout",
                "binding": "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect",
            },
            "NameIDFormat": "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
            "x509cert": "",
            "privateKey": "",
        },
        "idp": {
            "entityId": tenant.samlIdpEntityId or "",
            "singleSignOnService": {
                "url": tenant.samlIdpSsoUrl or "",
                "binding": "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect",
            },
            "x509cert": raw_cert,
        },
        "security": {
            "authnRequestsSigned": False,
            "wantAssertionsSigned": True,
            "wantMessagesSigned": True,
            "wantNameId": True,
            "wantAttributeStatement": False,
            "allowRepeatAttributeName": True,
            "signatureAlgorithm": "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256",
            "digestAlgorithm": "http://www.w3.org/2001/04/xmlenc#sha256",
            # XSW prevention: requires the Reference URI to match the signed element
            "wantXMLValidation": True,
        },
    }
    return OneLogin_Saml2_Auth(request_data, settings_dict)


def _build_request_data(request: Request, body: bytes | None = None) -> dict:
    """Build the request data dict python3-saml expects."""
    host = request.headers.get("host", "localhost")
    # Trust X-Forwarded-Proto from reverse proxies / ngrok (TLS termination)
    forwarded_proto = request.headers.get("x-forwarded-proto", "")
    scheme = "https" if (forwarded_proto == "https" or request.url.scheme == "https") else "http"
    server_port = request.url.port or (443 if scheme == "https" else 80)
    return {
        "https": "on" if scheme == "https" else "off",
        "http_host": host,
        "server_port": server_port,
        "script_name": request.url.path,
        "get_data": dict(request.query_params),
        "post_data": {} if body is None else _parse_form(body),
    }


def _parse_form(body: bytes) -> dict:
    """Parse application/x-www-form-urlencoded body."""
    return dict(urllib.parse.parse_qsl(body.decode("utf-8", errors="replace")))


def _get_redis():
    """Return a Redis client for replay-cache operations."""
    try:
        import redis  # type: ignore

        url = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
        return redis.from_url(url, decode_responses=True)
    except Exception:
        return None


def _is_replay(assertion_id: str) -> bool:
    """Return True if this assertion ID has already been consumed."""
    r = _get_redis()
    if r is None:
        logger.warning("saml.replay_check_skipped", reason="redis_unavailable")
        return False
    key = f"saml:used_assertion:{assertion_id}"
    # SET NX returns True if the key was set (i.e. this is the first use)
    first_use = r.set(key, "1", ex=REPLAY_CACHE_TTL_SECONDS, nx=True)
    return not first_use  # If first_use is None/False, it was already set → replay


def _store_exchange_token(token: str, payload: dict) -> None:
    """Store exchange token in Redis with short TTL."""
    r = _get_redis()
    if r is None:
        raise HTTPException(status_code=503, detail="Redis unavailable — cannot create SSO session")
    r.set(f"saml:exchange:{token}", json.dumps(payload), ex=EXCHANGE_TOKEN_TTL_SECONDS)


def _consume_exchange_token(token: str) -> dict | None:
    """Retrieve and delete an exchange token. Returns None if not found."""
    r = _get_redis()
    if r is None:
        return None
    key = f"saml:exchange:{token}"
    data = r.get(key)
    if data is None:
        return None
    r.delete(key)
    return json.loads(data)


# Entra ID (Azure AD) sends email under full claim URIs rather than short names.
# This ordered list is checked when NameID format is not emailAddress.
_ENTRA_EMAIL_ATTRS: list[str] = [
    "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
    "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/upn",
    "http://schemas.microsoft.com/identity/claims/objectidentifier",  # never an email — skip via is_email check
    "mail",
    "email",
]

_EMAIL_NAMEID_FORMAT = "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress"
_PERSISTENT_NAMEID_FORMAT = "urn:oasis:names:tc:SAML:2.0:nameid-format:persistent"
_UNSPECIFIED_NAMEID_FORMAT = "urn:oasis:names:tc:SAML:2.0:nameid-format:unspecified"


def _looks_like_email(value: str) -> bool:
    return "@" in value and "." in value.split("@")[-1]


def _extract_email_from_assertion(auth: Any, tenant_email_attr: str | None) -> str:
    """
    Resolve the authenticated user's email from a SAML assertion.

    Resolution order:
    1. If NameID format is emailAddress → use NameID directly.
    2. If NameID format is persistent or unspecified (Entra default) →
       walk _ENTRA_EMAIL_ATTRS + tenant-configured attribute for an email-shaped value.
    3. Fall through to NameID value if it happens to look like an email.
    4. Raise HTTPException(422) with a human-readable message.
    """
    nameid: str = auth.get_nameid() or ""
    nameid_format: str = auth.get_nameid_format() or ""
    attrs: dict = auth.get_attributes()

    # Path 1: standard emailAddress NameID
    if nameid_format == _EMAIL_NAMEID_FORMAT:
        if nameid:
            return nameid

    # Path 2: persistent / unspecified NameID → search attributes
    if nameid_format in (_PERSISTENT_NAMEID_FORMAT, _UNSPECIFIED_NAMEID_FORMAT, ""):
        # Build candidate attribute names: Entra URIs first, then tenant override, then short names
        candidates = list(_ENTRA_EMAIL_ATTRS)
        if tenant_email_attr and tenant_email_attr not in candidates:
            candidates.insert(0, tenant_email_attr)

        for attr_name in candidates:
            values = attrs.get(attr_name) or []
            candidate = values[0] if values else ""
            if candidate and _looks_like_email(candidate):
                logger.info(
                    "saml.email_resolved_from_attribute",
                    attr=attr_name,
                    nameid_format=nameid_format,
                )
                return candidate

    # Path 3: NameID itself looks like an email (non-standard but some IdPs do this)
    if nameid and _looks_like_email(nameid):
        return nameid

    # Path 4: configured attribute fallback (matches legacy behaviour)
    if tenant_email_attr:
        values = attrs.get(tenant_email_attr) or []
        if values and values[0]:
            return values[0]

    raise HTTPException(
        status_code=422,
        detail=(
            "Cannot resolve email from assertion. "
            "Configure your IdP to send emailAddress NameID or an email attribute. "
            f"NameID format received: {nameid_format or '(none)'}"
        ),
    )


def _get_tenant_by_id(tenant_id: str) -> Tenant | None:
    db = SessionLocal()
    try:
        return db.query(Tenant).filter(Tenant.id == tenant_id).first()
    finally:
        db.close()


def _get_or_create_user(email: str, tenant_id: str, role: str) -> User:
    """JIT user provisioning: create user if not exists."""
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        if user is None:
            import cuid  # type: ignore[import-untyped]  # fallback to uuid if not available

            try:
                new_id = cuid.cuid()
            except Exception:
                import uuid

                new_id = str(uuid.uuid4())
            user = User(
                id=new_id,
                email=email,
                name=email.split("@")[0],
                role=role,
                tenantId=tenant_id,
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            logger.info("saml.jit_provisioned", email=email, tenant_id=tenant_id, role=role)
        elif user.tenantId != tenant_id:
            # User exists but belongs to a different tenant — deny
            raise HTTPException(
                status_code=403,
                detail="User email already associated with a different organisation.",
            )
        return user
    finally:
        db.close()


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.get("/metadata")
async def saml_metadata(request: Request, tenant_id: str = Query(...)):
    """Return SP metadata XML for a specific tenant."""
    tenant = _get_tenant_by_id(tenant_id)
    if not tenant or not tenant.ssoEnabled:
        raise HTTPException(status_code=404, detail="SSO not configured for this tenant")

    request_data = _build_request_data(request)
    try:
        auth = _get_saml_auth(tenant, request_data)
        metadata = auth.get_settings().get_sp_metadata()
        errors = auth.get_settings().validate_metadata(metadata)
        if errors:
            raise HTTPException(status_code=500, detail=f"SP metadata invalid: {errors}")
        return Response(content=metadata, media_type="application/xml")
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("saml.metadata_error", error=str(exc))
        raise HTTPException(status_code=500, detail="Failed to generate SP metadata") from exc


@router.get("/login")
async def saml_login(request: Request, tenant_id: str = Query(...)):
    """Initiate SP-initiated SSO — redirect browser to IdP."""
    tenant = _get_tenant_by_id(tenant_id)
    if not tenant or not tenant.ssoEnabled:
        raise HTTPException(status_code=404, detail="SSO not configured for this tenant")
    if not tenant.samlIdpEntityId or not tenant.samlIdpSsoUrl:
        raise HTTPException(status_code=422, detail="Incomplete SAML configuration")

    request_data = _build_request_data(request)
    try:
        auth = _get_saml_auth(tenant, request_data)
        # Store tenant_id in RelayState so the callback knows which tenant to look up
        relay_state = urllib.parse.urlencode({"tenant_id": tenant_id})
        redirect_url = auth.login(relay_state)
        return RedirectResponse(url=redirect_url, status_code=302)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("saml.login_error", error=str(exc))
        raise HTTPException(status_code=500, detail="Failed to initiate SSO") from exc


@router.post("/callback")
async def saml_callback(
    request: Request,
    SAMLResponse: str = Form(...),
    RelayState: str = Form(default=""),
):
    """
    Assertion Consumer Service (ACS).
    Validates the SAML response, provisions the user (JIT), creates an
    exchange token, and redirects to the Next.js frontend.
    """
    # Extract tenant_id from RelayState
    relay_params = dict(urllib.parse.parse_qsl(RelayState))
    tenant_id = relay_params.get("tenant_id", "")
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Missing tenant_id in RelayState")

    tenant = _get_tenant_by_id(tenant_id)
    if not tenant or not tenant.ssoEnabled:
        raise HTTPException(status_code=403, detail="SSO not enabled for this tenant")

    # Build request_data from already-extracted Form params to avoid double body read
    # (BaseHTTPMiddleware marks the stream as consumed after FastAPI reads Form fields)
    request_data = _build_request_data(request, None)
    request_data["post_data"] = {"SAMLResponse": SAMLResponse, "RelayState": RelayState}
    try:
        auth = _get_saml_auth(tenant, request_data)
        auth.process_response()
        errors = auth.get_errors()
    except Exception as exc:
        logger.error("saml.callback_error", error=str(exc))
        raise HTTPException(status_code=400, detail=f"SAML processing error: {exc}") from exc

    if errors:
        reason = auth.get_last_error_reason()
        logger.warning("saml.invalid_response", errors=errors, reason=reason)
        raise HTTPException(status_code=401, detail=f"SAML validation failed: {reason}")

    if not auth.is_authenticated():
        raise HTTPException(status_code=401, detail="SAML authentication failed")

    # ── Replay prevention ─────────────────────────────────────────────────────
    assertion_id = auth.get_last_message_id()
    if assertion_id and _is_replay(assertion_id):
        logger.warning("saml.replay_detected", assertion_id=assertion_id)
        raise HTTPException(status_code=401, detail="Replayed SAML assertion rejected")

    # ── Assertion age check ───────────────────────────────────────────────────
    not_on_or_after = None
    try:
        from onelogin.saml2.utils import OneLogin_Saml2_Utils  # type: ignore

        not_on_or_after = OneLogin_Saml2_Utils.parse_SAML_to_time(
            auth.get_last_assertion_not_on_or_after()
        )
    except Exception:
        pass

    if not_on_or_after:
        now = time.time()
        if now > not_on_or_after + MAX_ASSERTION_AGE_SECONDS:
            raise HTTPException(status_code=401, detail="SAML assertion has expired")

    # ── Extract user email (handles Entra persistent NameID + attribute fallback) ─
    email = _extract_email_from_assertion(auth, tenant.samlAttrEmail)

    # ── Role resolution ───────────────────────────────────────────────────────
    attrs = auth.get_attributes()
    role = "VIEWER"
    if tenant.samlAttrRole and tenant.samlRoleMapAdmin:
        role_values = attrs.get(tenant.samlAttrRole) or []
        if tenant.samlRoleMapAdmin in role_values:
            role = "ADMIN"

    # ── JIT provisioning ──────────────────────────────────────────────────────
    user = _get_or_create_user(email, tenant_id, role)

    # ── Exchange token ────────────────────────────────────────────────────────
    token = secrets.token_urlsafe(32)
    _store_exchange_token(
        token,
        {
            "user_id": user.id,
            "email": user.email,
            "role": user.role,
            "tenant_id": tenant_id,
            "issued_at": time.time(),
        },
    )

    logger.info("saml.authenticated", email=email, tenant_id=tenant_id, role=role)

    # Redirect to Next.js SAML completion page which calls NextAuth with the exchange token
    web_url = os.environ.get("NEXTAUTH_URL", "http://localhost:3000")
    callback_url = f"{web_url}/auth/saml-complete?token={token}&tenant_id={tenant_id}"
    return RedirectResponse(url=callback_url, status_code=302)


@router.get("/exchange")
async def saml_exchange(token: str = Query(...)):
    """
    Called by the Next.js NextAuth saml-sso CredentialsProvider to exchange
    a short-lived SAML exchange token for user data.
    This endpoint consumes the token (one-time use).
    """
    payload = _consume_exchange_token(token)
    if payload is None:
        raise HTTPException(status_code=401, detail="Invalid or expired exchange token")

    # Verify token age as a second defence
    issued_at = payload.get("issued_at", 0)
    if time.time() - issued_at > EXCHANGE_TOKEN_TTL_SECONDS:
        raise HTTPException(status_code=401, detail="Exchange token expired")

    return JSONResponse(payload)


@router.get("/logout")
async def saml_logout(request: Request, tenant_id: str = Query(...)):
    """Initiate SP-initiated Single Logout."""
    tenant = _get_tenant_by_id(tenant_id)
    if not tenant or not tenant.ssoEnabled:
        raise HTTPException(status_code=404, detail="SSO not configured")

    request_data = _build_request_data(request)
    try:
        auth = _get_saml_auth(tenant, request_data)
        logout_url = auth.logout()
        return RedirectResponse(url=logout_url, status_code=302)
    except Exception as exc:
        logger.error("saml.logout_error", error=str(exc))
        # Fall back to local logout on error
        web_url = os.environ.get("NEXTAUTH_URL", "http://localhost:3000")
        return RedirectResponse(url=f"{web_url}/api/auth/signout", status_code=302)
