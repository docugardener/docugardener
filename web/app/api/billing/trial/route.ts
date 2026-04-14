/**
 * GTM-01: PRO Trial API
 *
 * GET  /api/billing/trial  — Returns trial status for the current tenant.
 * POST /api/billing/trial  — Activates a 14-day PRO trial (once per tenant, FREE plan only, ADMIN).
 */
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"
import { writeAuditLog, AuditEvent, getClientIp } from "@/lib/audit"

export const dynamic = "force-dynamic"

const TRIAL_DAYS = 14

function trialPayload(tenant: { plan: string; trialExpiresAt: Date | null }) {
    const now = new Date()
    const expiresAt = tenant.trialExpiresAt

    const alreadyUsed = expiresAt !== null
    const isActive = alreadyUsed && expiresAt! > now
    const isExpired = alreadyUsed && !isActive

    const daysRemaining = isActive
        ? Math.max(0, Math.ceil((expiresAt!.getTime() - now.getTime()) / 86_400_000))
        : 0

    return {
        trialExpiresAt: expiresAt?.toISOString() ?? null,
        isActive,
        isExpired,
        alreadyUsed,
        daysRemaining,
        plan: tenant.plan,
    }
}

export async function GET(req: Request) {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const tenantId = (session.user as any).tenantId
    if (!tenantId) return NextResponse.json({ error: "No tenant" }, { status: 403 })

    const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { plan: true, trialExpiresAt: true },
    })

    if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 })

    return NextResponse.json(trialPayload(tenant))
}

export async function POST(req: Request) {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const tenantId = (session.user as any).tenantId
    if (!tenantId) return NextResponse.json({ error: "No tenant" }, { status: 403 })

    if ((session.user as any).role !== "ADMIN") {
        return NextResponse.json(
            { error: "forbidden", reason: "Trial activation requires ADMIN role." },
            { status: 403 },
        )
    }

    const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { plan: true, trialExpiresAt: true },
    })

    if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 })

    // Only FREE plan tenants can start a trial
    if (tenant.plan !== "FREE") {
        return NextResponse.json(
            { error: "trial_unavailable", reason: "Trials are only available on the Free plan." },
            { status: 400 },
        )
    }

    // One-time only: trialExpiresAt being set (even if expired) means it was already used
    if (tenant.trialExpiresAt !== null) {
        return NextResponse.json(
            { error: "trial_already_used", reason: "Your trial has already been activated. Each tenant can use one trial." },
            { status: 409 },
        )
    }

    const expiresAt = new Date(Date.now() + TRIAL_DAYS * 86_400_000)

    await prisma.tenant.update({
        where: { id: tenantId },
        data: { trialExpiresAt: expiresAt },
    })

    await writeAuditLog({
        tenantId,
        actorId: (session.user as any).id ?? null,
        actorEmail: session.user.email ?? null,
        actorIp: getClientIp(req),
        event: AuditEvent.TRIAL_STARTED,
        resourceType: "tenant",
        resourceId: tenantId,
        metadata: { trialDays: TRIAL_DAYS, expiresAt: expiresAt.toISOString() },
    })

    return NextResponse.json(
        trialPayload({ plan: tenant.plan, trialExpiresAt: expiresAt }),
        { status: 201 },
    )
}
