# SPDX-License-Identifier: AGPL-3.0-or-later
"""
ENT-12 SCIM 2.0 — RFC 7643 / 7644 Pydantic request & response schemas.

Only the User resource is implemented (Groups are out of scope for MVP).
"""

from typing import Any, List, Optional
from pydantic import BaseModel, Field

# ── Schema URNs ───────────────────────────────────────────────────────────────

SCIM_USER_SCHEMA    = "urn:ietf:params:scim:schemas:core:2.0:User"
SCIM_LIST_SCHEMA    = "urn:ietf:params:scim:api:messages:2.0:ListResponse"
SCIM_ERROR_SCHEMA   = "urn:ietf:params:scim:api:messages:2.0:Error"
SCIM_PATCH_SCHEMA   = "urn:ietf:params:scim:api:messages:2.0:PatchOp"
SCIM_SP_CFG_SCHEMA  = "urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig"
SCIM_SCHEMA_SCHEMA  = "urn:ietf:params:scim:schemas:core:2.0:Schema"

VALID_ROLES = {"ADMIN", "AUDITOR", "BILLING_ADMIN", "VIEWER"}


# ── Sub-objects ───────────────────────────────────────────────────────────────

class ScimName(BaseModel):
    formatted: Optional[str] = None
    givenName: Optional[str] = None
    familyName: Optional[str] = None


class ScimEmail(BaseModel):
    value: str
    primary: bool = False
    type: str = "work"


class ScimRole(BaseModel):
    value: str   # "ADMIN" | "VIEWER" | "AUDITOR" | "BILLING_ADMIN"
    primary: bool = True


class ScimMeta(BaseModel):
    resourceType: str = "User"
    created: Optional[str] = None
    lastModified: Optional[str] = None
    location: Optional[str] = None
    version: Optional[str] = None


# ── Core User resource ────────────────────────────────────────────────────────

class ScimUser(BaseModel):
    schemas: List[str] = Field(default_factory=lambda: [SCIM_USER_SCHEMA])
    id: Optional[str] = None
    externalId: Optional[str] = None
    userName: str                   # maps to User.email
    name: Optional[ScimName] = None
    displayName: Optional[str] = None
    emails: Optional[List[ScimEmail]] = None
    active: bool = True             # maps to User.scimActive
    roles: Optional[List[ScimRole]] = None
    meta: Optional[ScimMeta] = None


# ── List response ─────────────────────────────────────────────────────────────

class ScimListResponse(BaseModel):
    schemas: List[str] = Field(default_factory=lambda: [SCIM_LIST_SCHEMA])
    totalResults: int
    startIndex: int = 1
    itemsPerPage: int
    Resources: List[ScimUser] = Field(default_factory=list)


# ── Error response ────────────────────────────────────────────────────────────

class ScimError(BaseModel):
    schemas: List[str] = Field(default_factory=lambda: [SCIM_ERROR_SCHEMA])
    status: str
    detail: Optional[str] = None
    scimType: Optional[str] = None


# ── Patch operation ───────────────────────────────────────────────────────────

class ScimPatchOperation(BaseModel):
    op: str            # "add" | "replace" | "remove"
    path: Optional[str] = None
    value: Optional[Any] = None


class ScimPatchOp(BaseModel):
    schemas: List[str] = Field(default_factory=lambda: [SCIM_PATCH_SCHEMA])
    Operations: List[ScimPatchOperation]
