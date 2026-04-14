// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * GET /api/billing/license
 *
 * Returns basic license/deployment info for client-installed / air-gap deployments.
 * In SaaS mode this route returns 404. Auth: session required.
 */
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"

export const dynamic = "force-dynamic"

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000"

export async function GET() {
    const deploymentMode = process.env.DEPLOYMENT_MODE ?? "saas"

    if (deploymentMode === "saas") {
        return new NextResponse("Not found", { status: 404 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user) {
        return new NextResponse("Unauthorized", { status: 401 })
    }

    const plan = (session.user as any).plan ?? "FREE"
    const tenantId = (session.user as any).tenantId as string

    let keyFingerprint: string | null = null
    try {
        const res = await fetch(`${BACKEND_URL}/billing/profile`, {
            headers: { "X-Tenant-ID": tenantId },
            cache: "no-store",
        })
        if (res.ok) {
            const data = await res.json()
            keyFingerprint = data.license_key_fingerprint ?? null
        }
    } catch {
        // Python backend unreachable — fingerprint stays null
    }

    return NextResponse.json({
        plan,
        keyFingerprint,
        expiresAt: null,
        portalUrl: process.env.LICENSE_PORTAL_URL ?? process.env.NEXT_PUBLIC_LICENSE_PORTAL_URL ?? null,
        deploymentMode,
    })
}
