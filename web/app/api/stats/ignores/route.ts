// SPDX-License-Identifier: AGPL-3.0-or-later
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"
import { canAccessTenant } from "@/lib/features"

export const dynamic = "force-dynamic"

export async function GET() {
    const session = await getServerSession(authOptions)
    if (!session || !(session.user as any).tenantId) {
        return new NextResponse("Unauthorized", { status: 401 })
    }
    const tenantId = (session.user as any).tenantId

    // GTM-02: ignore-rate analytics is a PRO+ feature
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { plan: true, workflowConfig: true } })
    if (!canAccessTenant(tenant!, "analytics")) {
        return NextResponse.json(
            { error: "upgrade_required", feature: "analytics" },
            { status: 403 },
        )
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

    const decidedJobs = await prisma.job.findMany({
        where: {
            tenantId,
            triageStatus: { in: ["IGNORED", "ACCEPTED"] },
            updatedAt: { gte: thirtyDaysAgo },
        },
        select: { triageStatus: true, result: true, updatedAt: true },
    })

    const ignoredJobs = decidedJobs.filter(j => j.triageStatus === "IGNORED")
    const totalIgnored = ignoredJobs.length
    const totalAccepted = decidedJobs.filter(j => j.triageStatus === "ACCEPTED").length
    const ignoreRate = (totalIgnored + totalAccepted) > 0
        ? Math.round((totalIgnored / (totalIgnored + totalAccepted)) * 100)
        : 0

    const withReason = ignoredJobs.filter(j => !!(j.result as any)?.dismiss_reason).length
    const reasonCaptureRate = totalIgnored > 0
        ? Math.round((withReason / totalIgnored) * 100)
        : 0

    // Trend: bucket by day
    const trendMap: Record<string, { ignored: number; accepted: number }> = {}
    for (const job of decidedJobs) {
        const day = job.updatedAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })
        if (!trendMap[day]) trendMap[day] = { ignored: 0, accepted: 0 }
        if (job.triageStatus === "IGNORED") trendMap[day].ignored++
        else trendMap[day].accepted++
    }
    const year = new Date().getFullYear()
    const trend = Object.entries(trendMap)
        .sort(([a], [b]) => new Date(`${a} ${year}`).getTime() - new Date(`${b} ${year}`).getTime())
        .map(([date, v]) => ({ date, ...v }))

    // Severity breakdown of dismissed jobs
    const severityMap: Record<string, number> = {}
    for (const job of ignoredJobs) {
        const raw = (job.result as any)?.drift_analysis?.severity ?? "none"
        const key = raw.toLowerCase()
        severityMap[key] = (severityMap[key] ?? 0) + 1
    }
    const severityBreakdown = Object.entries(severityMap)
        .sort(([, a], [, b]) => b - a)
        .map(([severity, count]) => ({ severity, count }))

    // Top dismiss reasons
    const reasonMap: Record<string, number> = {}
    for (const job of ignoredJobs) {
        const reason = (job.result as any)?.dismiss_reason
        if (reason) reasonMap[reason] = (reasonMap[reason] ?? 0) + 1
    }
    const topReasons = Object.entries(reasonMap)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 8)
        .map(([reason, count]) => ({ reason, count }))

    return NextResponse.json({
        kpis: { totalIgnored, ignoreRate, reasonCaptureRate },
        trend,
        severityBreakdown,
        topReasons,
    })
}
