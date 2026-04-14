"use client"

import { useState } from "react"
import { Bot, RefreshCw, Eye, ExternalLink, CheckCircle, AlertTriangle, Circle, Lock, Zap } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import Link from "next/link"

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
}

interface AgentRulesCardProps {
    repo: Repo
    artifacts: RulesArtifact[]
    isPro: boolean
    freeArtifactCount: number  // total across tenant (for limit enforcement)
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FORMATS = [
    {
        id: "agents_md",
        label: "AGENTS.md",
        description: "Claude Code, Gemini CLI, and generic agent frameworks",
    },
    {
        id: "copilot_instructions",
        label: ".github/copilot-instructions.md",
        description: "GitHub Copilot",
    },
] as const

const FREE_LIMIT = 1

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StaleBadge({ artifact }: { artifact: RulesArtifact | null }) {
    if (!artifact) {
        return (
            <Badge variant="outline" className="text-muted-foreground gap-1">
                <Circle className="h-3 w-3" /> Never generated
            </Badge>
        )
    }
    if (artifact.isStale) {
        return (
            <Badge variant="outline" className="bg-yellow-950/40 text-yellow-400 border-yellow-800 gap-1">
                <AlertTriangle className="h-3 w-3" /> Stale
            </Badge>
        )
    }
    return (
        <Badge variant="outline" className="bg-emerald-950/40 text-emerald-400 border-emerald-800 gap-1">
            <CheckCircle className="h-3 w-3" /> In Sync
        </Badge>
    )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AgentRulesCard({ repo, artifacts, isPro, freeArtifactCount }: AgentRulesCardProps) {
    const [previewing, setPreviewing] = useState<string | null>(null)
    const [previewContent, setPreviewContent] = useState<string | null>(null)
    const [generating, setGenerating] = useState<string | null>(null)
    const [prUrl, setPrUrl] = useState<string | null>(null)
    const [statusMsg, setStatusMsg] = useState<string | null>(null)
    const [localArtifacts, setLocalArtifacts] = useState<RulesArtifact[]>(artifacts)

    const artifactFor = (fmt: string) => localArtifacts.find(a => a.targetFormat === fmt) ?? null

    const canGenerate = (fmt: string): boolean => {
        if (isPro) return true
        // Free: allowed if this format already has an artifact, or total < limit
        if (artifactFor(fmt)) return true
        return freeArtifactCount < FREE_LIMIT
    }

    async function handlePreview(fmt: string) {
        setPreviewing(fmt)
        setPreviewContent(null)
        try {
            const res = await fetch(`/api/repos/${repo.id}/rules/preview`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ formats: [fmt] }),
            })
            const data = await res.json()
            if (data.items?.[0]?.content) {
                setPreviewContent(data.items[0].content)
            } else {
                setPreviewContent("(no content returned)")
            }
        } catch {
            setPreviewContent("Error fetching preview.")
        }
    }

    async function handleGenerate(fmt: string) {
        if (!canGenerate(fmt)) {
            setStatusMsg("upgrade_required")
            return
        }
        setGenerating(fmt)
        setStatusMsg(null)
        setPrUrl(null)
        try {
            const res = await fetch(`/api/repos/${repo.id}/rules/generate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ format: fmt }),
            })
            const data = await res.json()
            setStatusMsg(data.status)
            if (data.pr_url) setPrUrl(data.pr_url)
            if (data.artifact) {
                setLocalArtifacts(prev => {
                    const others = prev.filter(a => a.targetFormat !== fmt)
                    return [...others, data.artifact]
                })
            }
        } catch {
            setStatusMsg("error")
        } finally {
            setGenerating(null)
        }
    }

    return (
        <Card className="rounded-card border-border bg-card shadow-card">
            <CardHeader className="border-b border-border bg-muted/30 pb-4">
                <CardTitle className="type-section-header flex items-center gap-2">
                    <Bot className="h-4 w-4 text-primary" />
                    {repo.name}
                </CardTitle>
            </CardHeader>
            <CardContent className="p-0 divide-y divide-border">
                {FORMATS.map(fmt => {
                    const artifact = artifactFor(fmt.id)
                    const isGenerating = generating === fmt.id
                    const isPreviewing = previewing === fmt.id

                    return (
                        <div key={fmt.id} className="p-5 space-y-3">
                            <div className="flex items-start justify-between gap-4 flex-wrap">
                                <div className="space-y-0.5">
                                    <p className="font-mono text-sm font-bold text-foreground">{fmt.label}</p>
                                    <p className="text-xs text-muted-foreground">{fmt.description}</p>
                                </div>
                                <StaleBadge artifact={artifact} />
                            </div>

                            {artifact?.lastGeneratedAt && (
                                <p className="text-xs text-muted-foreground">
                                    Last generated {new Date(artifact.lastGeneratedAt).toLocaleDateString()}
                                    {artifact.lastPrUrl && (
                                        <>
                                            {" · "}
                                            <a
                                                href={artifact.lastPrUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="underline hover:text-foreground"
                                            >
                                                View PR <ExternalLink className="inline h-3 w-3" />
                                            </a>
                                        </>
                                    )}
                                </p>
                            )}

                            <div className="flex items-center gap-2 flex-wrap">
                                {/* Preview */}
                                <button
                                    onClick={() => {
                                        if (isPreviewing && previewContent) {
                                            setPreviewing(null)
                                            setPreviewContent(null)
                                        } else {
                                            handlePreview(fmt.id)
                                        }
                                    }}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs font-medium hover:bg-muted/50 transition-colors"
                                >
                                    <Eye className="h-3 w-3" />
                                    {isPreviewing && !previewContent ? "Loading…" : isPreviewing ? "Hide preview" : "Preview"}
                                </button>

                                {/* Generate / Upgrade */}
                                {canGenerate(fmt.id) ? (
                                    <button
                                        onClick={() => handleGenerate(fmt.id)}
                                        disabled={isGenerating}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                                    >
                                        <RefreshCw className={`h-3 w-3 ${isGenerating ? "animate-spin" : ""}`} />
                                        {isGenerating ? "Proposing…" : "Propose Update"}
                                    </button>
                                ) : (
                                    <Link href="/dashboard/billing">
                                        <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-muted border border-border text-xs font-medium hover:bg-muted/70 transition-colors">
                                            <Lock className="h-3 w-3" />
                                            Upgrade for more
                                        </button>
                                    </Link>
                                )}
                            </div>

                            {/* Status message after generate */}
                            {statusMsg && generating === null && (
                                <div className="text-xs mt-1">
                                    {statusMsg === "in_sync" && (
                                        <span className="text-emerald-400">✓ Already in sync — no PR needed.</span>
                                    )}
                                    {statusMsg === "pr_opened" && prUrl && (
                                        <span className="text-primary">
                                            PR opened:{" "}
                                            <a href={prUrl} target="_blank" rel="noopener noreferrer" className="underline">
                                                {prUrl}
                                            </a>
                                        </span>
                                    )}
                                    {statusMsg === "upgrade_required" && (
                                        <span className="text-yellow-400">
                                            Free tier limit reached.{" "}
                                            <Link href="/dashboard/billing" className="underline">Upgrade to PRO</Link>
                                            {" "}for unlimited repos and formats.
                                        </span>
                                    )}
                                    {statusMsg === "error" && (
                                        <span className="text-destructive">Something went wrong. Please try again.</span>
                                    )}
                                </div>
                            )}

                            {/* Preview content */}
                            {isPreviewing && previewContent && (
                                <pre className="mt-2 rounded-md bg-muted p-4 text-xs overflow-auto max-h-72 font-mono whitespace-pre-wrap border border-border">
                                    {previewContent}
                                </pre>
                            )}
                        </div>
                    )
                })}
            </CardContent>
        </Card>
    )
}
