// SPDX-License-Identifier: AGPL-3.0-or-later
import { NextResponse } from "next/server"
import { getOwnerSession } from "@/lib/owner-auth"
import { getStripe } from "@/lib/stripe"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

export async function GET() {
  const owner = await getOwnerSession()
  if (!owner) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const sixtyDaysAgo  = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)

  // ── DB queries (run in parallel) ─────────────────────────────────────────
  const [
    tenants,
    newThisMonth,
    newLastMonth,
    jobsThisMonth,
    jobsLastMonth,
    activeTenantsThisMonth,
    activeTenantsLastMonth,
    totalRepos,
    totalUsers,
  ] = await Promise.all([
    prisma.tenant.groupBy({ by: ["plan"], _count: { id: true } }),
    prisma.tenant.count({ where: { createdAt: { gte: monthStart } } }),
    prisma.tenant.count({ where: { createdAt: { gte: prevMonthStart, lt: monthStart } } }),
    prisma.job.count({ where: { createdAt: { gte: monthStart } } }),
    prisma.job.count({ where: { createdAt: { gte: prevMonthStart, lt: monthStart } } }),
    prisma.job.groupBy({ by: ["tenantId"], where: { createdAt: { gte: thirtyDaysAgo } }, _count: { id: true } }),
    prisma.job.groupBy({ by: ["tenantId"], where: { createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } }, _count: { id: true } }),
    prisma.repository.count({ where: { enabled: true } }),
    prisma.user.count(),
  ])

  const planCounts: Record<string, number> = { FREE: 0, PRO: 0, TEAM: 0 }
  let totalTenants = 0
  for (const row of tenants) {
    planCounts[row.plan] = row._count.id
    totalTenants += row._count.id
  }

  const activeThisMonth = activeTenantsThisMonth.length
  const activeLastMonth = activeTenantsLastMonth.length

  // ── Stripe queries ────────────────────────────────────────────────────────
  let mrr = 0
  const mrrByPlan: Record<string, number> = { PRO: 0, TEAM: 0 }
  let activeSubsCount = 0
  let revenueThisMonth = 0
  let revenueLastMonth = 0
  let failedPaymentsCount = 0

  try {
    const stripe = getStripe()

    const [activeSubs, invoicesThisMonth, invoicesLastMonth, failedInvoices] = await Promise.all([
      stripe.subscriptions.list({ status: "active", limit: 100, expand: ["data.items.data.price"] }),
      stripe.invoices.list({
        status: "paid",
        created: { gte: Math.floor(monthStart.getTime() / 1000) },
        limit: 100,
      }),
      stripe.invoices.list({
        status: "paid",
        created: {
          gte: Math.floor(prevMonthStart.getTime() / 1000),
          lt: Math.floor(monthStart.getTime() / 1000),
        },
        limit: 100,
      }),
      stripe.invoices.list({ status: "open", limit: 100 }),
    ])

    activeSubsCount = activeSubs.data.length

    for (const sub of activeSubs.data) {
      for (const item of sub.items.data) {
        const price = item.price
        const amount = price.unit_amount ?? 0
        const monthly = price.recurring?.interval === "year" ? Math.round(amount / 12) : amount
        mrr += monthly

        // Map by price amount to plan (PRO=$29=2900, TEAM=$79=7900)
        if (amount <= 3000) mrrByPlan.PRO += monthly
        else mrrByPlan.TEAM += monthly
      }
    }

    revenueThisMonth = invoicesThisMonth.data.reduce((s, i) => s + (i.amount_paid ?? 0), 0)
    revenueLastMonth = invoicesLastMonth.data.reduce((s, i) => s + (i.amount_paid ?? 0), 0)
    failedPaymentsCount = failedInvoices.data.length
  } catch {
    // Stripe unavailable — surface zeros
  }

  const conversionRate = totalTenants > 0
    ? Math.round(((planCounts.PRO + planCounts.TEAM) / totalTenants) * 100)
    : 0

  return NextResponse.json({
    tenants: {
      total: totalTenants,
      newThisMonth,
      newLastMonth,
      byPlan: planCounts,
      conversionRate, // % on paid plan
    },
    usage: {
      jobsThisMonth,
      jobsLastMonth,
      activeTenantsThisMonth: activeThisMonth,
      activeTenantsLastMonth: activeLastMonth,
      activationRate: totalTenants > 0 ? Math.round((activeThisMonth / totalTenants) * 100) : 0,
      totalRepos,
      totalUsers,
    },
    revenue: {
      mrr,         // cents
      mrrByPlan,   // cents per plan
      revenueThisMonth,
      revenueLastMonth,
      activeSubsCount,
      failedPaymentsCount,
    },
  })
}
