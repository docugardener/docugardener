// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * GET /api/billing/profile
 *
 * Returns deployment identity fields for the Settings profile card.
 * Combines Python backend data with tenant DB fields from the session.
 */
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000"

export async function GET() {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const tenantId = (session.user as any).tenantId as string
    const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true, name: true, plan: true, workflowConfig: true },
    })

    let backendData: Record<string, any> = {}
    try {
        const res = await fetch(`${BACKEND_URL}/billing/profile`, {
            headers: { "X-Tenant-ID": tenantId },
            cache: "no-store",
        })
        if (res.ok) backendData = await res.json()
    } catch {
        // Python backend unreachable — return DB fields only
    }

    const grantedFeatures = (tenant?.workflowConfig as any)?.grantedFeatures as string[] | undefined

    return NextResponse.json({
        tenant_id: tenant?.id ?? tenantId,
        tenant_name: tenant?.name ?? null,
        plan: tenant?.plan ?? "FREE",
        deployment_mode: backendData.deployment_mode ?? process.env.DEPLOYMENT_MODE ?? "saas",
        github_org: backendData.github_org ?? null,
        cloud_service_url: null,
        license_key_fingerprint: backendData.license_key_fingerprint ?? null,
        license_status: null,
        cancel_at: null,
        granted_features: grantedFeatures ?? [],
    })
}
