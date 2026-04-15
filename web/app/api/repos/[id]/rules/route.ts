export const dynamic = "force-dynamic"
// SPDX-License-Identifier: AGPL-3.0-or-later
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000"

/** GET /api/repos/[id]/rules — list RulesArtifacts for this repo */
export async function GET(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getServerSession(authOptions)
    if (!session?.user || !(session.user as any).tenantId) {
        return new NextResponse("Unauthorized", { status: 401 })
    }

    const tenantId = (session.user as any).tenantId as string
    const { id: repoId } = await params

    // Verify repo belongs to tenant
    const repo = await prisma.repository.findFirst({ where: { id: repoId, tenantId } })
    if (!repo) return new NextResponse("Not Found", { status: 404 })

    const artifacts = await prisma.rulesArtifact.findMany({
        where: { tenantId, repoId },
        orderBy: { updatedAt: "desc" },
    })

    return NextResponse.json(artifacts)
}
