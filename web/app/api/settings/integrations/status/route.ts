import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"

/**
 * GET /api/settings/integrations/status
 *
 * Returns a boolean flag per integration indicating whether it is configured.
 * Does not check feature grants — any authenticated user can see status.
 */
export async function GET(req: Request) {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }

    const { tenantId } = session.user as any
    const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { workflowConfig: true },
    })

    const wc = (tenant?.workflowConfig as any) || {}

    return NextResponse.json({
        slack:       !!(wc.slack?.webhookUrl),
        jira:        !!(wc.jira?.host && wc.jira?.apiToken),
        linear:      !!(wc.linear?.apiToken),
        githubIssues: !!(wc.githubIssues?.enabled && wc.githubIssues?.repo),
    })
}
