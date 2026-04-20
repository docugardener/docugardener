export const dynamic = "force-dynamic"
// SPDX-License-Identifier: AGPL-3.0-or-later
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"
import { Octokit } from "octokit"
import { createAppAuth } from "@octokit/auth-app"
import { decrypt } from "@/lib/encryption"
import { getPlanLimits } from "@/lib/billing"
import { canAccessTenant } from "@/lib/features"

export async function GET(req: NextRequest) {
    const session = await getServerSession(authOptions)
    if (!session || !(session.user as any).tenantId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const repos = await prisma.repository.findMany({
        where: {
            tenantId: (session.user as any).tenantId
        },
        orderBy: {
            updatedAt: 'desc'
        }
    })

    return NextResponse.json(repos)
}

export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions)
    if (!session || !(session.user as any).tenantId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const tenantId = (session.user as any).tenantId
    const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId }
    })

    if (!tenant || !tenant.appId || !tenant.privateKey || !tenant.installationId) {
        return NextResponse.json({ error: "GitHub App not fully configured. Complete onboarding first." }, { status: 400 })
    }

    try {
        const privateKey = decrypt(tenant.privateKey)
        const octokit = new Octokit({
            authStrategy: createAppAuth,
            auth: {
                appId: tenant.appId,
                privateKey: privateKey,
                installationId: tenant.installationId
            }
        })

        // Fetch repositories accessible to this installation
        const { data: { repositories } } = await octokit.rest.apps.listReposAccessibleToInstallation()

        const limits = getPlanLimits(tenant.plan)
        const maxRepos = limits.repos
        const canUsePrivateRepos = canAccessTenant(tenant, "private_repos")

        // Gate private repos via feature catalog (respects grantedFeatures override)
        const privateCount = repositories.filter(r => r.private).length
        const eligibleRepos = canUsePrivateRepos
            ? repositories
            : repositories.filter(r => !r.private).slice(0, maxRepos)

        const syncedRepos = []
        const eligibleGithubIds = new Set(eligibleRepos.map(r => String(r.id)))

        for (const repoData of eligibleRepos) {
            const repo = await prisma.repository.upsert({
                where: {
                    tenantId_githubRepoId: {
                        tenantId: tenantId,
                        githubRepoId: String(repoData.id)
                    }
                },
                update: {
                    name: repoData.name,
                    // Do NOT override enabled — preserve manual disable/enable by user
                    updatedAt: new Date()
                },
                create: {
                    tenantId: tenantId,
                    githubRepoId: String(repoData.id),
                    name: repoData.name,
                    config: { threshold: 70 }
                }
            })
            syncedRepos.push(repo)
        }

        // Repos no longer accessible to this installation — split by whether they have job history
        const removedRepos = await prisma.repository.findMany({
            where: { tenantId, githubRepoId: { notIn: [...eligibleGithubIds] } },
            select: { id: true, _count: { select: { jobs: true } } },
        })
        const toDelete = removedRepos.filter(r => r._count.jobs === 0).map(r => r.id)
        const toDisable = removedRepos.filter(r => r._count.jobs > 0).map(r => r.id)

        // Delete phantom repos (no job history — safe to remove, no FK constraint)
        if (toDelete.length > 0) {
            await prisma.repository.deleteMany({ where: { id: { in: toDelete } } })
        }
        // Disable repos with job history (preserve audit trail, hide from active list)
        if (toDisable.length > 0) {
            await prisma.repository.updateMany({
                where: { id: { in: toDisable }, enabled: true },
                data: { enabled: false, updatedAt: new Date() },
            })
        }

        const warnings: string[] = []
        if (!canUsePrivateRepos && privateCount > 0) {
            warnings.push(`${privateCount} private repo(s) were skipped — private repositories require a Pro or Team plan.`)
        }
        if (!canUsePrivateRepos && repositories.filter(r => !r.private).length > maxRepos) {
            warnings.push(`Only ${maxRepos} public repo is monitored on the Free plan. Upgrade for more.`)
        }

        return NextResponse.json({
            count: syncedRepos.length,
            repositories: syncedRepos,
            ...(warnings.length > 0 && { warnings }),
        })

    } catch (error: any) {
        console.error("Repository Sync Error:", error)
        return NextResponse.json({
            error: "Failed to sync repositories from GitHub",
            details: error.message
        }, { status: 500 })
    }
}
