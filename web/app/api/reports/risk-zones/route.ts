// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * MAP-01: Documentation Coverage & Risk Map
 * GET /api/reports/risk-zones?timeRange=30d&repo=&docType=
 *
 * PRO+ plan required. Returns per-repo risk zones sorted by riskScore desc.
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "../../auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"
import { canAccessTenant } from "@/lib/features"

export const dynamic = "force-dynamic"

const TIME_RANGE_DAYS: Record<string, number> = {
    "7d": 7,
    "30d": 30,
    "90d": 90,
}

export interface RiskZone {
    repoId: string
    repoName: string
    riskScore: number
    severity: "critical" | "high" | "moderate" | "low"
    unresolvedCount: number
    recentEvents: { severity: string; createdAt: string; prNumber: number }[]
    topPaths: string[]
    policyViolationCount: number
}

export async function GET(request: NextRequest) {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const user = session.user as any
    const tenantId = user.tenantId
    if (!tenantId) return NextResponse.json({ error: "No tenant" }, { status: 403 })

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { plan: true, workflowConfig: true } })
    if (!tenant || !canAccessTenant(tenant, "risk_map")) {
        return NextResponse.json({ error: "PRO plan required" }, { status: 403 })
    }

    const { searchParams } = request.nextUrl
    const timeRangeParam = searchParams.get("timeRange") ?? "30d"
    const repoFilter = searchParams.get("repo") ?? ""
    const docTypeFilter = searchParams.get("docType") ?? ""

    const days = TIME_RANGE_DAYS[timeRangeParam] ?? 30
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

    const repos = await prisma.repository.findMany({
        where: {
            tenantId,
            ...(repoFilter ? { name: { contains: repoFilter, mode: "insensitive" } } : {}),
        },
        select: {
            id: true,
            name: true,
            jobs: {
                where: { status: "COMPLETED", createdAt: { gte: since } },
                orderBy: { createdAt: "desc" },
                select: {
                    id: true,
                    prNumber: true,
                    triageStatus: true,
                    result: true,
                    createdAt: true,
                },
            },
        },
    })

    const zones: RiskZone[] = []

    for (const repo of repos) {
        const jobs = repo.jobs
        if (jobs.length === 0) continue

        const withDrift = jobs.filter((j) => {
            const score = (j.result as any)?.drift_score
            return typeof score === "number" && score > 0
        })
        if (withDrift.length === 0) continue

        const avgDrift =
            withDrift.reduce((sum, j) => sum + ((j.result as any).drift_score as number), 0) / withDrift.length
        const unresolvedCount = jobs.filter((j) => j.triageStatus === "PENDING").length
        const criticalCount = jobs.filter((j) => {
            const sev = (j.result as any)?.drift_analysis?.severity?.toLowerCase()
            return sev === "critical"
        }).length
        const policyViolationCount = jobs.reduce((sum, j) => {
            const violations: any[] = (j.result as any)?.policy_violations ?? []
            return sum + violations.length
        }, 0)

        const riskScore = Math.min(
            100,
            Math.round(
                avgDrift * 0.5 +
                    Math.min(20, unresolvedCount * 3) +
                    Math.min(20, criticalCount * 10) +
                    Math.min(10, policyViolationCount * 2)
            )
        )

        const severity: RiskZone["severity"] =
            riskScore >= 75 ? "critical" : riskScore >= 50 ? "high" : riskScore >= 25 ? "moderate" : "low"

        // Collect distinct file paths from drift analysis items
        const pathSet = new Set<string>()
        for (const job of withDrift.slice(0, 10)) {
            const items: any[] = (job.result as any)?.drift_analysis?.items ?? []
            for (const item of items) {
                const p = item.file_path ?? item.path
                if (p) pathSet.add(p)
            }
        }
        const topPaths = Array.from(pathSet).slice(0, 5)

        // docType filter: check if any top path starts with the prefix
        if (docTypeFilter && topPaths.length > 0) {
            const matches = topPaths.some((p) => p.toLowerCase().startsWith(docTypeFilter.toLowerCase()))
            if (!matches) continue
        }

        const recentEvents = withDrift.slice(0, 5).map((j) => ({
            severity: (j.result as any)?.drift_analysis?.severity ?? "none",
            createdAt: j.createdAt.toISOString(),
            prNumber: j.prNumber ?? 0,
        }))

        zones.push({ repoId: repo.id, repoName: repo.name, riskScore, severity, unresolvedCount, recentEvents, topPaths, policyViolationCount })
    }

    zones.sort((a, b) => b.riskScore - a.riskScore)

    return NextResponse.json({ zones })
}
