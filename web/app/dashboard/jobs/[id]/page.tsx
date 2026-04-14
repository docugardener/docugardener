// SPDX-License-Identifier: AGPL-3.0-or-later
import { notFound } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { ArrowLeft, Clock, GitPullRequest, FileText, AlertTriangle, CheckCircle, ExternalLink, Bot, User, Blend } from "lucide-react"
import Link from "next/link"
import { formatDistanceToNow } from "date-fns"
import { FixPrTimeline } from "@/components/jobs/FixPrTimeline"

interface PageProps {
    params: Promise<{ id: string }>;
}

export default async function JobDetailsPage({ params }: PageProps) {
    const { id } = await params

    const [job, triageAudit] = await Promise.all([
        prisma.job.findUnique({ where: { id }, include: { repository: true } }),
        prisma.auditLog.findFirst({
            where: { resourceId: id, event: "TRIAGE_DECISION" },
            orderBy: { createdAt: "desc" },
            select: { actorEmail: true },
        }),
    ])

    if (!job) return notFound()

    const result = job.result as any || {}
    const analysis = result.drift_analysis || {}
    const reasons = analysis.reasons || []
    const pipelineSteps = result.pipeline_steps as { analysis_ms?: number; docs_generated?: number; policy_violations?: number; llm_tokens?: number } | undefined
    const llmUsage = result.llm_usage as { provider?: string; model?: string; total_tokens?: number } | undefined
    const modelLabel = llmUsage?.model
        ? `${llmUsage.model}${llmUsage.provider ? ` (${llmUsage.provider})` : ""}`
        : "—"
    const llmTokens = pipelineSteps?.llm_tokens ?? llmUsage?.total_tokens ?? null
    const mergeMethodLabels: Record<string, string> = {
        squash: "Squash and merge",
        merge: "Create a merge commit",
        rebase: "Rebase and merge",
    }
    const autoMergeMethod = result.autoMergeMethod
        ? (mergeMethodLabels[result.autoMergeMethod] ?? result.autoMergeMethod)
        : null
    const mergeLabel = autoMergeMethod
        ? autoMergeMethod
        : result.autoMergeSkipReason === "ci_failed"
            ? "Manual (CI failed — merged by user)"
            : result.autoMergeSkipReason === "ci_timeout"
                ? "Manual (CI timed out — merged by user)"
                : result.autoMergeSkipReason === "method_not_allowed"
                    ? "Manual (merge method mismatch — merged by user)"
                    : null

    // Who resolved this ticket?
    const humanActor = triageAudit?.actorEmail ?? null
    const resolver: { kind: "ai-author" | "human" | "mixed"; label: string } | null = (() => {
        const ts = (job as any).triageStatus as string
        if (result.autoMergeMethod)
            return { kind: "ai-author", label: "AI Author" }
        if (result.autoMergeSkipReason)
            return { kind: "mixed", label: humanActor ?? "Mixed" }
        if (ts === "IGNORED" || ts === "ACCEPTED" || ts === "RESOLVED")
            return { kind: "human", label: humanActor ?? "Human" }
        return null
    })()
    const repoFullName = result.repo_full_name as string | undefined
    const prUrl = repoFullName
        ? `https://github.com/${repoFullName}/pull/${job.prNumber}`
        : undefined

    return (
        <div className="app-container py-6 space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Link href="/dashboard/jobs">
                    <Button variant="ghost" size="icon">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                </Link>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-foreground">Scan Details</h1>
                    <div className="flex items-center gap-2 text-muted-foreground mt-1">
                        <GitPullRequest className="h-4 w-4" />
                        <span>{job.repository.name}</span>
                        <span>•</span>
                        {prUrl ? (
                            <a
                                href={prUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline inline-flex items-center gap-1"
                            >
                                PR #{job.prNumber}
                                <ExternalLink className="h-3 w-3" />
                            </a>
                        ) : (
                            <span>PR #{job.prNumber}</span>
                        )}
                        <span>•</span>
                        <Clock className="h-4 w-4" />
                        <span>{formatDistanceToNow(job.createdAt, { addSuffix: true })}</span>
                    </div>
                </div>
                <div className="ml-auto">
                    <StatusBadge status={job.status} score={result.drift_score} />
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Main Content: Analysis */}
                <div className="lg:col-span-2 space-y-6">
                    <Card className="rounded-card border-border bg-card shadow-card">
                        <CardHeader className="border-b border-border bg-muted/30">
                            <CardTitle className="type-section-header">Drift Analysis</CardTitle>
                            <CardDescription className="type-body text-muted-foreground">
                                AI-driven assessment of documentation coverage.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6 p-6">
                            {/* Score Banner */}
                            <div className="flex items-center gap-6 p-6 bg-muted/30 rounded-xl border border-border">
                                <div className="relative flex items-center justify-center h-24 w-24 shrink-0">
                                    <svg className="transform -rotate-90 w-24 h-24">
                                        {/* Track ring */}
                                        <circle cx="48" cy="48" r="40" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-muted" />
                                        {/* Score ring */}
                                        <circle cx="48" cy="48" r="40" stroke="currentColor" strokeWidth="8" fill="transparent"
                                            className={getScoreColorClass(result.drift_score)}
                                            strokeDasharray={251.2}
                                            strokeDashoffset={251.2 - (251.2 * (result.drift_score || 0)) / 100}
                                        />
                                    </svg>
                                    <span className="absolute text-2xl font-black text-foreground">{result.drift_score || 0}</span>
                                </div>
                                <div className="space-y-1.5">
                                    <h3 className="font-black text-lg text-foreground">
                                        {result.drift_score > 80 ? "Critical Drift Detected" :
                                            result.drift_score > 60 ? "Significant Drift" : "Healthy"}
                                    </h3>
                                    <p className="text-sm text-muted-foreground max-w-md leading-relaxed">
                                        {analysis.summary || "No specific summary provided."}
                                    </p>
                                </div>
                            </div>

                            {/* Reasons List */}
                            <div className="space-y-4">
                                <h3 className="font-black text-sm text-foreground flex items-center gap-2 uppercase tracking-widest">
                                    <FileText className="h-4 w-4 text-muted-foreground/60" />
                                    Detected Issues
                                </h3>
                                {reasons.length === 0 ? (
                                    <div className="text-center py-8 text-muted-foreground bg-muted/20 rounded-xl border border-border">
                                        <CheckCircle className="h-8 w-8 mx-auto mb-2 text-status-fresh" />
                                        <p className="text-sm font-bold">No issues found. Documentation is in sync!</p>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {reasons.map((r: any, idx: number) => (
                                            <div key={idx} className="p-4 rounded-xl border border-border bg-card flex gap-4 items-start">
                                                <div className="mt-0.5 shrink-0">
                                                    <AlertTriangle className="h-5 w-5 text-status-withered" />
                                                </div>
                                                <div className="space-y-1.5 min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <code className="type-mono text-sm bg-muted px-1.5 py-0.5 rounded border border-border text-foreground">
                                                            {r.entity || "General"}
                                                        </code>
                                                        {r.score && (
                                                            <Badge variant="outline" className="text-[10px] font-black uppercase tracking-tight border-border text-muted-foreground">
                                                                Impact: {r.score}
                                                            </Badge>
                                                        )}
                                                    </div>
                                                    <p className="text-sm text-muted-foreground leading-relaxed">
                                                        {r.reason}
                                                    </p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Sidebar: Meta */}
                <div className="space-y-6">
                    {/* Processing Timeline */}
                    <Card className="rounded-card border-border bg-card shadow-card">
                        <CardHeader className="border-b border-border bg-muted/30 pb-3">
                            <CardTitle className="type-section-header">Timeline</CardTitle>
                        </CardHeader>
                        <CardContent className="p-4">
                            <FixPrTimeline job={{
                                id: job.id,
                                status: job.status,
                                triageStatus: (job as any).triageStatus as string | null,
                                createdAt: job.createdAt,
                                completedAt: (job as any).completedAt as Date | null,
                                result: job.result as Record<string, unknown> | null,
                            }} />
                        </CardContent>
                    </Card>

                    <Card className="rounded-card border-border bg-card shadow-card">
                        <CardHeader className="border-b border-border bg-muted/30 pb-4">
                            <CardTitle className="type-section-header">Scan Metadata</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-0 text-sm p-0">
                            <div className="flex justify-between px-6 py-3 border-b border-border">
                                <span className="text-muted-foreground font-medium">Status</span>
                                <span className="font-black text-foreground">{job.status}</span>
                            </div>
                            <div className="flex justify-between px-6 py-3 border-b border-border">
                                <span className="text-muted-foreground font-medium">Duration</span>
                                <span className="font-black text-foreground type-mono">
                                    {result.processing_time_ms
                                        ? `${(result.processing_time_ms / 1000).toFixed(2)}s`
                                        : "—"}
                                </span>
                            </div>
                            <div className="flex justify-between px-6 py-3 border-b border-border">
                                <span className="text-muted-foreground font-medium">Docs Generated</span>
                                <span className="font-black text-foreground">{result.updates ?? 0}</span>
                            </div>
                            {pipelineSteps?.policy_violations != null && (
                                <div className="flex justify-between px-6 py-3 border-b border-border">
                                    <span className="text-muted-foreground font-medium">Policy Violations</span>
                                    <span className="font-black text-foreground">{pipelineSteps.policy_violations}</span>
                                </div>
                            )}
                            {resolver && (
                                <div className="flex justify-between items-center px-6 py-3 border-b border-border">
                                    <span className="text-muted-foreground font-medium">Resolved By</span>
                                    <ResolverBadge kind={resolver.kind} label={resolver.label} />
                                </div>
                            )}
                            <div className="px-6 py-4">
                                <h4 className="font-black text-[10px] uppercase tracking-widest text-muted-foreground mb-3">LLM</h4>
                                <div className="space-y-1.5">
                                    <p className="type-metadata text-muted-foreground">Model: {modelLabel}</p>
                                    {llmTokens != null && (
                                        <p className="type-metadata text-muted-foreground">
                                            Tokens: {llmTokens.toLocaleString()}
                                        </p>
                                    )}
                                </div>
                            </div>
                            <div className="px-6 pb-4">
                                <h4 className="font-black text-[10px] uppercase tracking-widest text-muted-foreground mb-3">Configuration</h4>
                                <div className="space-y-1.5">
                                    <p className="type-metadata text-muted-foreground">Block threshold: &gt; 80</p>
                                    {mergeLabel && (
                                        <p className="type-metadata text-muted-foreground">Merged via: {mergeLabel}</p>
                                    )}
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}

function ResolverBadge({ kind, label }: { kind: "ai-author" | "human" | "mixed"; label: string }) {
    const base = "font-black text-[10px] inline-flex items-center gap-1 px-2 py-0.5 rounded-full border"
    if (kind === "ai-author") return (
        <span className={`${base} uppercase tracking-tighter border-violet-500/50 text-violet-600 bg-violet-500/10 dark:text-violet-400 dark:border-violet-800 dark:bg-violet-950/40`}>
            <Bot className="h-3 w-3 shrink-0" />
            AI Author
        </span>
    )
    if (kind === "mixed") return (
        <span className={`${base} border-amber-500/50 text-amber-600 bg-amber-500/10 dark:text-amber-400 dark:border-amber-800 dark:bg-amber-950/40`} title="AI generated the fix PR; merged manually">
            <Blend className="h-3 w-3 shrink-0" />
            <span className="truncate max-w-[140px]">{label}</span>
        </span>
    )
    return (
        <span className={`${base} border-emerald-500/50 text-emerald-600 bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-800 dark:bg-emerald-950/40`}>
            <User className="h-3 w-3 shrink-0" />
            <span className="truncate max-w-[140px]">{label}</span>
        </span>
    )
}

function StatusBadge({ status, score }: { status: string, score: number }) {
    const base = "font-black text-[10px] uppercase tracking-tighter"

    if (status === "PROCESSING") return (
        <Badge variant="outline" className={`${base} animate-pulse border-primary/30 text-primary`}>Processing</Badge>
    )
    if (status === "FAILED") return (
        <Badge className={`${base} bg-status-broken border-status-broken/30 text-white`}>Failed</Badge>
    )
    if (score > 80) return (
        <Badge className={`${base} bg-status-broken border-status-broken/30 text-white`}>Blocked</Badge>
    )
    if (score > 60) return (
        <Badge className={`${base} bg-status-withered border-status-withered/30 text-zinc-900`}>Warning</Badge>
    )
    return (
        <Badge className={`${base} bg-status-fresh border-status-fresh/30 text-zinc-900`}>Pass</Badge>
    )
}

function getScoreColorClass(score: number) {
    if (score > 80) return "text-status-broken"
    if (score > 60) return "text-status-withered"
    return "text-status-fresh"
}
