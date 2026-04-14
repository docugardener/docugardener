"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Download, Cpu, Cloud, Server, ShieldCheck, Check, X } from "lucide-react"
import { toast } from "sonner"

// ── Mode derivation ────────────────────────────────────────────────────────────

export type ExecutionMode = "platform" | "byok_cloud" | "byok_local" | "sovereign"

export function deriveExecutionMode(llmProvider?: string, deploymentMode?: string): ExecutionMode {
    if (deploymentMode === "sovereign") return "sovereign"
    if (!llmProvider || llmProvider === "platform_default") return "platform"
    if (llmProvider === "ollama") return "byok_local"
    // gemini / openai with own key → BYOK Cloud
    return "byok_cloud"
}

// ── Mode metadata ──────────────────────────────────────────────────────────────

const MODE_META: Record<ExecutionMode, {
    label: string
    description: string
    dataPath: string
    badgeClass: string
    borderClass: string
    icon: React.ElementType
    capabilities: { name: string; available: boolean; note?: string }[]
}> = {
    platform: {
        label: "Platform Mode",
        description: "DocuGardener-hosted LLM. Zero configuration — analysis runs on shared infrastructure.",
        dataPath: "Code diffs sent to DocuGardener platform → Gemini Flash (rate-limited shared key)",
        badgeClass: "bg-blue-500/10 text-blue-400 border-blue-500/30",
        borderClass: "border-l-blue-500",
        icon: Cloud,
        capabilities: [
            { name: "Drift analysis",               available: true },
            { name: "Auto-fix PR generation",       available: true },
            { name: "Recheck verification",          available: true },
            { name: "Holistic scoring model",        available: false, note: "PRO+ only" },
            { name: "Custom prompt tone",            available: false, note: "PRO+ only" },
            { name: "No data egress guarantee",      available: false, note: "Shared infra" },
            { name: "BYOK key isolation",            available: false, note: "Configure BYOK key" },
        ],
    },
    byok_cloud: {
        label: "BYOK Cloud",
        description: "Your own cloud LLM key (Gemini or OpenAI). Analysis runs on DocuGardener infra using your key.",
        dataPath: "Code diffs sent to DocuGardener platform → your LLM key (Gemini / OpenAI)",
        badgeClass: "bg-amber-500/10 text-amber-400 border-amber-500/30",
        borderClass: "border-l-amber-500",
        icon: Cpu,
        capabilities: [
            { name: "Drift analysis",               available: true },
            { name: "Auto-fix PR generation",       available: true },
            { name: "Recheck verification",          available: true },
            { name: "Holistic scoring model",        available: true },
            { name: "Custom prompt tone",            available: true },
            { name: "No data egress guarantee",      available: false, note: "Platform still processes" },
            { name: "BYOK key isolation",            available: true },
        ],
    },
    byok_local: {
        label: "BYOK Local",
        description: "Self-hosted Ollama / LM Studio. Analysis calls your local model — no data leaves your infrastructure.",
        dataPath: "Code diffs analyzed locally → your Ollama / LM Studio endpoint (no external calls)",
        badgeClass: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
        borderClass: "border-l-emerald-500",
        icon: Server,
        capabilities: [
            { name: "Drift analysis",               available: true },
            { name: "Auto-fix PR generation",       available: true },
            { name: "Recheck verification",          available: true },
            { name: "Holistic scoring model",        available: true },
            { name: "Custom prompt tone",            available: true },
            { name: "No data egress guarantee",      available: true },
            { name: "BYOK key isolation",            available: true },
        ],
    },
    sovereign: {
        label: "Sovereign / On-Prem",
        description: "Full on-prem deployment via Helm. All services run inside your infrastructure boundary.",
        dataPath: "All traffic stays within your network — Control Plane + Analysis Plane self-hosted",
        badgeClass: "bg-violet-500/10 text-violet-400 border-violet-500/30",
        borderClass: "border-l-violet-500",
        icon: ShieldCheck,
        capabilities: [
            { name: "Drift analysis",               available: true },
            { name: "Auto-fix PR generation",       available: true },
            { name: "Recheck verification",          available: true },
            { name: "Holistic scoring model",        available: true },
            { name: "Custom prompt tone",            available: true },
            { name: "No data egress guarantee",      available: true },
            { name: "BYOK key isolation",            available: true },
        ],
    },
}

