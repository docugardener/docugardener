/**
 * GET /api/audit
 *
 * Returns paginated audit log entries for the caller's tenant.
 * Access: ADMIN or AUDITOR role only (ENT-10 roles).
 *
 * Query params:
 *   limit  — number of rows (default 50, max 200)
 *   cursor — createdAt ISO string for cursor-based pagination
 *   event  — filter by AuditEvent type
 */
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"
import { canAccessTenant } from "@/lib/features"

const ALLOWED_ROLES = ["ADMIN", "AUDITOR"]
const MAX_LIMIT = 200
const DEFAULT_LIMIT = 50

export async function GET(req: Request) {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
        return new NextResponse("Unauthorized", { status: 401 })
    }

    // @ts-ignore
    const role: string = session.user.role ?? ""
    if (!ALLOWED_ROLES.includes(role)) {
        return new NextResponse("Forbidden", { status: 403 })
    }

    // @ts-ignore
    const tenantId: string = session.user.tenantId
    if (!tenantId) {
        return new NextResponse("Tenant not found", { status: 403 })
    }

    // GTM-03 AC-1: audit log is a PRO+ feature
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { plan: true, workflowConfig: true } })
    if (!canAccessTenant(tenant!, "audit_log")) {
        return NextResponse.json({ error: "upgrade_required", feature: "audit_log" }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const rawLimit = parseInt(searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10)
    const limit = Math.min(isNaN(rawLimit) ? DEFAULT_LIMIT : rawLimit, MAX_LIMIT)
    const cursor = searchParams.get("cursor")
    const eventFilter = searchParams.get("event")

    const where: Record<string, unknown> = { tenantId }
    if (eventFilter) where.event = eventFilter
    if (cursor) where.createdAt = { lt: new Date(cursor) }

    const logs = await prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
            id: true,
            actorEmail: true,
            actorIp: true,
            event: true,
            resourceType: true,
            resourceId: true,
            metadata: true,
            hash: true,
            createdAt: true,
        },
    })

    const nextCursor = logs.length === limit
        ? logs[logs.length - 1].createdAt.toISOString()
        : null

    return NextResponse.json({ logs, nextCursor })
}
