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
        return NextResponse.json({
            totalRepos: 0,
            activeJobs: 0,
            totalJobs24h: 0,
            avgDrift: 0
        })
    }

    try {
        // 1. Total Repos
        const totalRepos = await prisma.repository.count({
            where: { tenantId }
        })

        // 2. Jobs in last 24h
        const yesterday = new Date(new Date().getTime() - 24 * 60 * 60 * 1000)
        const totalJobs24h = await prisma.job.count({
            where: {
                tenantId,
                createdAt: { gte: yesterday }
            }
        })

        // 3. Active Jobs
        const activeJobs = await prisma.job.count({
            where: {
                tenantId,
                status: "PROCESSING"
            }
        })

        // 4. Avg Drift Score (Recent 50 completed jobs)
        // Since 'result' is JSON, we fetch and calculate in app
        const recentJobs = await prisma.job.findMany({
            where: {
                tenantId,
                status: "COMPLETED",
                // @ts-ignore
                result: { not: null }
            },
            take: 50,
            orderBy: { completedAt: "desc" },
            select: { result: true }
        })

        let totalDrift = 0
        let count = 0

        for (const job of recentJobs) {
            const res = job.result as any
            if (res && typeof res.drift_score === 'number') {
                totalDrift += res.drift_score
                count++
            }
        }

        const avgDrift = count > 0 ? Math.round(totalDrift / count) : 0

        return NextResponse.json({
            totalRepos,
            activeJobs,
            totalJobs24h,
            avgDrift
        })

    } catch (error) {
        console.error("Failed to fetch stats", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
