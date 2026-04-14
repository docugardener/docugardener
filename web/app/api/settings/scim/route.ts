/**
 * ENT-12 SCIM 2.0 — token management API.
 *
 * GET  /api/settings/scim   — returns { scimEnabled, hasToken, scimLastSyncAt }
 * POST /api/settings/scim   — body: { action: "generate" | "revoke" }
 *                             or     { scimEnabled: boolean }
 *
 * Token generation:
 *   - Creates 32-byte cryptographically random token (base64url encoded)
 *   - Stores SHA-256 hash in Tenant.scimBearerTokenHash
 *   - Returns the RAW token ONCE — it is never stored and cannot be retrieved again
 *
 * Access: ADMIN role + TEAM plan only.
 */
import { getServerSession } from "next-auth"
import { NextRequest, NextResponse } from "next/server"
import { createHash, randomBytes } from "crypto"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"
import { writeAuditLog, AuditEvent } from "@/lib/audit"
import { canAccessTenant } from "@/lib/features"

function requireAdminTeam(session: any, tenant: any) {
    if ((session?.user as any)?.role !== "ADMIN") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    if (!canAccessTenant(tenant, "scim")) {
        return NextResponse.json({ error: "SCIM 2.0 requires TEAM plan" }, { status: 403 })
    }
    return null
}

export async function GET(req: NextRequest) {
    const session = await getServerSession(authOptions)
    const tenantId = (session?.user as any)?.tenantId
    if (!tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { plan: true, workflowConfig: true, scimEnabled: true, scimBearerTokenHash: true, scimLastSyncAt: true },
    })
    const guard = requireAdminTeam(session, tenant)
    if (guard) return guard

    return NextResponse.json({
        scimEnabled: tenant!.scimEnabled,
        hasToken: !!tenant!.scimBearerTokenHash,
        scimLastSyncAt: tenant!.scimLastSyncAt?.toISOString() ?? null,
        scimBaseUrl: `${process.env.NEXTAUTH_URL ?? ""}/scim/v2`,
    })
}

export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions)
    const tenantId = (session?.user as any)?.tenantId
    const actorId = (session?.user as any)?.id
    const actorEmail = session?.user?.email ?? undefined
    if (!tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } })
    const guard = requireAdminTeam(session, tenant)
    if (guard) return guard

    const body = await req.json().catch(() => ({}))

    // Toggle scimEnabled
    if (typeof body.scimEnabled === "boolean") {
        await prisma.tenant.update({
            where: { id: tenantId },
            data: { scimEnabled: body.scimEnabled },
        })
        return NextResponse.json({ ok: true, scimEnabled: body.scimEnabled })
    }

    // Generate new token
    if (body.action === "generate") {
        const rawToken = randomBytes(32).toString("base64url")
        const tokenHash = createHash("sha256").update(rawToken).digest("hex")
        await prisma.tenant.update({
            where: { id: tenantId },
            data: { scimBearerTokenHash: tokenHash, scimEnabled: true },
        })
        await writeAuditLog({
            tenantId,
            actorId,
            actorEmail,
            event: AuditEvent.SCIM_TOKEN_ROTATED,
            resourceType: "tenant",
            resourceId: tenantId,
            metadata: { action: "generated" },
        })
        // Return raw token ONCE — never stored, cannot be retrieved again
        return NextResponse.json({ ok: true, token: rawToken })
    }

    // Revoke token
    if (body.action === "revoke") {
        await prisma.tenant.update({
            where: { id: tenantId },
            data: { scimBearerTokenHash: null, scimEnabled: false },
        })
        await writeAuditLog({
            tenantId,
            actorId,
            actorEmail,
            event: AuditEvent.SCIM_TOKEN_ROTATED,
            resourceType: "tenant",
            resourceId: tenantId,
            metadata: { action: "revoked" },
        })
        return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 })
}
