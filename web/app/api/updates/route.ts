/**
 * HYB-15: Update manifest API.
 *
 * GET /api/updates
 *
 * Reads the latest update manifest from the Python backend (which caches it
 * from PlatformCloud). Returns null in SaaS mode — updates are operator-managed.
 *
 * Response:
 *   200 { available: true, latestVersion, severity, helmChartUrl, releaseNotesUrl, changelogSummary }
 *   200 { available: false }
 *   200 null  (SaaS mode)
 */
import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"

const DEPLOYMENT_MODE = process.env.NEXT_PUBLIC_DEPLOYMENT_MODE ?? "saas"
const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000"

export async function GET() {
    // SaaS: updates managed by operator — widget hidden
    if (DEPLOYMENT_MODE === "saas") {
        return NextResponse.json(null)
    }

    const session = await getServerSession(authOptions)
    if (!session?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Air-gap: no outbound calls — still read from Python backend cache
    // (Python sets it from bundled manifest at startup)
    try {
        const tenantId = session.user.tenantId
        const res = await fetch(`${BACKEND_URL}/api/updates/manifest`, {
            headers: {
                "X-Tenant-ID": tenantId,
                "Content-Type": "application/json",
            },
            next: { revalidate: 3600 }, // cache for 1 hour
        })

        if (!res.ok) {
            return NextResponse.json({ available: false })
        }

        const data = await res.json()
        if (!data) {
            return NextResponse.json({ available: false })
        }

        return NextResponse.json({
            available: true,
            latestVersion: data.latest_version,
            severity: data.severity,
            helmChartUrl: data.helm_chart_url ?? null,
            releaseNotesUrl: data.release_notes_url ?? null,
            changelogSummary: data.changelog_summary ?? null,
        })
    } catch {
        return NextResponse.json({ available: false })
    }
}
