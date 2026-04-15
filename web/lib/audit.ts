// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * ENT-11: SOC 2 Audit Logging
 *
 * writeAuditLog() is the single call site for all audit events.
 * It computes a SHA-256 hash that chains each row to the previous one,
 * making the log tamper-evident: deleting or modifying any row breaks
 * every subsequent hash.
 *
 * Chain formula:
 *   hash_n = SHA256( JSON(event_payload) + hash_{n-1} )
 *   hash_0 = SHA256( JSON(event_payload) + "" )
 */

import { createHash } from "crypto"
import { prisma } from "@/lib/prisma"

// Defined here rather than imported from @prisma/client so this module works
// before `prisma generate` is run (e.g. in CI, fresh checkout, unit tests).
export enum AuditEvent {
  USER_LOGIN = "USER_LOGIN",
  USER_LOGIN_FAILED = "USER_LOGIN_FAILED",
  SETTINGS_CHANGED = "SETTINGS_CHANGED",
  TRIAGE_DECISION = "TRIAGE_DECISION",
  REPO_TOGGLED = "REPO_TOGGLED",
  USER_INVITED = "USER_INVITED",
  USER_ROLE_CHANGED = "USER_ROLE_CHANGED",
  USER_REMOVED = "USER_REMOVED",
  SSO_LOGIN = "SSO_LOGIN",
  SSO_CONFIG_CHANGED = "SSO_CONFIG_CHANGED",
  SESSIONS_REVOKED = "SESSIONS_REVOKED",
  TRIAL_STARTED = "TRIAL_STARTED",
  TRIAL_EXPIRED = "TRIAL_EXPIRED",
  // SCIM 2.0 (ENT-12 follow-on)
  SCIM_USER_CREATED = "SCIM_USER_CREATED",
  SCIM_USER_UPDATED = "SCIM_USER_UPDATED",
  SCIM_USER_DEACTIVATED = "SCIM_USER_DEACTIVATED",
  SCIM_USER_REACTIVATED = "SCIM_USER_REACTIVATED",
  SCIM_TOKEN_ROTATED = "SCIM_TOKEN_ROTATED",
  // DOCPOL-01: Policy-as-Code
  POLICY_VIOLATION_DISMISSED = "POLICY_VIOLATION_DISMISSED",
  // SEC-09: Account linking (cross-provider email collision)
  ACCOUNT_LINKED = "ACCOUNT_LINKED",
}

export interface WriteAuditLogParams {
  tenantId: string
  actorId?: string | null
  actorEmail?: string | null
  actorIp?: string | null
  event: AuditEvent
  resourceType?: string | null
  resourceId?: string | null
  metadata?: Record<string, unknown> | null
}

/**
 * Extract the real client IP from a Next.js Request object.
 * Respects X-Forwarded-For (set by reverse proxies / Vercel).
 */
export function getClientIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for")
  if (forwarded) return forwarded.split(",")[0].trim()
  return req.headers.get("x-real-ip") ?? null
}

/**
 * Write one audit log entry.
 *
 * Never throws — audit failures must not break the primary user action.
 * Errors are logged to stderr so they surface in production logs.
 */
export async function writeAuditLog(params: WriteAuditLogParams): Promise<void> {
  try {
    // Fetch the most recent hash for this tenant to chain onto.
    const prev = await prisma.auditLog.findFirst({
      where: { tenantId: params.tenantId },
      orderBy: { createdAt: "desc" },
      select: { hash: true },
    })

    const payload = JSON.stringify({
      tenantId: params.tenantId,
      actorId: params.actorId ?? null,
      actorEmail: params.actorEmail ?? null,
      actorIp: params.actorIp ?? null,
      event: params.event,
      resourceType: params.resourceType ?? null,
      resourceId: params.resourceId ?? null,
      metadata: params.metadata ?? null,
    })

    const hash = createHash("sha256")
      .update(payload + (prev?.hash ?? ""))
      .digest("hex")

    await prisma.auditLog.create({
      data: {
        tenantId: params.tenantId,
        actorId: params.actorId ?? null,
        actorEmail: params.actorEmail ?? null,
        actorIp: params.actorIp ?? null,
        event: params.event as any,
        resourceType: params.resourceType ?? null,
        resourceId: params.resourceId ?? null,
        metadata: (params.metadata ?? undefined) as any,
        hash,
      },
    })
  } catch (err) {
    console.error("[audit] writeAuditLog failed", err)
  }
}
