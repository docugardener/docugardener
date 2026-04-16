// SPDX-License-Identifier: AGPL-3.0-or-later
"use client"

import { useState, useCallback } from "react"
import {
    Bot, RefreshCw, ExternalLink,
    CheckCircle, AlertTriangle, Circle,
    ChevronDown, ChevronUp, Loader2, InfoIcon,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { UpgradeContextCard } from "@/components/billing/UpgradeContextCard"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RulesArtifact {
    id: string
    repoId: string
    targetFormat: string
    outputPath: string
    lastHash: string | null
    lastGeneratedAt: string | null
    lastPrUrl: string | null
    isStale: boolean
    updatedAt: string
}

interface Repo {
    id: string
    name: string
    githubRepoId: string
    rulesArtifacts: RulesArtifact[]
}

interface AgentRulesPanelProps {
    repos: Repo[]
    isPro: boolean
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FORMATS = [
    {
        id: "agents_md" as const,
        label: "AGENTS.md",
        description: "Claude Code, Gemini CLI, and generic agent frameworks",
    },
    {
        id: "copilot_instructions" as const,
        label: ".github/copilot-instructions.md",
        description: "GitHub Copilot",
    },
    {
        id: "cursor_rules" as const,
        label: ".cursor/rules/docugardener.mdc",
        description: "Cursor AI",
    },
    {
        id: "claude_md" as const,
        label: "CLAUDE.md",
        description: "Claude Code",
    },
]

type FormatId = (typeof FORMATS)[number]["id"]

// DG-SAAS-05: FREE plan gets 3 rule sets; PRO/TEAM unlimited
const FREE_LIMIT = 3

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function artifactFor(repo: Repo, format: FormatId): RulesArtifact | null {
    return repo.rulesArtifacts.find(a => a.targetFormat === format) ?? null
}

/** Returns true only if the repo has a real numeric GitHub repo ID */
function isGitHubConnected(repo: Repo): boolean {
    return /^\d+$/.test(repo.githubRepoId)
}

// ---------------------------------------------------------------------------
// Stale badge
// ---------------------------------------------------------------------------

function StaleBadge({ artifact }: { artifact: RulesArtifact | null }) {
    if (!artifact) return (
        <Badge variant="outline" className="text-muted-foreground gap-1 text-[10px]">
            <Circle className="h-2.5 w-2.5" /> Never generated
        </Badge>
    )
    if (artifact.isStale) return (
        <Badge variant="outline" className="bg-yellow-950/40 text-yellow-400 border-yellow-800 gap-1 text-[10px]">
            <AlertTriangle className="h-2.5 w-2.5" /> Stale
        </Badge>
    )
    return (
        <Badge variant="outline" className="bg-emerald-950/40 text-emerald-400 border-emerald-800 gap-1 text-[10px]">
            <CheckCircle className="h-2.5 w-2.5" /> In Sync
        </Badge>
    )
}

// ---------------------------------------------------------------------------
// State types
// ---------------------------------------------------------------------------

interface RowStatus {
    loading: boolean
    msg: string | null   // "in_sync" | "pr_opened" | "upgrade_required" | "error"
    prUrl: string | null
    detail?: string
}

interface PreviewState {
    loading: boolean
    content: string | null
    error: string | null
}

// Composite key helpers — scoped per repo × format
const rowKey = (repoId: string, format: FormatId) => `${repoId}:${format}`

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export function AgentRulesPanel({ repos, isPro }: AgentRulesPanelProps) {
    const [activeTab, setActiveTab] = useState<FormatId>("agents_md")

    // Artifact state: Map<repoId, Map<format, artifact>> — updated after propose
    const initialArtifacts = () => {
        const m = new Map<string, Map<string, RulesArtifact>>()
        for (const repo of repos) {
            const fm = new Map<string, RulesArtifact>()
            for (const a of repo.rulesArtifacts) fm.set(a.targetFormat, a)
            m.set(repo.id, fm)
        }
        return m
    }
    const [allArtifacts, setAllArtifacts] = useState(initialArtifacts)

    // Propose action state — keyed by `repoId:format`
    const [rowStatus, setRowStatus] = useState<Record<string, RowStatus>>({})

    // Inline preview state — keyed by `repoId:format`
    const [previews, setPreviews] = useState<Record<string, PreviewState>>({})

    // Expanded rows — Set of `repoId:format`
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

    // Proposing-all flag per format
    const [proposingAll, setProposingAll] = useState<Record<FormatId, boolean>>({
        agents_md: false,
        copilot_instructions: false,
        cursor_rules: false,
        claude_md: false,
    })

    // -----------------------------------------------------------------------
    // Derived state for active tab
    // -----------------------------------------------------------------------

    const fmt = FORMATS.find(f => f.id === activeTab)!

    const getArtifact = (repoId: string) =>
        allArtifacts.get(repoId)?.get(activeTab) ?? null

    const connectedRepos = repos.filter(isGitHubConnected)

    const staleRepos = connectedRepos.filter(r => {
        const a = getArtifact(r.id)
        return !a || a.isStale
    })

    const inSyncCount = connectedRepos.filter(r => {
        const a = getArtifact(r.id)
        return a !== null && !a.isStale
    }).length

    const freeArtifactCount = isPro ? 0 : repos.reduce(
        (acc, r) => acc + (allArtifacts.get(r.id)?.size ?? r.rulesArtifacts.length),
        0,
    )

    // -----------------------------------------------------------------------
    // Actions
    // -----------------------------------------------------------------------

    const updateArtifact = useCallback((repoId: string, format: string, artifact: RulesArtifact) => {
        setAllArtifacts(prev => {
            const next = new Map(prev)
            const fm = new Map(next.get(repoId) ?? new Map())
            fm.set(format, artifact)
            next.set(repoId, fm)
            return next
        })
    }, [])

    const canPropose = (repoId: string): boolean => {
        if (isPro) return true
        if (getArtifact(repoId)) return true   // updating existing is always fine
        return freeArtifactCount < FREE_LIMIT
    }

    const propose = useCallback(async (repoId: string, format: FormatId) => {
        const k = rowKey(repoId, format)
        setRowStatus(s => ({ ...s, [k]: { loading: true, msg: null, prUrl: null } }))
        try {
            const res = await fetch(`/api/repos/${repoId}/rules/generate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ format }),
            })
            let data: any
            try { data = await res.json() } catch { data = {} }
            if (!res.ok) {
                const detail = data.detail ?? data.error ?? `Error ${res.status}`
                setRowStatus(s => ({ ...s, [k]: { loading: false, msg: "error", prUrl: null, detail } }))
            } else {
                setRowStatus(s => ({ ...s, [k]: { loading: false, msg: data.status, prUrl: data.pr_url ?? null } }))
                if (data.artifact) updateArtifact(repoId, format, data.artifact)
            }
        } catch {
            setRowStatus(s => ({ ...s, [k]: { loading: false, msg: "error", prUrl: null } }))
        }
    }, [updateArtifact])

    const proposeAllStale = async (format: FormatId) => {
        setProposingAll(s => ({ ...s, [format]: true }))
        for (const repo of staleRepos) {
            if (canPropose(repo.id)) await propose(repo.id, format)
        }
        setProposingAll(s => ({ ...s, [format]: false }))
    }

    const loadPreview = useCallback(async (repoId: string, format: FormatId) => {
        const k = rowKey(repoId, format)
        // Already loaded — don't re-fetch
        if (previews[k]?.content !== undefined && previews[k]?.content !== null) return
        setPreviews(s => ({ ...s, [k]: { loading: true, content: null, error: null } }))
        try {
            const res = await fetch(`/api/repos/${repoId}/rules/preview`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ formats: [format] }),
            })
            let data: any
            try { data = await res.json() } catch { data = {} }
            if (!res.ok) {
                setPreviews(s => ({ ...s, [k]: { loading: false, content: null, error: data.detail ?? data.error ?? `Error ${res.status}` } }))
            } else {
                setPreviews(s => ({ ...s, [k]: { loading: false, content: data.items?.[0]?.content ?? "(empty)", error: null } }))
            }
        } catch {
            setPreviews(s => ({ ...s, [k]: { loading: false, content: null, error: "Network error — please try again." } }))
        }
    }, [previews])

    const toggleExpand = useCallback((repoId: string, format: FormatId) => {
        const k = rowKey(repoId, format)
        setExpandedRows(prev => {
            const next = new Set(prev)
            if (next.has(k)) {
                next.delete(k)
            } else {
                next.add(k)
                loadPreview(repoId, format)
            }
            return next
        })
    }, [loadPreview])

    // -----------------------------------------------------------------------
    // Render
    // -----------------------------------------------------------------------

    if (repos.length === 0) {
        return (
            <p className="text-sm text-muted-foreground">
                No enabled repositories found. Connect a repo in the Repositories tab first.
            </p>
        )
    }

    const isProposingAll = proposingAll[activeTab]
    const allInSync = connectedRepos.length > 0 && inSyncCount === connectedRepos.length

    return (
        <div className="space-y-4">
            {/* PH15-04: Advisory framing */}
            <div className="flex items-start gap-2 rounded-md bg-muted/50 border p-3 text-sm text-muted-foreground">
                <InfoIcon className="h-4 w-4 mt-0.5 shrink-0 text-blue-500" />
                <span>
                    Rules are compiled into standard agent instruction files (AGENTS.md, CLAUDE.md,{" "}
                    <code className="text-xs">.cursor/rules</code>) and committed to your repo via PR.
                    Enforcement relies on your agents reading these files — DocuGardener does not
                    block PRs that violate them.{" "}
                    <a href="/docs/user-guide/agent-governance" className="underline hover:no-underline">
                        Learn more →
                    </a>
                </span>
            </div>
            {/* DG-SAAS-05: Free plan quota banner */}
            {!isPro && (<>
                <div
                    data-testid="free-quota-banner"
                    className="flex items-center justify-between gap-3 rounded-lg border border-yellow-800 bg-yellow-950/30 px-4 py-2.5 text-xs"
                >
                    <span className="text-yellow-300">
                        Free plan: <span className="font-bold">{freeArtifactCount}/{FREE_LIMIT}</span> rule sets used
                    </span>
                    <a href="/pricing" className="font-semibold text-yellow-400 hover:text-yellow-300 transition shrink-0">
                        Upgrade to Pro for unlimited →
                    </a>
                </div>
                {freeArtifactCount >= FREE_LIMIT && (
                          <UpgradeContextCard
                            title="Unlimited Policy Rules"
                            description="Create unlimited documentation policy rule sets per repo — custom rules for naming conventions, section requirements, staleness thresholds, and more."
                            persona="Platform teams standardising documentation practices across 5+ repos"
                            outcomes={[
                              "Enforce consistent documentation standards across every repo without manual review",
                              "Customise rules per repo — stricter for API specs, relaxed for internal tools",
                            ]}
                            requiredPlan="PRO"
                          />
                        )}
            </>)}

            {/* Tab bar */}
            <div className="flex gap-1 border-b border-border">
                {FORMATS.map(f => (
                    <button
                        key={f.id}
                        onClick={() => setActiveTab(f.id)}
                        data-testid={`tab-${f.id}`}
                        className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors font-mono ${
                            activeTab === f.id
                                ? "border-primary text-foreground"
                                : "border-transparent text-muted-foreground hover:text-foreground"
                        }`}
                    >
                        {f.label}
                    </button>
                ))}
            </div>

            {/* Section header */}
            <div className="flex items-center justify-between gap-4">
                <p className="text-xs text-muted-foreground">{fmt.description}</p>
                <div className="flex items-center gap-2 shrink-0">
                    {/* Sync pill */}
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
                        allInSync
                            ? "bg-emerald-950/40 text-emerald-400 border-emerald-800"
                            : inSyncCount === 0 && connectedRepos.length > 0
                                ? "bg-muted text-muted-foreground border-border"
                                : "bg-yellow-950/40 text-yellow-400 border-yellow-800"
                    }`}>
                        {inSyncCount}/{connectedRepos.length} in sync
                    </span>

                    {/* Propose all stale */}
                    {staleRepos.length > 0 && (
                        <button
                            onClick={() => proposeAllStale(activeTab)}
                            disabled={isProposingAll}
                            data-testid="propose-all-stale"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                        >
                            <RefreshCw className={`h-3 w-3 ${isProposingAll ? "animate-spin" : ""}`} />
                            {isProposingAll ? "Proposing…" : `Propose all stale (${staleRepos.length})`}
                        </button>
                    )}
                </div>
            </div>

            {/* Repo table */}
            <div className="rounded-card border border-border overflow-hidden">
                {/* Table header */}
                <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 px-4 py-2 bg-muted/50 border-b border-border text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    <span>Repository</span>
                    <span className="text-right">Status</span>
                    <span className="text-right w-20">Generated</span>
                    <span className="text-right w-12">PR</span>
                    <span className="text-right w-36">Actions</span>
                </div>

                <div className="divide-y divide-border">
                    {repos.map(repo => {
                        const connected = isGitHubConnected(repo)
                        const artifact = getArtifact(repo.id)
                        const k = rowKey(repo.id, activeTab)
                        const rs = rowStatus[k]
                        const isRowLoading = rs?.loading ?? false
                        const isExpanded = expandedRows.has(k)
                        const preview = previews[k]
                        const needsAction = connected && (!artifact || artifact.isStale)

                        return (
                            <div key={repo.id} data-testid={`repo-row-${repo.id}`}>
                                {/* Main row */}
                                <div className={`grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 items-center px-4 py-3 transition-colors ${connected ? "hover:bg-muted/20" : "opacity-50"}`}>
                                    {/* Repo name */}
                                    <span className="font-medium text-sm text-foreground truncate">{repo.name}</span>

                                    {/* Status badge */}
                                    <div>
                                        {connected
                                            ? <StaleBadge artifact={artifact} />
                                            : <Badge variant="outline" className="text-[10px] text-muted-foreground gap-1">Not connected</Badge>
                                        }
                                    </div>

                                    {/* Last generated */}
                                    <span className="text-xs text-muted-foreground w-20 text-right">
                                        {artifact?.lastGeneratedAt
                                            ? new Date(artifact.lastGeneratedAt).toLocaleDateString()
                                            : "—"
                                        }
                                    </span>

                                    {/* PR link */}
                                    <span className="w-12 text-right">
                                        {artifact?.lastPrUrl ? (
                                            <a href={artifact.lastPrUrl} target="_blank" rel="noopener noreferrer"
                                                className="text-xs text-primary hover:underline inline-flex items-center gap-0.5">
                                                PR <ExternalLink className="h-2.5 w-2.5" />
                                            </a>
                                        ) : <span className="text-xs text-muted-foreground">—</span>}
                                    </span>

                                    {/* Actions */}
                                    <div className="w-36 flex items-center justify-end gap-1.5">
                                        {/* Propose status */}
                                        {rs?.msg === "in_sync" && (
                                            <span className="text-xs text-emerald-400">In sync</span>
                                        )}
                                        {rs?.msg === "pr_opened" && rs.prUrl && (
                                            <a href={rs.prUrl} target="_blank" rel="noopener noreferrer"
                                                className="text-xs text-primary hover:underline inline-flex items-center gap-0.5">
                                                PR <ExternalLink className="h-2.5 w-2.5" />
                                            </a>
                                        )}
                                        {rs?.msg === "upgrade_required" && (
                                            <span className="text-xs text-yellow-400">Upgrade</span>
                                        )}
                                        {rs?.msg === "error" && (
                                            <span className="text-xs text-destructive" title={rs.detail}>Error</span>
                                        )}

                                        {/* Propose button */}
                                        {!rs?.msg && needsAction && (
                                            <button
                                                onClick={() => propose(repo.id, activeTab)}
                                                disabled={isRowLoading}
                                                data-testid={`propose-${repo.id}`}
                                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border text-xs font-medium hover:bg-muted/50 transition-colors disabled:opacity-50 shrink-0"
                                            >
                                                {isRowLoading
                                                    ? <><Loader2 className="h-2.5 w-2.5 animate-spin" /> Proposing…</>
                                                    : <><RefreshCw className="h-2.5 w-2.5" /> Propose</>
                                                }
                                            </button>
                                        )}

                                        {/* View / Close toggle */}
                                        {connected && (
                                            <button
                                                onClick={() => toggleExpand(repo.id, activeTab)}
                                                data-testid={`view-${repo.id}`}
                                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border text-xs font-medium hover:bg-muted/50 transition-colors shrink-0"
                                            >
                                                {isExpanded
                                                    ? <><ChevronUp className="h-2.5 w-2.5" /> Close</>
                                                    : <><ChevronDown className="h-2.5 w-2.5" /> View</>
                                                }
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Inline preview panel */}
                                {isExpanded && (
                                    <div
                                        data-testid={`preview-panel-${repo.id}`}
                                        className="border-t border-border bg-muted/30 px-4 py-3"
                                    >
                                        {preview?.loading && (
                                            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                                                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading preview…
                                            </div>
                                        )}
                                        {preview?.error && (
                                            <p className="text-xs text-destructive py-2">{preview.error}</p>
                                        )}
                                        {preview?.content && (
                                            <pre className="text-xs font-mono whitespace-pre-wrap text-foreground leading-relaxed max-h-96 overflow-y-auto">
                                                {preview.content}
                                            </pre>
                                        )}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}
