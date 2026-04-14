// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * POST /api/onboarding/installation
 *
 * Saves the GitHub App installation ID to the current tenant.
 * Called from /onboarding/repos when GitHub redirects back with
 * ?installation_id={id} after the user installs the GitHub App.
 *
 * Auth: requires session with tenantId + role=ADMIN
 */
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const tenantId = (session.user as any).tenantId
  if (!tenantId) {
    return NextResponse.json({ error: "No tenant" }, { status: 403 })
  }

  if ((session.user as any).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden — ADMIN role required" }, { status: 403 })
  }

  let body: { installationId?: unknown } | null
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "installationId required" }, { status: 400 })
  }

  const installationId = body?.installationId
  if (!installationId) {
    return NextResponse.json({ error: "installationId required" }, { status: 400 })
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } })
  if (!tenant) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 })
  }

  await prisma.tenant.update({
    where: { id: tenantId },
    data: { installationId: String(installationId) },
  })

  return NextResponse.json({ ok: true })
}
