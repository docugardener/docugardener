export const dynamic = "force-dynamic"
// SPDX-License-Identifier: AGPL-3.0-or-later
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "../../auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"
import { writeAuditLog, getClientIp, AuditEvent } from "@/lib/audit"

export async function DELETE(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getServerSession(authOptions)
    if (!session || !session.user) {
        return new NextResponse("Unauthorized", { status: 401 })
    }

    // @ts-ignore
    const tenantId = session.user.tenantId
    const { id } = await params

    const repo = await prisma.repository.findFirst({
        where: { id, tenantId }
    })

    if (!repo) {
        return new NextResponse("Repository not found", { status: 404 })
    }

    // Delete dependent jobs first (FK is ON DELETE RESTRICT)
    await prisma.$transaction([
        prisma.job.deleteMany({ where: { repositoryId: id } }),
        prisma.repository.delete({ where: { id } }),
    ])

    return new NextResponse(null, { status: 204 })
}

export async function PATCH(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getServerSession(authOptions)

    if (!session || !session.user) {
        return new NextResponse("Unauthorized", { status: 401 })
    }

    // @ts-ignore
    const tenantId = session.user.tenantId
    const { id } = await params
    const repoId = id

    try {
        const body = await req.json()
        const { enabled, threshold, crossRepoSiblings } = body

        // Validate crossRepoSiblings
        if (crossRepoSiblings !== undefined && crossRepoSiblings !== null) {
            if (!Array.isArray(crossRepoSiblings) || !crossRepoSiblings.every((s: unknown) => typeof s === "string")) {
                return NextResponse.json({ error: "crossRepoSiblings must be a string array" }, { status: 400 })
            }
        }

        // Verify ownership
        const repo = await prisma.repository.findFirst({
            where: { id: repoId, tenantId }
        })

        if (!repo) {
            return new NextResponse("Repository not found", { status: 404 })
        }

        // Update
        const data: any = {}
        if (typeof enabled === "boolean") data.enabled = enabled

        // Merge config
        if (threshold !== undefined || crossRepoSiblings !== undefined) {
            const currentConfig = (repo.config as any) || {}
            data.config = {
                ...currentConfig,
                ...(threshold !== undefined ? { threshold: Number(threshold) } : {}),
                ...(crossRepoSiblings !== undefined ? { crossRepoSiblings } : {}),
            }
        }

        const updated = await prisma.repository.update({
            where: { id: repoId },
            data
        })

        if (typeof enabled === "boolean") {
            await writeAuditLog({
                tenantId,
                // @ts-ignore
                actorId: session.user.id,
                actorEmail: session.user.email,
                actorIp: getClientIp(req),
                event: AuditEvent.REPO_TOGGLED,
                resourceType: "repository",
                resourceId: repoId,
                metadata: { enabled, repoName: repo.name },
            })
        }

        return NextResponse.json(updated)
    } catch (error) {
        console.error("Failed to update repo", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
