// SPDX-License-Identifier: AGPL-3.0-or-later
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "../../auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"

export async function GET() {
    const session = await getServerSession(authOptions)

    if (!session || !session.user) {
        return new NextResponse("Unauthorized", { status: 401 })
    }

    // @ts-ignore
    const tenantId = session.user.tenantId

    // @ts-ignore
    const role = session.user.role
    if (!["ADMIN", "VIEWER", "AUDITOR"].includes(role)) {
        return NextResponse.json(
            { error: "forbidden", reason: "Requires ADMIN, VIEWER, or AUDITOR role." },
            { status: 403 }
        )
    }

    if (!tenantId) {
        return NextResponse.json([])
    }

    try {
        const recentJobs = await prisma.job.findMany({
            where: { tenantId },
            take: 10,
            orderBy: { createdAt: "desc" },
            include: {
                repository: {
                    select: { name: true }
                }
            }
        })

        const activity = recentJobs.map(job => ({
            id: job.id,
            repo: job.repository.name,
            pr: job.prNumber,
            status: job.status,
            drift: (job.result as any)?.drift_score || 0,
            date: job.createdAt
        }))

        return NextResponse.json(activity)

    } catch (error) {
        console.error("Failed to fetch activity", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
