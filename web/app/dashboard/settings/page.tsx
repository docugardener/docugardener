// SPDX-License-Identifier: AGPL-3.0-or-later
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { LLMConfigForm } from "@/components/settings/LLMConfigForm"
import { GitHubAppForm } from "@/components/settings/GitHubAppForm"
import { NotificationConfigForm } from "@/components/settings/NotificationConfigForm"
import { IgnorePatternsForm } from "@/components/settings/IgnorePatternsForm"
import { IntegrationsForm } from "@/components/settings/IntegrationsForm"
import { ScoringModelForm } from "@/components/settings/ScoringModelForm"
import { AiAuthorModeForm } from "@/components/settings/AiAuthorModeForm"
import { PluginKeyForm } from "@/components/settings/PluginKeyForm"
import { SsoConfigForm } from "@/components/settings/SsoConfigForm"
import { ScimConfigSection } from "@/components/settings/ScimConfigSection"
import { SettingsTabs } from "@/components/settings/SettingsTabs"
import { ExecutionModeCard } from "@/components/settings/ExecutionModeCard"
import { AgentRulesPanel } from "@/components/settings/AgentRulesPanel"
import { RepoListCard } from "@/components/settings/RepoListCard"
import { PageHeader } from "@/components/layout/PageHeader"
import { StatusChip } from "@/components/ui/status-chip"
import { Cog, Bot } from "lucide-react"
import { getKeyStatusPerProvider } from "@/lib/llm-config"
import { getPlanLimits } from "@/lib/billing"
import { UpgradeContextCard } from "@/components/billing/UpgradeContextCard"


