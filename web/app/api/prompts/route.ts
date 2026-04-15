export const dynamic = "force-dynamic"
// SPDX-License-Identifier: AGPL-3.0-or-later
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { NextResponse } from "next/server"
import { writeAuditLog, AuditEvent, getClientIp } from "@/lib/audit"
import { prisma } from "@/lib/prisma"
import { canAccessTenant } from "@/lib/features"

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000"

export async function GET(req: Request) {
    const session = await getServerSession(authOptions)
    if (!session?.user?.tenantId) {
        return new NextResponse("Unauthorized", { status: 401 })
    }

    try {
        const res = await fetch(`${BACKEND_URL}/prompts/`, {
            headers: { "X-Tenant-ID": session.user.tenantId },
        })
        const data = await res.json()
        return NextResponse.json(data, { status: res.status })
    } catch (error: any) {
        return new NextResponse(JSON.stringify({ error: error.message }), { status: 500 })
    }
}

export async function POST(req: Request) {
    const session = await getServerSession(authOptions)
    if (!session?.user?.tenantId) {
        return new NextResponse("Unauthorized", { status: 401 })
    }

    // SEC-02 AC-1: ADMIN role required
    if (session.user.role !== "ADMIN") {
        return new NextResponse(
            JSON.stringify({ error: "forbidden", reason: "Prompt updates require ADMIN role." }),
            { status: 403 }
        )
    }

    // GTM-02 AC-3: Prompt playground is PRO+ (or active trial)
    const tenantRecord = await prisma.tenant.findUnique({
        where: { id: session.user.tenantId },
        select: { plan: true, trialExpiresAt: true, workflowConfig: true },
    })
    const trialActive = !!(tenantRecord?.trialExpiresAt && tenantRecord.trialExpiresAt > new Date())
    if (!canAccessTenant(tenantRecord!, "prompt_customization", trialActive)) {
        return new NextResponse(
            JSON.stringify({ error: "upgrade_required", reason: "Prompt customization requires a Pro plan or an active trial." }),
            { status: 403 }
        )
    }

    const body = await req.json()

    try {
        const res = await fetch(`${BACKEND_URL}/prompts/`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Tenant-ID": session.user.tenantId,
            },
            body: JSON.stringify(body),
        })

        const data = await res.json()

        // SEC-02 AC-6: audit log on successful save
        if (res.ok) {
            await writeAuditLog({
                tenantId: session.user.tenantId,
                actorId: session.user.id ?? null,
                actorEmail: session.user.email ?? null,
                actorIp: getClientIp(req),
                event: AuditEvent.SETTINGS_CHANGED,
                resourceType: "prompt_config",
                resourceId: body.key,
                metadata: {
                    key: body.key,
                    content_length: (body.content as string)?.length ?? 0,
                    is_reset: false,
                },
            })
        }

        return NextResponse.json(data, { status: res.status })
    } catch (error: any) {
        return new NextResponse(JSON.stringify({ error: error.message }), { status: 500 })
    }
}
