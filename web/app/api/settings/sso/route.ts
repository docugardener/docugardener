export const dynamic = "force-dynamic"
// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * GET  /api/settings/sso  — Returns tenant SSO configuration (certificate redacted)
 * POST /api/settings/sso  — Saves tenant SSO configuration
 *
 * Auth: ADMIN only.
 * Plan gate: TEAM plan or above.
 */
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"
import { writeAuditLog, AuditEvent } from "@/lib/audit"
import { encrypt } from "@/lib/encryption"
import { canAccessTenant } from "@/lib/features"

async function getAuthorizedTenant(req: Request) {
    const session = await getServerSession(authOptions)
    if (!session) return { error: "Unauthorized", status: 401 }

    const user = session.user as any
    if (user.role !== "ADMIN") return { error: "Forbidden", status: 403 }

    const tenantId: string = user.tenantId
    if (!tenantId) return { error: "No tenant", status: 400 }

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } })
    if (!tenant) return { error: "Tenant not found", status: 404 }

    if (!canAccessTenant(tenant, "sso_saml")) {
        return { error: "SSO requires TEAM plan or above", status: 402 }
    }

    return { tenant, user }
}

export async function GET(req: Request) {
    const result = await getAuthorizedTenant(req)
    if ("error" in result) {
        return new NextResponse(result.error, { status: result.status })
    }
    const { tenant } = result

    return NextResponse.json({
        ssoEnabled: tenant.ssoEnabled,
        ssoProvider: tenant.ssoProvider,
        samlIdpEntityId: tenant.samlIdpEntityId,
        samlIdpSsoUrl: tenant.samlIdpSsoUrl,
        // Never return the raw certificate — client only needs to know if one is set
        hasCertificate: !!tenant.samlIdpCertificate,
        samlAttrEmail: tenant.samlAttrEmail ?? "email",
        samlAttrRole: tenant.samlAttrRole ?? "",
        samlRoleMapAdmin: tenant.samlRoleMapAdmin ?? "",
        samlDefaultRole: tenant.samlDefaultRole ?? "VIEWER",
        sessionIdleTimeoutMinutes: tenant.sessionIdleTimeoutMinutes ?? null,
    })
}

export async function POST(req: Request) {
    const result = await getAuthorizedTenant(req)
    if ("error" in result) {
        return new NextResponse(result.error, { status: result.status })
    }
    const { tenant, user } = result

    let body: any
    try {
        body = await req.json()
    } catch {
        return new NextResponse("Invalid JSON", { status: 400 })
    }

    const {
        ssoEnabled,
        ssoProvider,
        samlIdpEntityId,
        samlIdpSsoUrl,
        samlIdpCertificate,
        samlAttrEmail,
        samlAttrRole,
        samlRoleMapAdmin,
        samlDefaultRole,
        sessionIdleTimeoutMinutes,
    } = body

    // BUG-SSO-05: validate samlDefaultRole — only non-ADMIN roles allowed as default
    const ALLOWED_DEFAULT_ROLES = ["VIEWER", "AUDITOR", "BILLING_ADMIN"]
    const resolvedDefaultRole = samlDefaultRole && ALLOWED_DEFAULT_ROLES.includes(samlDefaultRole)
        ? samlDefaultRole
        : null  // null → backend falls back to "VIEWER"

    // Build update object — only include certificate if provided (non-empty string)
    const data: Record<string, any> = {
        ssoEnabled: Boolean(ssoEnabled),
        ssoProvider: ssoProvider ?? null,
        samlIdpEntityId: samlIdpEntityId ?? null,
        samlIdpSsoUrl: samlIdpSsoUrl ?? null,
        samlAttrEmail: samlAttrEmail ?? null,
        samlAttrRole: samlAttrRole ?? null,
        samlRoleMapAdmin: samlRoleMapAdmin ?? null,
        samlDefaultRole: resolvedDefaultRole,
        sessionIdleTimeoutMinutes: typeof sessionIdleTimeoutMinutes === "number"
            ? Math.max(1, Math.min(sessionIdleTimeoutMinutes, 10080)) // clamp: 1 min – 7 days
            : null,
    }
    if (typeof samlIdpCertificate === "string" && samlIdpCertificate.trim()) {
        data.samlIdpCertificate = encrypt(samlIdpCertificate.trim())
    }

    await prisma.tenant.update({ where: { id: tenant.id }, data })

    await writeAuditLog({
        tenantId: tenant.id,
        actorId: user.id,
        actorEmail: user.email,
        event: AuditEvent.SSO_CONFIG_CHANGED,
        resourceType: "tenant",
        resourceId: tenant.id,
        metadata: { ssoEnabled: data.ssoEnabled, ssoProvider: data.ssoProvider },
    })

    return NextResponse.json({ ok: true })
}
