export const dynamic = "force-dynamic"
// SPDX-License-Identifier: AGPL-3.0-or-later
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { NextResponse } from "next/server"
import { writeAuditLog, AuditEvent, getClientIp } from "@/lib/audit"
import { prisma } from "@/lib/prisma"
import { canAccessTenant } from "@/lib/features"

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000"

export async function POST(req: Request) {
    const session = await getServerSession(authOptions)
    if (!session?.user?.tenantId) {
        return new NextResponse("Unauthorized", { status: 401 })
    }

    // SEC-02 AC-1: ADMIN role required
    if (session.user.role !== "ADMIN") {
        return new NextResponse(
            JSON.stringify({ error: "forbidden", reason: "Prompt reset requires ADMIN role." }),
            { status: 403 }
        )
    }

    // Feature gate: prompt_customization (same gate as /api/prompts POST)
    const tenantRecord = await prisma.tenant.findUnique({
        where: { id: session.user.tenantId },
        select: { plan: true, trialExpiresAt: true, workflowConfig: true },
    })
    const trialActive = !!(tenantRecord?.trialExpiresAt && tenantRecord.trialExpiresAt > new Date())
    if (!canAccessTenant(tenantRecord ?? { plan: "FREE" }, "prompt_customization", trialActive)) {
        return new NextResponse(
            JSON.stringify({ error: "upgrade_required", feature: "prompt_customization" }),
            { status: 403 }
        )
    }

    const { searchParams } = new URL(req.url)
    const key = searchParams.get("key")

    if (!key) {
        return new NextResponse("Missing prompt key", { status: 400 })
    }

    try {
        const res = await fetch(`${BACKEND_URL}/prompts/reset?key=${key}`, {
            method: "POST",
            headers: { "X-Tenant-ID": session.user.tenantId },
        })

        const data = await res.json()

        // SEC-02 AC-6: audit log on successful reset
        if (res.ok) {
            await writeAuditLog({
                tenantId: session.user.tenantId,
                actorId: session.user.id ?? null,
                actorEmail: session.user.email ?? null,
                actorIp: getClientIp(req),
                event: AuditEvent.SETTINGS_CHANGED,
                resourceType: "prompt_config",
                resourceId: key,
                metadata: { key, is_reset: true },
            })
        }

        return NextResponse.json(data, { status: res.status })
    } catch (error: any) {
        return new NextResponse(JSON.stringify({ error: error.message }), { status: 500 })
    }
}
