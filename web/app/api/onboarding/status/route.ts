import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"

export async function GET() {
    const session = await getServerSession(authOptions)

    if (!session || !(session.user as any)?.tenantId) {
        return new NextResponse("Unauthorized", { status: 401 })
    }

    const tenantId = (session.user as any).tenantId

    try {
        const [jobCount, tenant] = await Promise.all([
            prisma.job.count({ where: { tenantId } }),
            prisma.tenant.findUnique({
                where: { id: tenantId },
                select: { llmConfig: true },
            }),
        ])

        return NextResponse.json({
            githubConnected: true,           // always true — reaching here requires GitHub OAuth
            hasFirstJob: jobCount > 0,
            hasLlmConfig: tenant?.llmConfig != null,
        })
    } catch (error) {
        console.error("Failed to fetch onboarding status", error)
        return NextResponse.json({ error: "Internal error" }, { status: 500 })
    }
}
