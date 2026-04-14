/**
 * GET /api/settings/environment-profile
 *
 * MODE-01 AC-4: Export a JSON environment profile for security review.
 * Access: ADMIN only, TEAM plan only.
 *
 * Returns a sanitized snapshot of the tenant's execution mode, plan,
 * active integrations, and capability boundaries — no secrets included.
 */
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"
import { canAccessTenant } from "@/lib/features"

function deriveExecutionMode(provider?: string, deploymentMode?: string): string {
    // HYB-02: tri-state deployment mode
    if (deploymentMode === "air-gap") return "air-gap"
    // "sovereign" (legacy) and "client-installed" both map to the sovereign UI concept
    if (deploymentMode === "sovereign" || deploymentMode === "client-installed") return "sovereign"
    if (!provider || provider === "platform_default") return "platform"
    if (provider === "ollama") return "byok_local"
    return "byok_cloud"
}

export async function GET() {
    const session = await getServerSession(authOptions)
    if (!session?.user) return new NextResponse("Unauthorized", { status: 401 })

    const role = (session.user as any).role ?? ""
    if (role !== "ADMIN") return new NextResponse("Forbidden", { status: 403 })

    const tenantId = (session.user as any).tenantId
    const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: {
            id: true,
            name: true,
            plan: true,
            llmConfig: true,
            workflowConfig: true,
            ssoEnabled: true,
            scimEnabled: true,
            createdAt: true,
        },
    })

    if (!tenant) return new NextResponse("Tenant not found", { status: 404 })
    if (!canAccessTenant(tenant, "environment_profile")) {
        return NextResponse.json({ error: "upgrade_required", feature: "environment_profile" }, { status: 403 })
    }

    const llmConfig = (tenant.llmConfig as any) || {}
    const workflowConfig = (tenant.workflowConfig as any) || {}

    const mode = deriveExecutionMode(llmConfig.provider, process.env.DEPLOYMENT_MODE)

    const profile = {
        exportedAt: new Date().toISOString(),
        tenant: {
            id: tenant.id,
            name: tenant.name,
            plan: tenant.plan,
            createdAt: tenant.createdAt,
        },
        executionMode: {
            mode,
            llmProvider: llmConfig.provider ?? "platform_default",
            llmModel: llmConfig.modelName ?? null,
            llmBaseUrl: llmConfig.provider === "ollama" ? (llmConfig.baseUrl ?? null) : null,
            // API keys are never included — only presence flag
            hasCustomApiKey: !!(llmConfig.apiKey),
            scoringModel: llmConfig.scoringModel ?? "basic",
            promptTone: llmConfig.promptTone ?? "Strict",
        },
        capabilities: {
            driftAnalysis: true,
            autoFixPr: true,
            recheckVerification: true,
            holisticScoring: canAccessTenant(tenant, "holistic_scoring"),
            customPromptTone: canAccessTenant(tenant, "prompt_customization"),
            noDataEgressGuarantee: mode === "byok_local" || mode === "sovereign" || mode === "air-gap",
            byokKeyIsolation: mode !== "platform",
        },
        integrations: {
            slack: !!(workflowConfig.slack?.webhookUrl),
            jira: !!(workflowConfig.jira?.host),
            linear: !!(workflowConfig.linear?.apiToken),
            githubIssues: !!(workflowConfig.githubIssues?.enabled),
            vsCodePlugin: !!(workflowConfig.pluginApiKey),
        },
        security: {
            ssoEnabled: tenant.ssoEnabled,
            scimEnabled: tenant.scimEnabled,
            aiAuthorMode: !!(workflowConfig.aiAuthorMode),
            autoMergeAiDocs: !!(workflowConfig.autoMergeAiDocs),
        },
    }

    const filename = `docugardener-env-profile-${new Date().toISOString().slice(0, 10)}.json`
    return new NextResponse(JSON.stringify(profile, null, 2), {
        status: 200,
        headers: {
            "Content-Type": "application/json",
            "Content-Disposition": `attachment; filename="${filename}"`,
        },
    })
}
