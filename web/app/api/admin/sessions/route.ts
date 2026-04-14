/**
 * POST /api/admin/sessions
 *
 * Revokes all active sessions for the caller's tenant.
 * Sets Tenant.sessionsRevokedAt = now().
 * All JWTs issued before this timestamp will be treated as invalid
 * on their next use.
 *
 * Auth: ADMIN only.
 */
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"
import { writeAuditLog, AuditEvent } from "@/lib/audit"

export async function POST(req: Request) {
    const session = await getServerSession(authOptions)
    if (!session) return new NextResponse("Unauthorized", { status: 401 })

    const user = session.user as any
    if (user.role !== "ADMIN") return new NextResponse("Forbidden", { status: 403 })

    const tenantId: string = user.tenantId
    if (!tenantId) return new NextResponse("No tenant", { status: 400 })

    const now = new Date()
    await prisma.tenant.update({
        where: { id: tenantId },
        data: { sessionsRevokedAt: now },
    })

    await writeAuditLog({
        tenantId,
        actorId: user.id,
        actorEmail: user.email,
        event: AuditEvent.SESSIONS_REVOKED,
        resourceType: "tenant",
        resourceId: tenantId,
        metadata: { revokedAt: now.toISOString() },
    })

    return NextResponse.json({ revokedAt: now.toISOString() })
}
