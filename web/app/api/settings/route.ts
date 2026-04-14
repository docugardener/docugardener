// SPDX-License-Identifier: AGPL-3.0-or-later
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"
import { encrypt, decrypt } from "@/lib/encryption"
import { writeAuditLog, getClientIp, AuditEvent } from "@/lib/audit"
import { migrateLlmConfig } from "@/lib/llm-config"
import { canAccessTenant } from "@/lib/features"

export async function POST(req: Request) {
    const session = await getServerSession(authOptions)

    if (!session || !session.user) {
        return new NextResponse("Unauthorized", { status: 401 })
    }

    // @ts-ignore
    const tenantId = session.user.tenantId

    // @ts-ignore
    if (session.user.role !== "ADMIN") {
        return new NextResponse("Forbidden", { status: 403 })
    }

    const body = await req.json()
    const { llmProvider, llmApiKey, llmBaseUrl, llmModelName, githubAppId, githubPrivateKey, llmPromptTone, workflowConfig, scoringModel } = body

    // --- Classmates Tier: Approved high-reasoning model identifiers ---
    // Lower-tier models that don't meet deterministic reasoning standards are blocked.
    const CLASSMATES_WHITELIST: Record<string, string[]> = {
        gemini: ["gemini-1.5-pro", "gemini-2.0-flash", "gemini-2.0-flash-thinking-exp", "gemini-1.5-flash"],
        openai: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-4", "o1", "o3-mini"],
        anthropic: ["claude-3-5-sonnet-20241022", "claude-3-opus-20240229"],
    }

    try {
        const updateData: any = {}

        // LLM Config
        if (llmProvider) {
            const currentTenant = await prisma.tenant.findUnique({ where: { id: tenantId } })
            // Silently migrate legacy single-key shape to per-provider shape
            const currentConfig = migrateLlmConfig((currentTenant?.llmConfig as any) || {})

            if (llmProvider === "platform_default") {
                // Platform Default: preserve all stored keys, just flip the provider flag.
                updateData.llmConfig = { ...currentConfig, provider: "platform_default" }
                if (llmPromptTone) updateData.llmConfig.promptTone = llmPromptTone
            } else {
                // Resolve key to test: prefer incoming body, fall back to stored key for this provider
                const storedEncryptedKey = currentConfig.keys?.[llmProvider]
                const apiKeyToTest = llmApiKey || (storedEncryptedKey ? decrypt(storedEncryptedKey) : undefined)

                // Connection validations
                if (llmProvider === "openai") {
                    if (!apiKeyToTest) {
                        return NextResponse.json({ error: "API key is required for OpenAI" }, { status: 400 })
                    }
                    try {
                        const res = await fetch("https://api.openai.com/v1/models", {
                            headers: { "Authorization": `Bearer ${apiKeyToTest}` }
                        })
                        if (!res.ok) {
                            return NextResponse.json({ error: "Invalid OpenAI API Key" }, { status: 400 })
                        }
                        const data = await res.json()
                        const models = data.data || []
                        if (llmModelName && !models.find((m: any) => m.id === llmModelName)) {
                            return NextResponse.json({ error: `Model ${llmModelName} not found or not accessible with this API key` }, { status: 400 })
                        }
                    } catch (e) {
                        return NextResponse.json({ error: "Failed to connect to OpenAI API" }, { status: 400 })
                    }
                } else if (llmProvider === "gemini") {
                    if (!apiKeyToTest) {
                        return NextResponse.json({ error: "API key is required for Gemini" }, { status: 400 })
                    }
                    try {
                        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKeyToTest}`)
                        if (!res.ok) {
                            return NextResponse.json({ error: "Invalid Gemini API Key" }, { status: 400 })
                        }
                    } catch (e) {
                        return NextResponse.json({ error: "Failed to connect to Gemini API" }, { status: 400 })
                    }
                } else if (llmProvider === "ollama") {
                    const baseUrlToTest = llmBaseUrl || currentConfig.baseUrls?.ollama || "http://localhost:11434"
                    const serverUrl = baseUrlToTest.replace(/\/$/, "")

                    let isConnected = false
                    try {
                        const res = await fetch(`${serverUrl}/v1/models`, { signal: AbortSignal.timeout(5000) })
                        if (res.ok) isConnected = true
                    } catch { }

                    if (!isConnected) {
                        try {
                            const res = await fetch(`${serverUrl}/api/tags`, { signal: AbortSignal.timeout(5000) })
                            if (res.ok) isConnected = true
                        } catch { }
                    }

                    if (!isConnected) {
                        return NextResponse.json({ error: `Cannot connect to local LLM server at ${serverUrl}` }, { status: 400 })
                    }
                }

                // Build updated config preserving all existing per-provider data
                const newConfig = { ...currentConfig, provider: llmProvider }

                if (llmApiKey) {
                    // Store key under keys[provider] — never overwrites other providers' keys
                    newConfig.keys = { ...(currentConfig.keys || {}), [llmProvider]: encrypt(llmApiKey) }
                }
                if (llmBaseUrl) {
                    newConfig.baseUrls = { ...(currentConfig.baseUrls || {}), ollama: llmBaseUrl }
                }
                if (llmModelName) {
                    // Whitelist only applies when using the platform's bundled key.
                    const isByok = !!llmApiKey || !!currentConfig.keys?.[llmProvider]
                    const allowedModels = CLASSMATES_WHITELIST[llmProvider]
                    if (!isByok && allowedModels && !allowedModels.includes(llmModelName)) {
                        return NextResponse.json({
                            error: `Model "${llmModelName}" does not meet the Tier 1 Classmates determinism standard for ${llmProvider}. Allowed models: ${allowedModels.join(", ")}.`
                        }, { status: 400 })
                    }
                    newConfig.models = { ...(currentConfig.models || {}), [llmProvider]: llmModelName }
                }
                if (llmPromptTone) {
                    newConfig.promptTone = llmPromptTone
                }

                updateData.llmConfig = newConfig
            }
        }

        // Scoring Model selection (Pro/Team tenants only for Holistic)
        if (scoringModel) {
            const tenantRecord = await prisma.tenant.findUnique({ where: { id: tenantId } })
            const currentLlmConfig = migrateLlmConfig((tenantRecord?.llmConfig as any) || {})

            if (scoringModel === "holistic") {
                if (!canAccessTenant(tenantRecord!, "holistic_scoring")) {
                    return NextResponse.json({ error: "Holistic Scoring Model requires a Pro or Team subscription." }, { status: 403 })
                }
            }

            updateData.llmConfig = {
                ...currentLlmConfig,
                ...(updateData.llmConfig || {}),
                scoringModel,
            }
        }

        // Notification Config
        const { notificationTemplate } = body
        if (notificationTemplate) {
            const currentTenant = await prisma.tenant.findUnique({ where: { id: tenantId } })
            const currentConfig = (currentTenant?.notificationConfig as any) || {}
            updateData.notificationConfig = { ...currentConfig, prTemplate: notificationTemplate }
        }

        // GitHub Config
        if (githubAppId) {
            updateData.appId = githubAppId
        }
        if (githubPrivateKey) {
            updateData.privateKey = encrypt(githubPrivateKey)
        }

        // Workflow Config
        if (workflowConfig) {
            const currentTenant = await prisma.tenant.findUnique({ where: { id: tenantId } })
            const currentWorkflowConfig = (currentTenant?.workflowConfig as any) || {}

            // GTM-02 / GAP-INT-1: gate each integration independently so PlatformCloud
            // can grant/revoke them separately via granted_features.
            // GitHub Issues uses the existing App token — available on all plans.
            if (workflowConfig.slack?.webhookUrl && !canAccessTenant(currentTenant!, "slack_integration")) {
                return NextResponse.json(
                    { error: "upgrade_required", feature: "slack_integration" },
                    { status: 403 },
                )
            }
            if ((workflowConfig.jira?.host || workflowConfig.jira?.apiToken) && !canAccessTenant(currentTenant!, "integrations_jira")) {
                return NextResponse.json(
                    { error: "upgrade_required", feature: "integrations_jira" },
                    { status: 403 },
                )
            }
            if (workflowConfig.linear?.apiToken && !canAccessTenant(currentTenant!, "integrations_linear")) {
                return NextResponse.json(
                    { error: "upgrade_required", feature: "integrations_linear" },
                    { status: 403 },
                )
            }
            const newWorkflowConfig = { ...currentWorkflowConfig }

            if (workflowConfig.slack) {
                newWorkflowConfig.slack = newWorkflowConfig.slack || {}
                if (workflowConfig.slack.webhookUrl) {
                    newWorkflowConfig.slack.webhookUrl = encrypt(workflowConfig.slack.webhookUrl)
                }
            }

            if (workflowConfig.jira) {
                newWorkflowConfig.jira = newWorkflowConfig.jira || {}
                if (workflowConfig.jira.host) newWorkflowConfig.jira.host = workflowConfig.jira.host
                if (workflowConfig.jira.email) newWorkflowConfig.jira.email = workflowConfig.jira.email
                if (workflowConfig.jira.apiToken) newWorkflowConfig.jira.apiToken = encrypt(workflowConfig.jira.apiToken)
            }

            if (workflowConfig.linear) {
                newWorkflowConfig.linear = newWorkflowConfig.linear || {}
                if (workflowConfig.linear.apiToken) newWorkflowConfig.linear.apiToken = encrypt(workflowConfig.linear.apiToken)
                if (workflowConfig.linear.teamId) newWorkflowConfig.linear.teamId = workflowConfig.linear.teamId
            }

            if (workflowConfig.githubIssues !== undefined) {
                newWorkflowConfig.githubIssues = newWorkflowConfig.githubIssues || {}
                if (typeof workflowConfig.githubIssues.enabled === "boolean") {
                    newWorkflowConfig.githubIssues.enabled = workflowConfig.githubIssues.enabled
                }
                if (workflowConfig.githubIssues.repo) {
                    newWorkflowConfig.githubIssues.repo = workflowConfig.githubIssues.repo
                }
            }

            // EPIC-05: AI Author Mode fields — no encryption needed
            const aiAuthorFields = [
                "aiAuthorMode", "aiAuthorPatterns",
                "autoMergeAiDocs", "autoMergeMethod", "autoMergeWaitForCI",
            ] as const
            for (const field of aiAuthorFields) {
                if (workflowConfig[field] !== undefined) {
                    newWorkflowConfig[field] = workflowConfig[field]
                }
            }

            updateData.workflowConfig = newWorkflowConfig
        }

        const updated = await prisma.tenant.update({
            where: { id: tenantId },
            data: updateData
        })

        await writeAuditLog({
            tenantId,
            // @ts-ignore
            actorId: session.user.id,
            actorEmail: session.user.email,
            actorIp: getClientIp(req),
            event: AuditEvent.SETTINGS_CHANGED,
            resourceType: "tenant",
            resourceId: tenantId,
            metadata: { changedFields: Object.keys(updateData) },
        })

        return NextResponse.json({ success: true })
    } catch (error: any) {
        console.error("Failed to update settings", error)
        // If it's a known error shape, pass it back, otherwise 500
        return NextResponse.json({ error: error?.message || "Internal Error" }, { status: 500 })
    }
}
