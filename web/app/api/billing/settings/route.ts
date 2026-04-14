// SPDX-License-Identifier: AGPL-3.0-or-later
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

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

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { billingConfig: true } })
  const billingConfig = (tenant?.billingConfig as any) ?? {}

  return NextResponse.json({ monthlyBudgetUsd: billingConfig.monthlyBudgetUsd ?? null })
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const tenantId = (session.user as any).tenantId
  if (!tenantId) return NextResponse.json({ error: "No tenant" }, { status: 403 })

  if ((session.user as any).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden: ADMIN role required" }, { status: 403 })
  }

  const body = await req.json()
  const { monthlyBudgetUsd } = body

  if (monthlyBudgetUsd !== null && monthlyBudgetUsd !== undefined) {
    const parsed = Number(monthlyBudgetUsd)
    if (isNaN(parsed) || parsed < 0) {
      return NextResponse.json({ error: "monthlyBudgetUsd must be a non-negative number or null" }, { status: 400 })
    }
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { billingConfig: true } })
  const currentConfig = (tenant?.billingConfig as any) ?? {}

  const newConfig = {
    ...currentConfig,
    monthlyBudgetUsd: monthlyBudgetUsd === null || monthlyBudgetUsd === undefined ? null : Number(monthlyBudgetUsd),
  }

  await prisma.tenant.update({
    where: { id: tenantId },
    data: { billingConfig: newConfig },
  })

  return NextResponse.json({ success: true, monthlyBudgetUsd: newConfig.monthlyBudgetUsd })
}
