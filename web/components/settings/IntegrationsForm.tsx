"use client"

import { useState, useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { Slack, CheckCircle2, Lock, Zap, ExternalLink, GitBranch, Triangle, Circle, FlaskConical } from "lucide-react"
import Link from "next/link"

const formSchema = z.object({
    // Slack
    slackWebhook: z.string().optional(),
    // Jira
    jiraHost: z.string().optional(),
    jiraEmail: z.string().email("Invalid email").optional().or(z.literal("")),
    jiraToken: z.string().optional(),
    // Linear
    linearApiToken: z.string().optional(),
    linearTeamId: z.string().optional(),
    // GitHub Issues
    githubIssuesEnabled: z.boolean().optional(),
    githubIssuesRepo: z.string().optional(),
})

type FormValues = z.infer<typeof formSchema>

interface IntegrationsFormProps {
    config?: {
        slack?: { webhookUrl?: string }
        jira?: { host?: string; email?: string; apiToken?: string }
        linear?: { apiToken?: string; teamId?: string }
        githubIssues?: { enabled?: boolean; repo?: string }
    }
    plan?: string
    /** PlatformCloud-granted feature keys. When provided, individual integrations
     *  are gated per key rather than by plan string alone. */
    grantedFeatures?: string[]
}

// ─── FREE plan upgrade gate ────────────────────────────────────────────────
function UpgradeGate() {
    return (
        <div className="relative">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 select-none pointer-events-none blur-sm opacity-40" aria-hidden="true">
                <Card><CardHeader><CardTitle className="flex items-center gap-2"><Slack className="w-5 h-5" />Slack</CardTitle></CardHeader><CardContent><div className="h-10 bg-muted rounded-md" /></CardContent></Card>
                <Card><CardHeader><CardTitle className="flex items-center gap-2"><ExternalLink className="w-5 h-5" />Jira</CardTitle></CardHeader><CardContent className="space-y-3"><div className="h-10 bg-muted rounded-md" /><div className="h-10 bg-muted rounded-md" /></CardContent></Card>
                <Card><CardHeader><CardTitle className="flex items-center gap-2"><Triangle className="w-5 h-5" />Linear</CardTitle></CardHeader><CardContent className="space-y-3"><div className="h-10 bg-muted rounded-md" /><div className="h-10 bg-muted rounded-md" /></CardContent></Card>
                <Card><CardHeader><CardTitle className="flex items-center gap-2"><GitBranch className="w-5 h-5" />GitHub Issues</CardTitle></CardHeader><CardContent><div className="h-10 bg-muted rounded-md" /></CardContent></Card>
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
                <div className="bg-card border border-border rounded-xl shadow-lg p-8 text-center max-w-sm mx-4">
                    <div className="flex items-center justify-center w-12 h-12 rounded-full bg-muted mx-auto mb-4">
                        <Lock className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <h3 className="font-semibold text-lg mb-2">Pro Feature</h3>
                    <p className="text-sm text-muted-foreground mb-5">
                        Slack, Jira, and Linear integrations are available on the <strong>Pro</strong> and <strong>Team</strong> plans.
                        GitHub Issues is available on all plans.
                    </p>
                    <Link href="/dashboard/billing" className="inline-flex items-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors px-5 py-2.5 rounded-lg text-sm font-medium">
                        <Zap className="w-4 h-4" />Upgrade to Pro
                    </Link>
                </div>
            </div>
        </div>
    )
}

// ─── Configured badge ──────────────────────────────────────────────────────
function ActiveBadge({ label = "Active" }: { label?: string }) {
    return (
        <span className="flex items-center gap-1 text-xs text-green-600">
            <CheckCircle2 className="w-3 h-3 text-green-500" />
            {label} — leave blank to keep current value.
        </span>
    )
}

// ─── Locked card overlay (feature revoked by PlatformCloud) ───────────────
function LockedCard({ label }: { label: string }) {
    return (
        <div className="relative">
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 z-10 rounded-xl bg-background/80 backdrop-blur-sm">
                <Lock className="w-5 h-5 text-muted-foreground" />
                <p className="text-sm text-muted-foreground font-medium">{label} is not included in your current plan.</p>
            </div>
            <div className="blur-sm opacity-30 pointer-events-none select-none">
                <Card><CardHeader><CardTitle className="h-5 bg-muted rounded w-24" /></CardHeader><CardContent><div className="h-10 bg-muted rounded-md" /></CardContent></Card>
            </div>
        </div>
    )
}

// ─── Status dot ────────────────────────────────────────────────────────────
type IntegrationKey = "slack" | "jira" | "linear" | "githubIssues"
type StatusMap = Record<IntegrationKey, boolean>

function StatusDot({ type, status }: { type: IntegrationKey; status: StatusMap | null }) {
    if (!status) return null
    const configured = status[type]
    return configured ? (
        <span
            data-testid={`status-${type}-configured`}
            className="flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400"
        >
            <Circle className="w-2 h-2 fill-green-500 text-green-500" />
            Connected
        </span>
    ) : (
        <span
            data-testid={`status-${type}-empty`}
            className="flex items-center gap-1 text-xs text-muted-foreground"
        >
            <Circle className="w-2 h-2 fill-muted-foreground text-muted-foreground opacity-40" />
            Not configured
        </span>
    )
}

// ─── Send Test button ───────────────────────────────────────────────────────
function SendTestButton({ type, status }: { type: "slack" | "jira" | "linear"; status: StatusMap | null }) {
    const [testing, setTesting] = useState(false)
    if (!status || !status[type]) return null

    const handleTest = async () => {
        setTesting(true)
        try {
            const res = await fetch(`/api/settings/integrations/test?type=${type}`, { method: "POST" })
            const body = await res.json()
            if (body.ok) {
                toast.success(`${type.charAt(0).toUpperCase() + type.slice(1)} test succeeded!`)
            } else {
                toast.error(`${type.charAt(0).toUpperCase() + type.slice(1)} test failed`, {
                    description: body.error ?? "Unknown error",
                })
            }
        } catch (err: any) {
            toast.error("Test request failed", { description: err?.message })
        } finally {
            setTesting(false)
        }
    }

    return (
        <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid={`test-btn-${type}`}
            onClick={handleTest}
            disabled={testing}
            className="gap-1.5"
        >
            <FlaskConical className="w-3.5 h-3.5" />
            {testing ? "Testing…" : "Send test"}
        </Button>
    )
}

// ─── Main form ─────────────────────────────────────────────────────────────
export function IntegrationsForm({ config, plan, grantedFeatures }: IntegrationsFormProps) {
    // Hooks must precede any early return
    const [isSaving, setIsSaving] = useState(false)
    const [integrationStatus, setIntegrationStatus] = useState<StatusMap | null>(null)

    useEffect(() => {
        fetch("/api/settings/integrations/status")
            .then(r => r.json())
            .then(setIntegrationStatus)
            .catch(() => {/* non-fatal — status dots simply stay hidden */})
    }, [])

    const hasSlack   = !!config?.slack?.webhookUrl
    const hasJira    = !!config?.jira?.apiToken
    const hasLinear  = !!config?.linear?.apiToken
    const ghEnabled  = config?.githubIssues?.enabled ?? false

    // Per-feature access: when grantedFeatures is non-empty it is authoritative
    // Accept both current DG canonical names and legacy PlatformCloud names.
    const _hasSlack  = (f: string[]) => f.includes("slack_integration")  || f.includes("slack_notifications")
    const _hasJira   = (f: string[]) => f.includes("integrations_jira")  || f.includes("jira_integration")
    const _hasLinear = (f: string[]) => f.includes("integrations_linear") || f.includes("linear_integration")
    // (PlatformCloud override). Empty array or undefined → plan-rank fallback.
    // This handles SaaS mode where grantedFeatures is [] and plan gating applies.
    const useGranted = grantedFeatures != null && grantedFeatures.length > 0
    const canSlack  = useGranted ? _hasSlack(grantedFeatures!)   : plan !== "FREE"
    const canJira   = useGranted ? _hasJira(grantedFeatures!)    : plan !== "FREE"
    const canLinear = useGranted ? _hasLinear(grantedFeatures!)  : plan !== "FREE"

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            slackWebhook: "",
            jiraHost: config?.jira?.host ?? "",
            jiraEmail: config?.jira?.email ?? "",
            jiraToken: "",
            linearApiToken: "",
            linearTeamId: config?.linear?.teamId ?? "",
            githubIssuesEnabled: ghEnabled,
            githubIssuesRepo: config?.githubIssues?.repo ?? "",
        },
    })

    const { register, handleSubmit, formState: { errors }, watch, setValue } = form
    const watchSlack        = watch("slackWebhook")
    const watchJiraToken    = watch("jiraToken")
    const watchLinearToken  = watch("linearApiToken")
    const watchGhEnabled    = watch("githubIssuesEnabled")

    // If none of the PRO integrations are accessible, show the upgrade gate.
    if (!canSlack && !canJira && !canLinear) return <UpgradeGate />

    const onSubmit = async (data: FormValues) => {
        setIsSaving(true)
        try {
            const payload = {
                workflowConfig: {
                    slack:  { webhookUrl: data.slackWebhook || undefined },
                    jira:   { host: data.jiraHost || undefined, email: data.jiraEmail || undefined, apiToken: data.jiraToken || undefined },
                    linear: { apiToken: data.linearApiToken || undefined, teamId: data.linearTeamId || undefined },
                    githubIssues: { enabled: data.githubIssuesEnabled, repo: data.githubIssuesRepo || undefined },
                },
            }

            const res = await fetch("/api/settings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            })

            if (!res.ok) {
                const body = await res.json().catch(() => ({}))
                if (body.error === "upgrade_required") {
                    const label = body.feature ? body.feature.replace("integrations_", "").replace(/^\w/, (c: string) => c.toUpperCase()) : "Integration"
                    toast.error(`${label} is not included in your current plan.`)
                    return
                }
                throw new Error("Failed to save")
            }

            toast.success("Integrations updated successfully")
            form.reset({ ...data, slackWebhook: "", jiraToken: "", linearApiToken: "" })
            window.location.reload()
        } catch {
            toast.error("Failed to update integrations", { description: "Please check your network and try again." })
        } finally {
            setIsSaving(false)
        }
    }

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* ── Slack ── */}
                {!canSlack ? <LockedCard label="Slack" /> : <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center justify-between gap-2">
                            <span className="flex items-center gap-2"><Slack className="w-5 h-5" />Slack</span>
                            <div className="flex items-center gap-2">
                                <StatusDot type="slack" status={integrationStatus} />
                                <SendTestButton type="slack" status={integrationStatus} />
                            </div>
                        </CardTitle>
                        <CardDescription>Receive real-time drift alerts in your team's Slack channel.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="space-y-1.5">
                            <Label>Incoming Webhook URL</Label>
                            <Input
                                {...register("slackWebhook")}
                                type="password"
                                placeholder={hasSlack ? "•••••••••••• (configured)" : "https://hooks.slack.com/services/..."}
                                className={cn("font-mono", hasSlack && !watchSlack && "border-green-500/30 bg-muted/30")}
                                autoComplete="new-password"
                            />
                            <p className="text-xs text-muted-foreground">
                                {hasSlack ? <ActiveBadge /> : "Create an Incoming Webhook in your Slack workspace settings."}
                            </p>
                        </div>
                    </CardContent>
                </Card>}

                {/* ── Jira ── */}
                {!canJira ? <LockedCard label="Jira" /> : <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center justify-between gap-2">
                            <span className="flex items-center gap-2"><ExternalLink className="w-5 h-5" />Jira</span>
                            <div className="flex items-center gap-2">
                                <StatusDot type="jira" status={integrationStatus} />
                                <SendTestButton type="jira" status={integrationStatus} />
                            </div>
                        </CardTitle>
                        <CardDescription>
                            Post drift comments on linked Jira tickets. Tag a ticket key (e.g. <code className="text-xs bg-muted px-1 rounded">BUG-123</code>) in your PR title or branch name.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="space-y-1.5">
                            <Label>Host URL</Label>
                            <Input {...register("jiraHost")} placeholder="https://your-domain.atlassian.net" />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Email</Label>
                            <Input {...register("jiraEmail")} type="email" placeholder="developer@company.com" />
                            {errors.jiraEmail && <p className="text-xs text-red-500">{errors.jiraEmail.message}</p>}
                        </div>
                        <div className="space-y-1.5">
                            <Label>API Token</Label>
                            <Input
                                {...register("jiraToken")}
                                type="password"
                                placeholder={hasJira ? "•••••••••••• (configured)" : "Atlassian API token"}
                                className={cn("font-mono", hasJira && !watchJiraToken && "border-green-500/30 bg-muted/30")}
                                autoComplete="new-password"
                            />
                            <p className="text-xs text-muted-foreground">
                                {hasJira
                                    ? <ActiveBadge />
                                    : <>Generate a token at <a href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank" rel="noreferrer" className="underline">id.atlassian.com</a>. No ticket key in a PR? Jira notification is skipped.</>
                                }
                            </p>
                        </div>
                    </CardContent>
                </Card>}

                {/* ── Linear ── */}
                {!canLinear ? <LockedCard label="Linear" /> : <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center justify-between gap-2">
                            <span className="flex items-center gap-2"><Triangle className="w-5 h-5" />Linear</span>
                            <div className="flex items-center gap-2">
                                <StatusDot type="linear" status={integrationStatus} />
                                <SendTestButton type="linear" status={integrationStatus} />
                            </div>
                        </CardTitle>
                        <CardDescription>Create a Linear issue automatically when documentation drift is detected in a PR.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="space-y-1.5">
                            <Label>API Token</Label>
                            <Input
                                {...register("linearApiToken")}
                                type="password"
                                placeholder={hasLinear ? "•••••••••••• (configured)" : "lin_api_..."}
                                className={cn("font-mono", hasLinear && !watchLinearToken && "border-green-500/30 bg-muted/30")}
                                autoComplete="new-password"
                            />
                            <p className="text-xs text-muted-foreground">
                                {hasLinear
                                    ? <ActiveBadge />
                                    : <>Generate at <a href="https://linear.app/settings/api" target="_blank" rel="noreferrer" className="underline">linear.app/settings/api</a></>
                                }
                            </p>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Team ID <span className="text-muted-foreground font-normal">(optional)</span></Label>
                            <Input {...register("linearTeamId")} placeholder="e.g. TEAM-123 or leave blank for default team" className="font-mono" />
                            <p className="text-xs text-muted-foreground">Find in Linear → Settings → API → Team ID.</p>
                        </div>
                    </CardContent>
                </Card>}

                {/* ── GitHub Issues ── */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><GitBranch className="w-5 h-5" />GitHub Issues</CardTitle>
                        <CardDescription>Open an issue when drift is detected and close it when the fix PR merges. Uses your existing GitHub App — no extra credentials needed.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="flex items-center justify-between">
                            <Label>Enable GitHub Issues</Label>
                            <Switch
                                checked={watchGhEnabled}
                                onCheckedChange={(v) => setValue("githubIssuesEnabled", v, { shouldDirty: true })}
                            />
                        </div>
                        {watchGhEnabled && (
                            <div className="space-y-1.5">
                                <Label>Target repo <span className="text-muted-foreground font-normal">(optional)</span></Label>
                                <Input
                                    {...register("githubIssuesRepo")}
                                    placeholder="owner/repo — defaults to the repo that triggered drift"
                                    className="font-mono"
                                />
                            </div>
                        )}
                        <p className="text-xs text-muted-foreground">Available on all plans. Issues are created using your connected GitHub App.</p>
                    </CardContent>
                </Card>

            </div>

            <div className="flex justify-end">
                <Button type="submit" disabled={isSaving}>
                    {isSaving ? "Saving..." : "Save Integrations"}
                </Button>
            </div>
        </form>
    )
}
