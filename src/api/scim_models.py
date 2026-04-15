# SPDX-License-Identifier: AGPL-3.0-or-later
"""
ENT-12 SCIM 2.0 — RFC 7643 / 7644 Pydantic request & response schemas.

Only the User resource is implemented (Groups are out of scope for MVP).
"""

from typing import Any

from pydantic import BaseModel, Field

# ── Schema URNs ───────────────────────────────────────────────────────────────

SCIM_USER_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:User"
SCIM_LIST_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:ListResponse"
SCIM_ERROR_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:Error"
SCIM_PATCH_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:PatchOp"
SCIM_SP_CFG_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig"
SCIM_SCHEMA_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:Schema"

VALID_ROLES = {"ADMIN", "AUDITOR", "BILLING_ADMIN", "VIEWER"}


# ── Sub-objects ───────────────────────────────────────────────────────────────


class ScimName(BaseModel):
    formatted: str | None = None
    givenName: str | None = None
    familyName: str | None = None


class ScimEmail(BaseModel):
    value: str
    primary: bool = False
    type: str = "work"


class ScimRole(BaseModel):
    value: str  # "ADMIN" | "VIEWER" | "AUDITOR" | "BILLING_ADMIN"
    primary: bool = True


class ScimMeta(BaseModel):
    resourceType: str = "User"
    created: str | None = None
    lastModified: str | None = None
    location: str | None = None
    version: str | None = None


# ── Core User resource ────────────────────────────────────────────────────────


class ScimUser(BaseModel):
    schemas: list[str] = Field(default_factory=lambda: [SCIM_USER_SCHEMA])
    id: str | None = None
    externalId: str | None = None
    userName: str  # maps to User.email
    name: ScimName | None = None
    displayName: str | None = None
    emails: list[ScimEmail] | None = None
    active: bool = True  # maps to User.scimActive
    roles: list[ScimRole] | None = None
    meta: ScimMeta | None = None


# ── List response ─────────────────────────────────────────────────────────────


class ScimListResponse(BaseModel):
    schemas: list[str] = Field(default_factory=lambda: [SCIM_LIST_SCHEMA])
    totalResults: int
    startIndex: int = 1
    itemsPerPage: int
    Resources: list[ScimUser] = Field(default_factory=list)


# ── Error response ────────────────────────────────────────────────────────────


class ScimError(BaseModel):
    schemas: list[str] = Field(default_factory=lambda: [SCIM_ERROR_SCHEMA])
    status: str
    detail: str | None = None
    scimType: str | None = None


# ── Patch operation ───────────────────────────────────────────────────────────


class ScimPatchOperation(BaseModel):
    op: str  # "add" | "replace" | "remove"
    path: str | None = None
    value: Any | None = None


class ScimPatchOp(BaseModel):
    schemas: list[str] = Field(default_factory=lambda: [SCIM_PATCH_SCHEMA])
    Operations: list[ScimPatchOperation]
