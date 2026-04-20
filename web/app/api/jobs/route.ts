// SPDX-License-Identifier: AGPL-3.0-or-later
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"

export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const { searchParams } = new URL(request.url)
        const since = searchParams.get("since")
        const countOnly = searchParams.get("countOnly") === "true"

        const user = await prisma.user.findUnique({
            where: { email: session.user.email! },
            select: { tenantId: true },
        })
        if (!user?.tenantId) {
            return NextResponse.json({ error: "Tenant not found" }, { status: 404 })
        }

        const sinceDate = since ? new Date(since) : null

        const where: Prisma.JobWhereInput = {
            tenantId: user.tenantId,
            OR: [
                { triageStatus: { in: ["RESOLVED", "FIX_PR_FAILED", "FIX_PR_CANCELLED", "IGNORED"] } },
                { status: { in: ["COMPLETED", "FAILED", "QUOTA_EXCEEDED"] } },
            ],
            ...(sinceDate && !isNaN(sinceDate.getTime()) ? { updatedAt: { gt: sinceDate } } : {}),
        }

        if (countOnly) {
            const count = await prisma.job.count({ where })
            return NextResponse.json({ count })
        }

        const jobs = await prisma.job.findMany({
            where,
            orderBy: { updatedAt: "desc" },
            take: 100,
        })
        return NextResponse.json(jobs)
    } catch (err) {
        console.error("[/api/jobs] 500:", err)
        return NextResponse.json({ error: String(err) }, { status: 500 })
    }
}
