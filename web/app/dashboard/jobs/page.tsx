// SPDX-License-Identifier: AGPL-3.0-or-later
import { getServerSession } from "next-auth"
import { authOptions } from "../../api/auth/[...nextauth]/route"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Suspense } from "react"
import { prisma } from "@/lib/prisma"
import { JobStatus } from "@prisma/client"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PageHeader } from "@/components/layout/PageHeader"
import { TablePagination } from "@/components/ui/TablePagination"
import { JobsFilter } from "@/components/jobs/JobsFilter"
import { GitPullRequest, Clock, ExternalLink, ThumbsUp, ThumbsDown, Loader2, Info } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { getUiStatus, type UiStatus } from "@/lib/job-status"

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 25

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function FeedbackBadge({ signal }: { signal: string | null | undefined }) {
    if (!signal) return <span className="w-4" />  // keep column width stable
    if (signal === "up") return (
        <span title="Marked as accurate" className="flex items-center text-emerald-400">
            <ThumbsUp className="h-3 w-3" />
        </span>
    )
    return (
        <span title="Reported as false positive" className="flex items-center text-yellow-400">
            <ThumbsDown className="h-3 w-3" />
        </span>
    )
}

/** Pass / Warning / Blocked — based on drift score; only shown for completed jobs. */
export function TierBadge({ score }: { score?: number }) {
    if (score === undefined) return null
    if (score <= 60) return (
        <Badge variant="outline" className="bg-transparent text-emerald-700 border-emerald-500/50 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800 text-[10px]">
            Pass
        </Badge>
    )
    if (score <= 80) return (
        <Badge variant="outline" className="bg-transparent text-amber-700 border-amber-500/50 dark:bg-yellow-950/40 dark:text-yellow-400 dark:border-yellow-800 text-[10px]">
            Warning
        </Badge>
    )
    return (
        <Badge variant="outline" className="bg-transparent text-rose-700 border-rose-500/50 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800 text-[10px]">
            Blocked
        </Badge>
    )
}