export default async function SettingsPage() {
    const session = await getServerSession(authOptions)
    if (!session?.user || !(session.user as any).tenantId) {
        redirect(session ? "/onboarding" : "/api/auth/signin")
    }

    const tenantId = (session.user as any).tenantId
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } })
    if (!tenant) return <div>Tenant not found</div>

    const llmConfig = (tenant.llmConfig as any) || {}
    const notifConfig = (tenant.notificationConfig as any) || {}
    const workflowConfig = (tenant.workflowConfig as any) || {}
    const pluginApiKey: string | undefined = workflowConfig.pluginApiKey

    const ssoConfig = {
        ssoEnabled: tenant.ssoEnabled,
        ssoProvider: tenant.ssoProvider,
        samlIdpEntityId: tenant.samlIdpEntityId,
        samlIdpSsoUrl: tenant.samlIdpSsoUrl,
        hasCertificate: !!tenant.samlIdpCertificate,
        samlAttrEmail: tenant.samlAttrEmail ?? "email",
        samlAttrRole: tenant.samlAttrRole ?? "",
        samlRoleMapAdmin: tenant.samlRoleMapAdmin ?? "",
        samlDefaultRole: tenant.samlDefaultRole ?? "VIEWER",
        sessionIdleTimeoutMinutes: tenant.sessionIdleTimeoutMinutes ?? null,
    }
    // AGV-01: load repos + their RulesArtifacts for the Agent Governance tab
    const repos = await prisma.repository.findMany({
        where: { tenantId, enabled: true },
        orderBy: { name: "asc" },
        include: { rulesArtifacts: true },
    })
    // All repos for the Repositories tab list — enabled:true excludes phantoms from
    // old/removed installations (BUG-01: disabled repos reappeared after navigation)
    const allRepos = await prisma.repository.findMany({
        where: { tenantId, enabled: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true, enabled: true, githubRepoId: true, config: true },
    })
    const isPro = tenant.plan !== "FREE"
    const planLimits = getPlanLimits(tenant.plan)

    const appUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000"
    const spEntityId = `${appUrl}/auth/saml/metadata`
    const spAcsUrl = `${appUrl}/auth/saml/callback`
    const pluginKeyMasked = pluginApiKey
        ? pluginApiKey.slice(0, 3 + 8) + "..." + pluginApiKey.slice(-4)
        : null
    const hasKeyPerProvider = getKeyStatusPerProvider(llmConfig)
    const bundledKeyAvailable = !!process.env.BUNDLED_GEMINI_KEY

    return (
        <div className="pb-20 font-sans text-foreground">
            <PageHeader
                title="Control Plane"
                description="Global governance settings for documentation drift, security rules, and processing overrides."
                subtitle={
                    <div className="flex items-center gap-2 text-muted-foreground mb-2 font-bold text-xs uppercase tracking-wider">
                        <Cog className="h-4 w-4" />
                        System Config
                    </div>
                }
            />

            <div className="app-container">
                <SettingsTabs
                    intelligence={<>
                        <ExecutionModeCard
                            llmProvider={llmConfig.provider}
                            deploymentMode={process.env.NEXT_PUBLIC_DEPLOYMENT_MODE}
                            plan={tenant.plan}
                            tenantId={tenantId}
                        />

<>
                            <div className="bg-card rounded-card border border-border shadow-card-hover overflow-hidden">
                                <div className="p-8 border-b border-border bg-muted/50">
                                    <StatusChip variant="primary" label="ACTIVE" className="mb-2" />
                                    <h3 className="type-section-header mb-1 text-muted-foreground">Intelligence Config</h3>
                                    <p className="type-body font-bold text-foreground">Manage LLM parameters and API connections.</p>
                                </div>
                                <div className="p-8">
                                    <LLMConfigForm
                                        config={{
                                            ...llmConfig,
                                            modelName: llmConfig.models?.[llmConfig.provider] || llmConfig.modelName || "",
                                        }}
                                        hasKeyPerProvider={hasKeyPerProvider}
                                        bundledKeyAvailable={bundledKeyAvailable}
                                    />
                                </div>
                            </div>

                            {tenant.plan !== "FREE" && (
                                <div className="bg-card rounded-card border border-border shadow-card-hover overflow-hidden">
                                    <div className="p-8 border-b border-border bg-muted/50">
                                        <StatusChip variant="withered" label="WARNING" className="mb-2" />
                                    <h3 className="type-section-header mb-1 text-muted-foreground">Drift Scoring Model</h3>
                                        <p className="type-body font-bold text-foreground">Select the algorithm used to assess documentation drift severity.</p>
                                    </div>
                                    <div className="p-8">
                                        <ScoringModelForm currentModel={llmConfig.scoringModel || "basic"} plan={tenant.plan} />
                                    </div>
                                </div>
                            )}

                            <div className="bg-card rounded-card border border-border shadow-card-hover overflow-hidden">
                                <div className="p-8 border-b border-border bg-muted/50">
                                    <StatusChip variant="primary" label="ACTIVE" className="mb-2" />
                                    <h3 className="type-section-header mb-1 text-muted-foreground">AI Author Mode</h3>
                                    <p className="type-body font-bold text-foreground">Zero-touch documentation for AI-authored PRs. Skip inbox triage when Copilot, Cursor, Devin, or Claude Code opens a PR.</p>
                                </div>
                                <div className="p-8">
                                    <AiAuthorModeForm config={workflowConfig} />
                                </div>
                            </div>
                        </>
                    </>}

                    integrations={<>
                        <div className="bg-card rounded-card border border-border shadow-card-hover overflow-hidden">
                            <div className="p-8 border-b border-border bg-muted/50">
                                <StatusChip variant="fresh" label="ACTIVE" className="mb-2" />
                                <h3 className="type-section-header mb-1 text-muted-foreground">Notifications</h3>
                                <p className="type-body font-bold text-foreground">Configure alert channels for drift detection.</p>
                            </div>
                            <div className="p-8">
                                <NotificationConfigForm initialTemplate={notifConfig.prTemplate} />
                            </div>
                        </div>

                        <div className="bg-card rounded-card border border-border shadow-card-hover overflow-hidden">
                            <div className="p-8 border-b border-border bg-muted/50">
                                <StatusChip variant="primary" label="ACTIVE" className="mb-2" />
                                <h3 className="type-section-header mb-1 text-muted-foreground">Workflow Integrations</h3>
                                <p className="type-body font-bold text-foreground">Connect external tools to DocuGardener for automated drift alerts.</p>
                            </div>
                            <div className="p-8">
                                <IntegrationsForm
                                    config={workflowConfig}
                                    plan={tenant.plan}
                                    grantedFeatures={workflowConfig.grantedFeatures}
                                />
                            </div>
                        </div>

                        <div className="bg-card rounded-card border border-border shadow-card-hover overflow-hidden">
                            <div className="p-8 border-b border-border bg-muted/50">
                                <StatusChip variant="primary" label="ACTIVE" className="mb-2" />
                                <h3 className="type-section-header mb-1 text-muted-foreground">VS Code Plugin</h3>
                                <p className="type-body font-bold text-foreground">API key for the DocuGardener VS Code extension — pre-push drift checks in your editor.</p>
                            </div>
                            <div className="p-8">
                                <PluginKeyForm maskedKey={pluginKeyMasked} isSet={!!pluginApiKey} />
                            </div>
                        </div>
                    </>}

                    repositories={<>
                        <div className="bg-card rounded-card border border-border shadow-card-hover overflow-hidden">
                            <div className="p-8 border-b border-border bg-muted/50">
                                <StatusChip variant="fresh" label="ACTIVE" className="mb-2" />
                                <h3 className="type-section-header mb-1 text-muted-foreground">Connected Repositories</h3>
                                <p className="type-body font-bold text-foreground">Sync and manage repositories for drift detection.</p>
                            </div>
                            <div className="p-8">
                                <RepoListCard initialRepos={allRepos} plan={tenant.plan} />
                            </div>
                        </div>

                        <div className="bg-card rounded-card border border-border shadow-card-hover overflow-hidden">
                            <div className="p-8 border-b border-border bg-muted/50">
                                <StatusChip variant="neutral" label="DEFAULT" className="mb-2" />
                                <h3 className="type-section-header mb-1 text-muted-foreground">GitHub Integration</h3>
                                <p className="type-body font-bold text-foreground">Manage App installation and permissions.</p>
                            </div>
                            <div className="p-8">
                                <GitHubAppForm initialAppId={tenant.appId || ""} />
                            </div>
                        </div>

                        <div className="bg-card rounded-card border border-border shadow-card-hover overflow-hidden">
                            <div className="p-8 border-b border-border bg-muted/50">
                                <StatusChip variant="neutral" label="DEFAULT" className="mb-2" />
                                <h3 className="type-section-header mb-1 text-muted-foreground">Ignore Patterns</h3>
                                <p className="type-body font-bold text-foreground">Exclude specific files or directories from analysis.</p>
                            </div>
                            <div className="p-8">
                                <IgnorePatternsForm />
                            </div>
                        </div>
                    </>}

                    agent_rules={<>
                        <div className="space-y-2 mb-6">
                            <div className="flex items-center gap-2">
                                <Bot className="h-4 w-4 text-primary" />
                                <h3 className="type-section-header">Agent Governance</h3>
                            </div>
                            <p className="text-sm text-muted-foreground">
                                Cross-vendor agent instruction lifecycle. Compiles your documentation policy into
                                native instruction files for Copilot, Cursor, Claude Code, and other agents —
                                keeping every AI coding tool aligned with your CI rules.
                            </p>
                        </div>
                        <AgentRulesPanel
                            repos={repos.map(r => ({ ...r, rulesArtifacts: r.rulesArtifacts as any }))}
                            isPro={isPro}
                        />
                    </>}

                    license={<>
                        <div className="bg-card rounded-card border border-border shadow-card-hover overflow-hidden">
                            <div className="p-8 border-b border-border bg-muted/50 flex items-start justify-between gap-4">
                                <div>
                                    <StatusChip variant="primary" label="ACTIVE" className="mb-2" />
                                <h3 className="type-section-header mb-1 text-muted-foreground">Subscription</h3>
                                    <p className="type-body font-bold text-foreground">
                                        Current plan and usage limits for your DocuGardener workspace.
                                    </p>
                                </div>
                                <a
                                    href="/pricing"
                                    className="shrink-0 text-xs font-semibold text-primary hover:underline whitespace-nowrap"
                                >
                                    Compare plans →
                                </a>
                            </div>
                            <div className="p-8 space-y-6">
                                <div className="flex items-center gap-3">
                                    <span className="text-sm text-muted-foreground font-medium">Current Plan:</span>
                                    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-black uppercase tracking-wider border ${
                                        tenant.plan === "TEAM" ? "bg-violet-500/10 text-violet-400 border-violet-500/30" :
                                        tenant.plan === "PRO"  ? "bg-amber-500/10 text-amber-400 border-amber-500/30" :
                                                                 "bg-blue-500/10 text-blue-400 border-blue-500/30"
                                    }`}>
                                        {tenant.plan}
                                    </span>
                                </div>
                                <div className="grid grid-cols-3 gap-4">
                                    {[
                                        { label: "PR Analyses / mo", value: planLimits.prsPerMonth === -1 ? "Unlimited" : planLimits.prsPerMonth },
                                        { label: "Repositories",     value: planLimits.repos >= 9999   ? "Unlimited" : planLimits.repos },
                                        { label: "Seats",            value: planLimits.seats },
                                    ].map(({ label, value }) => (
                                        <div key={label} className="rounded-lg border border-border bg-muted/30 p-4 text-center">
                                            <p className="text-lg font-black text-foreground">{value}</p>
                                            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1">{label}</p>
                                        </div>
                                    ))}
                                </div>
                                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                    <a href="/pricing" className="font-semibold text-primary hover:underline">
                                        Upgrade / change plan →
                                    </a>
                                    {tenant.plan !== "FREE" && (
                                        <a href="/dashboard/billing" className="hover:underline">
                                            Invoices &amp; cancellation →
                                        </a>
                                    )}
                                </div>
                            </div>
                        </div>
                    </>}

                    security={<>
                        {/* MODE-01 AC-3: platform-hosted feature dependency notice */}
                        <div className="rounded-card border border-border bg-muted/30 p-6 text-xs text-muted-foreground leading-relaxed">
                            <p className="font-black uppercase tracking-widest text-foreground mb-2 text-[10px]">Platform-Hosted Service Boundaries</p>
                            <p>
                                Features that depend on DocuGardener-hosted services (drift analysis LLM calls, auto-fix PR generation, recheck verification)
                                are affected by your <span className="font-semibold text-foreground">Execution Mode</span> configured in the Intelligence tab.
                                In <span className="font-semibold text-foreground">BYOK Local</span> or <span className="font-semibold text-foreground">Sovereign</span> mode,
                                no code content is transmitted to DocuGardener or third-party LLM providers.
                                SSO, SCIM, audit logging, and the control plane always run on DocuGardener infrastructure regardless of execution mode.
                            </p>
                        </div>

                        {tenant.plan === "TEAM" ? (<>
                            <div className="bg-card rounded-card border border-border shadow-card-hover overflow-hidden">
                                <div className="p-8 border-b border-border bg-muted/50">
                                    <StatusChip variant="fresh" label="ACTIVE" className="mb-2" />
                                    <h3 className="type-section-header mb-1 text-muted-foreground">Single Sign-On (SSO)</h3>
                                    <p className="type-body font-bold text-foreground">
                                        Configure SAML 2.0 authentication via Okta, Microsoft Entra ID, or Google Workspace.
                                    </p>
                                </div>
                                <div className="p-8">
                                    <SsoConfigForm spEntityId={spEntityId} spAcsUrl={spAcsUrl} initialConfig={ssoConfig} />
                                </div>
                            </div>

                            <div className="bg-card rounded-card border border-border shadow-card-hover overflow-hidden">
                                <div className="p-8 border-b border-border bg-muted/50">
                                    <StatusChip variant="primary" label="SSO" className="mb-2" />
                                    <h3 className="type-section-header mb-1 text-muted-foreground">SCIM 2.0 Provisioning</h3>
                                    <p className="type-body font-bold text-foreground">
                                        Automatically provision and deprovision users via Okta, Entra ID, or any SCIM-compatible IdP.
                                    </p>
                                </div>
                                <div className="p-8">
                                    <ScimConfigSection
                                        scimEnabled={tenant.scimEnabled}
                                        hasToken={!!tenant.scimBearerTokenHash}
                                        scimLastSyncAt={tenant.scimLastSyncAt?.toISOString() ?? null}
                                        scimBaseUrl={`${appUrl}/scim/v2`}
                                    />
                                </div>
                            </div>
                        </>) : (
                                <UpgradeContextCard
                                  title="SSO & SCIM Provisioning"
                                  description="Connect your identity provider (Okta, Azure AD, Google Workspace) for one-click employee login and automated seat provisioning via SCIM."
                                  persona="Companies with ≥10 engineers or a security/IT team managing access"
                                  outcomes={[
                                    "Eliminate manual seat management — new hires get access automatically via your IdP",
                                    "Satisfy SOC 2 and ISO 27001 access control requirements with centralised identity",
                                  ]}
                                  requiredPlan="TEAM"
                                />
                        )}
                    </>}
                />
            </div>
        </div>
    )
}
