// SPDX-License-Identifier: AGPL-3.0-or-later
import { NextRequest, NextResponse } from "next/server"
import { getOwnerSession } from "@/lib/owner-auth"
import { prisma } from "@/lib/prisma"
import { writeAuditLog } from "@/lib/audit"

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const owner = await getOwnerSession()
  if (!owner) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const tenant = await prisma.tenant.findUnique({
    where: { id: params.id },
    select: { workflowConfig: true, plan: true },
  })
  if (!tenant) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const wc = (tenant.workflowConfig as any) || {}
  return NextResponse.json({
    grantedFeatures: wc.grantedFeatures ?? null,
    quotaCeiling: wc.quotaCeiling ?? null,
    plan: tenant.plan,
  })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const owner = await getOwnerSession()
  if (!owner) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const body = await req.json()
  const { grantedFeatures, quotaCeiling } = body as {
    grantedFeatures?: string[] | null
    quotaCeiling?: number | null
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: params.id },
    select: { workflowConfig: true },
  })
  if (!tenant) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const current = (tenant.workflowConfig as any) || {}
  const patch: Record<string, unknown> = {}

  if (grantedFeatures !== undefined) patch.grantedFeatures = grantedFeatures
  if (quotaCeiling !== undefined) patch.quotaCeiling = quotaCeiling

  await prisma.tenant.update({
    where: { id: params.id },
    data: { workflowConfig: { ...current, ...patch } },
  })

  // Owner audit log entry (DG-OWN-03)
  await writeAuditLog({
    tenantId: params.id,
    actorEmail: owner,
    event: "OWNER_FEATURE_OVERRIDE" as any,
    metadata: {
      before: { grantedFeatures: current.grantedFeatures ?? null, quotaCeiling: current.quotaCeiling ?? null },
      after: patch,
    },
  })

  return NextResponse.json({ ok: true })
}
