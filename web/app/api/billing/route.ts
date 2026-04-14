import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"
import { getPlanLimits } from "@/lib/billing"

export const dynamic = "force-dynamic"

function round6(n: number) { return Math.round(n * 1_000_000) / 1_000_000 }
function round2(n: number) { return Math.round(n * 100) / 100 }

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const tenantId = (session.user as any).tenantId
  if (!tenantId) return NextResponse.json({ error: "No tenant" }, { status: 403 })

  const role = (session.user as any).role
  if (!["ADMIN", "BILLING_ADMIN"].includes(role)) {
    return NextResponse.json(
      { error: "forbidden", reason: "Requires ADMIN or BILLING_ADMIN role." },
      { status: 403 }
    )
  }

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  const jobs = await prisma.job.findMany({
    where: { tenantId, status: "COMPLETED", createdAt: { gte: monthStart } },
    select: { result: true, createdAt: true, repository: { select: { name: true } } },
  })

  let totalTokens = 0, totalCost = 0
  const totalScans = jobs.length
  const providerMap: Record<string, { scans: number; tokens: number; cost: number }> = {}
  const dailyMap: Record<string, { scans: number; tokens: number; cost: number }> = {}

  for (const job of jobs) {
    const r = job.result as any
    const usage = r?.llm_usage
    const tokens = usage?.total_tokens ?? 0
    const cost = usage?.estimated_cost_usd ?? 0
    const provider = usage?.provider ?? "unknown"
    const model = usage?.model ?? "unknown"
    const providerKey = `${provider}/${model}`
    const day = job.createdAt.toISOString().slice(0, 10)

    totalTokens += tokens
    totalCost += cost

    if (!providerMap[providerKey]) providerMap[providerKey] = { scans: 0, tokens: 0, cost: 0 }
    providerMap[providerKey].scans++
    providerMap[providerKey].tokens += tokens
    providerMap[providerKey].cost += cost

    if (!dailyMap[day]) dailyMap[day] = { scans: 0, tokens: 0, cost: 0 }
    dailyMap[day].scans++
    dailyMap[day].tokens += tokens
    dailyMap[day].cost += cost
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { billingConfig: true, plan: true } })
  const billingConfig = (tenant?.billingConfig as any) ?? {}
  const monthlyBudgetUsd: number | null = billingConfig.monthlyBudgetUsd ?? null
  const budgetUsagePercent = monthlyBudgetUsd ? Math.min(100, (totalCost / monthlyBudgetUsd) * 100) : null

  // PR quota: count all non-failed jobs this month (matches Python check_pr_quota logic)
  const prUsed = await prisma.job.count({
    where: {
      tenantId,
      status: { in: ["QUEUED", "PROCESSING", "COMPLETED"] },
      createdAt: { gte: monthStart },
    },
  })
  const planLimits = getPlanLimits(tenant?.plan ?? "FREE")
  const prLimit: number | null = planLimits.prsPerMonth === -1 ? null : planLimits.prsPerMonth

  return NextResponse.json({
    currentMonthCost: round6(totalCost),
    currentMonthTokens: totalTokens,
    currentMonthScans: totalScans,
    monthlyBudgetUsd,
    budgetUsagePercent: budgetUsagePercent !== null ? round2(budgetUsagePercent) : null,
    prQuota: { used: prUsed, limit: prLimit },
    providerBreakdown: Object.entries(providerMap).map(([key, v]) => {
      const [provider, model] = key.split("/")
      return { provider, model, scans: v.scans, tokens: v.tokens, cost: round6(v.cost) }
    }),
    dailyBreakdown: Object.entries(dailyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, scans: v.scans, tokens: v.tokens, cost: round6(v.cost) })),
  })
}
