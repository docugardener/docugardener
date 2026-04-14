import { NextResponse } from "next/server"
import { getOwnerSession } from "@/lib/owner-auth"
import { prisma } from "@/lib/prisma"

const PLAN_QUOTA: Record<string, number> = {
  FREE: 50,
  PRO: 500,
  TEAM: -1, // unlimited
}

export async function GET() {
  const owner = await getOwnerSession()
  if (!owner) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  const tenants = await prisma.tenant.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      plan: true,
      createdAt: true,
      workflowConfig: true,
      _count: { select: { jobs: true } },
      jobs: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { createdAt: true },
      },
    },
  })

  // Job counts for last 30 days in one query
  const recentCounts = await prisma.job.groupBy({
    by: ["tenantId"],
    where: { createdAt: { gte: thirtyDaysAgo } },
    _count: { id: true },
  })
  const recentMap = Object.fromEntries(recentCounts.map((r) => [r.tenantId, r._count.id]))

  // Quota usage: derived from job count in the current calendar month
  // (Python-side QuotaUsage table is not accessible from Next.js Prisma)
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  const monthlyJobs = await prisma.job.groupBy({
    by: ["tenantId"],
    where: { createdAt: { gte: monthStart }, status: { not: "QUOTA_EXCEEDED" } },
    _count: { id: true },
  })
  const usageMap = Object.fromEntries(monthlyJobs.map((u: any) => [u.tenantId, u._count.id]))

  const rows = tenants.map((t) => {
    const wc = (t.workflowConfig as any) || {}
    const quotaCeiling: number | null = wc.quotaCeiling ?? null
    const planLimit = PLAN_QUOTA[t.plan] ?? 50
    const quotaLimit = quotaCeiling !== null ? quotaCeiling : planLimit
    const quotaUsed = usageMap[t.id] ?? 0

    return {
      id: t.id,
      name: t.name,
      plan: t.plan,
      createdAt: t.createdAt,
      lastJobAt: t.jobs[0]?.createdAt ?? null,
      jobCount30d: recentMap[t.id] ?? 0,
      jobCountTotal: t._count.jobs,
      quotaUsed,
      quotaLimit,
      quotaUnlimited: quotaLimit === -1,
      grantedFeatures: wc.grantedFeatures ?? null,
    }
  })

  // Plan distribution summary
  const dist = { FREE: 0, PRO: 0, TEAM: 0 }
  for (const r of rows) {
    dist[r.plan as keyof typeof dist] = (dist[r.plan as keyof typeof dist] ?? 0) + 1
  }

  return NextResponse.json({ tenants: rows, distribution: dist })
}