// ── Component ──────────────────────────────────────────────────────────────────

interface ExecutionModeCardProps {
    llmProvider?: string
    deploymentMode?: string
    plan: string
    tenantId: string
}

export function ExecutionModeCard({ llmProvider, deploymentMode, plan, tenantId }: ExecutionModeCardProps) {
    const [exporting, setExporting] = useState(false)
    const mode = deriveExecutionMode(llmProvider, deploymentMode)
    const baseMeta = MODE_META[mode]
    const isPro = plan === "PRO" || plan === "TEAM"
    const isTeam = plan === "TEAM"

    // Plan-aware capability overrides: holistic scoring and custom prompt tone
    // remain PRO+ regardless of execution mode (they are LLM feature flags, not BYOK flags)
    const meta = {
        ...baseMeta,
        capabilities: baseMeta.capabilities.map(cap => {
            if (!isPro && (cap.name === "Holistic scoring model" || cap.name === "Custom prompt tone")) {
                return { ...cap, available: false, note: "PRO+ only" }
            }
            return cap
        }),
    }
    const Icon = meta.icon

    async function handleExportProfile() {
        setExporting(true)
        try {
            const res = await fetch("/api/settings/environment-profile")
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            const blob = await res.blob()
            const url = URL.createObjectURL(blob)
            const a = document.createElement("a")
            a.href = url
            a.download = `docugardener-env-profile-${new Date().toISOString().slice(0, 10)}.json`
            a.click()
            URL.revokeObjectURL(url)
            toast.success("Environment profile exported")
        } catch (e: any) {
            toast.error("Export failed", { description: e.message })
        } finally {
            setExporting(false)
        }
    }

    return (
        <div className={`bg-card rounded-card border border-border shadow-card-hover border-l-8 ${meta.borderClass} overflow-hidden`}>
            <div className="p-8 border-b border-border bg-muted/50 flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-muted border border-border shrink-0">
                        <Icon className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <h3 className="type-section-header text-muted-foreground">Execution Mode</h3>
                            <Badge variant="outline" className={`text-[10px] font-black px-2 py-0.5 ${meta.badgeClass}`}>
                                {meta.label}
                            </Badge>
                        </div>
                        <p className="type-body font-bold text-foreground">{meta.description}</p>
                    </div>
                </div>
                {isTeam && (
                    <Button
                        variant="outline"
                        size="sm"
                        className="shrink-0 gap-1.5 h-8 text-xs"
                        onClick={handleExportProfile}
                        disabled={exporting}
                    >
                        <Download className="w-3.5 h-3.5" />
                        {exporting ? "Exporting…" : "Export Profile"}
                    </Button>
                )}
            </div>

            <div className="p-8 grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Data path */}
                <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3">Data Path</p>
                    <div className="rounded-md bg-muted/60 border border-border px-4 py-3">
                        <p className="text-xs font-mono text-foreground leading-relaxed">{meta.dataPath}</p>
                    </div>
                </div>

                {/* Capability matrix */}
                <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3">Capabilities</p>
                    <div className="space-y-2">
                        {meta.capabilities.map(({ name, available, note }) => (
                            <div key={name} className="flex items-center justify-between text-xs">
                                <div className="flex items-center gap-2">
                                    {available
                                        ? <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                        : <X className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
                                    }
                                    <span className={available ? "text-foreground font-medium" : "text-muted-foreground"}>{name}</span>
                                </div>
                                {note && <span className="text-[10px] text-muted-foreground">{note}</span>}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}