/** User-facing status badge driven by getUiStatus() — single source of truth. */
export function UiStatusBadge({ uiStatus }: { uiStatus: UiStatus }) {
    const base = "text-[10px] font-black uppercase tracking-wider inline-flex items-center gap-1"
    if (uiStatus === "QUEUED") return (
        <Badge variant="outline" className={`${base} text-muted-foreground`}>
            <Loader2 className="h-2.5 w-2.5 animate-spin" />Queued
        </Badge>
    )
    if (uiStatus === "ANALYZING") return (
        <Badge variant="outline" className={`${base} border-blue-500/50 text-blue-600 dark:text-blue-400`}>
            <Loader2 className="h-2.5 w-2.5 animate-spin" />Analyzing
        </Badge>
    )
    if (uiStatus === "AI_FIXING") return (
        <Badge variant="outline" className={`${base} border-violet-500/50 text-violet-600 dark:text-violet-400`}>
            <Loader2 className="h-2.5 w-2.5 animate-spin" />AI fixing
        </Badge>
    )
    if (uiStatus === "FIX_PR_OPEN") return (
        <Badge variant="outline" className={`${base} border-emerald-500/50 text-emerald-600 dark:text-emerald-400`}>
            Fix PR open
        </Badge>
    )
    if (uiStatus === "NEEDS_REVIEW") return (
        <Badge variant="outline" className={`${base} border-amber-500/50 text-amber-600 dark:text-amber-400`}>
            Review
        </Badge>
    )
    if (uiStatus === "NO_DRIFT") return (
        <Badge variant="outline" className={`${base} border-emerald-500/50 text-emerald-600 dark:text-emerald-400`}>
            No drift
        </Badge>
    )
    if (uiStatus === "RESOLVED") return (
        <Badge variant="outline" className={`${base} border-emerald-500/50 text-emerald-600 dark:text-emerald-400`}>
            Resolved
        </Badge>
    )
    if (uiStatus === "DISMISSED") return (
        <Badge variant="outline" className={`${base} text-muted-foreground`}>Dismissed</Badge>
    )
    if (uiStatus === "FAILED") return (
        <Badge variant="destructive" className={base}>Failed</Badge>
    )
    if (uiStatus === "QUOTA_EXCEEDED") return (
        <Badge variant="outline" className={`${base} border-amber-500 text-amber-600 dark:text-amber-400`}>Quota exceeded</Badge>
    )
    return <Badge variant="outline" className={base}>{uiStatus}</Badge>
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function JobsPage({
    searchParams,
}: {
    searchParams: Promise<{ q?: string; page?: string; status?: string }>
}) {
    const { q: rawQ, page: rawPage, status: rawStatus } = await searchParams
    const session = await getServerSession(authOptions)
    if (!session?.user || !(session.user as any).tenantId) {
        redirect(session ? "/onboarding" : "/api/auth/signin")
    }

    const tenantId = (session.user as any).tenantId
    const q      = rawQ?.trim() ?? ""
    const status = rawStatus?.toUpperCase() ?? ""
    const page   = Math.max(1, Number(rawPage ?? 1))

    // Build where clause — text search + optional status filter
    const prNum = q !== "" && /^\d+$/.test(q) ? Number(q) : null
    const where = {
        tenantId,
        ...(status ? { status: status as JobStatus } : {}),
        ...(q !== "" && {
            OR: [
                { repository: { name: { contains: q, mode: "insensitive" as const } } },
                ...(prNum !== null ? [{ prNumber: prNum }] : []),
            ],
        }),
    }

    const [totalCount, completedCount, failedCount, quotaExceededCount, filteredCount, jobs] = await Promise.all([
        prisma.job.count({ where: { tenantId } }),
        prisma.job.count({ where: { tenantId, status: "COMPLETED" } }),
        prisma.job.count({ where: { tenantId, status: "FAILED" } }),
        prisma.job.count({ where: { tenantId, status: "QUOTA_EXCEEDED" } }),
        prisma.job.count({ where }),
        prisma.job.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip: (page - 1) * PAGE_SIZE,
            take: PAGE_SIZE,
            include: {
                repository: { select: { name: true } },
                feedback:   { select: { signal: true }, take: 1 },
            },
        }),
    ])

    const totalPages = Math.max(1, Math.ceil(filteredCount / PAGE_SIZE))

    return (
        <div className="w-full min-h-screen bg-background pb-20 font-sans text-foreground">
            <PageHeader
                title="JOB HISTORY"
                description="All analysis runs across your connected repositories"
                subtitle={
                    <div className="flex items-center gap-2 text-primary mb-2 font-black text-[11px] uppercase tracking-[0.3em]">
                        <Clock className="h-4 w-4" />
                        Scan Archive
                    </div>
                }
            >
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-6">
                    {[
                        { label: "Total Scans",    val: totalCount,         highlight: false },
                        { label: "Completed",      val: completedCount,     highlight: false },
                        { label: "Failed",         val: failedCount,        highlight: false },
                        { label: "Quota exceeded", val: quotaExceededCount, highlight: quotaExceededCount > 0 },
                    ].map((stat, i) => (
                        <div key={i} className={`rounded-card bg-card border p-6 shadow-card animate-entrance ${stat.highlight ? "border-amber-500" : "border-border"}`} style={{ animationDelay: `${i * 100}ms` }}>
                            <span className={`type-metadata font-black uppercase tracking-widest block mb-2 ${stat.highlight ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>{stat.label}</span>
                            <div className={`text-4xl font-black tracking-tighter ${stat.highlight ? "text-amber-600 dark:text-amber-400" : "text-foreground"}`}>{stat.val}</div>
                        </div>
                    ))}
                </div>
            </PageHeader>

            <div className="app-container">
                <Card className="rounded-card border-border bg-card shadow-card animate-entrance" style={{ animationDelay: '300ms' }}>
                    <CardHeader className="border-b border-border bg-muted/30 pb-4">
                        <div className="flex items-center justify-between gap-4 flex-wrap">
                            <CardTitle className="type-section-header">
                                All Scans
                                {(q || status) && (
                                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                                        {filteredCount} result{filteredCount !== 1 ? "s" : ""}
                                        {q ? ` for "${q}"` : ""}
                                    </span>
                                )}
                            </CardTitle>
                            <Suspense>
                                <JobsFilter />
                            </Suspense>
                        </div>
                    </CardHeader>

                    <CardContent className="p-0">
                        {jobs.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
                                <GitPullRequest className="h-10 w-10 opacity-20" />
                                <p className="font-bold text-sm">
                                    {q || status ? "No jobs match your filters" : "No jobs found"}
                                </p>
                                <p className="text-xs">
                                    {q || status
                                        ? "Try adjusting your search or status filter."
                                        : "Open a Pull Request in a connected repository to trigger the first scan."}
                                </p>
                            </div>
                        ) : (
                            <>
                                {/* Table */}
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b border-border text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                                                <th className="px-6 py-3 text-left">Repository / PR</th>
                                                <th className="px-4 py-3 text-right w-28">Age</th>
                                                <th className="px-4 py-3 text-center w-16">Score</th>
                                                <th className="px-4 py-3 text-center w-24">
                                                    <span className="inline-flex items-center gap-1">
                                                        Tier
                                                        <a
                                                            href="/docs/user-guide/drift-detection#job-history-status"
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            title="Tier vs Status — what these two columns mean together"
                                                            className="text-muted-foreground/50 hover:text-primary transition-colors"
                                                        >
                                                            <Info className="h-3 w-3" />
                                                        </a>
                                                    </span>
                                                </th>
                                                <th className="px-4 py-3 text-center w-28">Status</th>
                                                <th className="px-4 py-3 w-8" />
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border">
                                            {jobs.map((job) => {
                                                const result         = job.result as any
                                                const driftScore     = result?.drift_score as number | undefined
                                                const feedbackSignal = job.feedback?.[0]?.signal ?? null
                                                const repoFullName   = result?.repo_full_name as string | undefined
                                                const prUrl          = repoFullName
                                                    ? `https://github.com/${repoFullName}/pull/${job.prNumber}`
                                                    : undefined
                                                const uiStatus = getUiStatus({
                                                    status: job.status,
                                                    triageStatus: (job as any).triageStatus,
                                                    result: job.result as Record<string, unknown> | null,
                                                })

                                                const detailHref = `/dashboard/jobs/${job.id}`

                                                return (
                                                    <tr
                                                        key={job.id}
                                                        className="hover:bg-muted/30 transition-colors group"
                                                    >
                                                        {/* Repo + PR — repo name links to detail, PR# links to GitHub */}
                                                        <td className="px-6 py-0">
                                                            <div className="flex items-center gap-3 py-3">
                                                                <GitPullRequest className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                                                                <div className="min-w-0">
                                                                    <Link
                                                                        href={detailHref}
                                                                        className="font-semibold text-foreground truncate block max-w-[18rem] hover:underline"
                                                                    >
                                                                        {job.repository.name}
                                                                    </Link>
                                                                    {prUrl ? (
                                                                        <a
                                                                            href={prUrl}
                                                                            target="_blank"
                                                                            rel="noopener noreferrer"
                                                                            className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                                                                        >
                                                                            PR #{job.prNumber}
                                                                            <ExternalLink className="h-2.5 w-2.5" />
                                                                        </a>
                                                                    ) : (
                                                                        <span className="text-xs text-muted-foreground">PR #{job.prNumber}</span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </td>

                                                        {/* Age */}
                                                        <td className="px-0 py-0 text-right text-xs text-muted-foreground whitespace-nowrap">
                                                            <Link href={detailHref} className="block px-4 py-3">
                                                                {formatDistanceToNow(job.createdAt, { addSuffix: true })}
                                                            </Link>
                                                        </td>

                                                        {/* Score */}
                                                        <td className="px-0 py-0 text-center">
                                                            <Link href={detailHref} className="flex items-center justify-center px-4 py-3">
                                                                {driftScore !== undefined ? (
                                                                    <span className="text-base font-black tracking-tight text-foreground tabular-nums">
                                                                        {driftScore}
                                                                    </span>
                                                                ) : (
                                                                    <span className="text-muted-foreground/30">—</span>
                                                                )}
                                                            </Link>
                                                        </td>

                                                        {/* Tier */}
                                                        <td className="px-0 py-0 text-center">
                                                            <Link href={detailHref} className="flex items-center justify-center px-4 py-3">
                                                                {job.status === "COMPLETED"
                                                                    ? <TierBadge score={driftScore} />
                                                                    : <span className="text-muted-foreground/30">—</span>
                                                                }
                                                            </Link>
                                                        </td>

                                                        {/* Status */}
                                                        <td className="px-0 py-0 text-center">
                                                            <Link href={detailHref} className="flex items-center justify-center px-4 py-3">
                                                                <UiStatusBadge uiStatus={uiStatus} />
                                                            </Link>
                                                        </td>

                                                        {/* Feedback — intentionally not a row link; small icon only */}
                                                        <td className="px-4 py-3 text-center">
                                                            <FeedbackBadge signal={feedbackSignal} />
                                                        </td>
                                                    </tr>
                                                )
                                            })}
                                        </tbody>
                                    </table>
                                </div>

                                <Suspense>
                                    <TablePagination
                                        page={page}
                                        totalPages={totalPages}
                                        totalCount={filteredCount}
                                        pageSize={PAGE_SIZE}
                                    />
                                </Suspense>
                            </>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
