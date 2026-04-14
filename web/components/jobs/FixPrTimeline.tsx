"use client"

import { CheckCircle2, Circle, Loader2, GitPullRequest, XCircle, ExternalLink } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { cn } from "@/lib/utils"
import { getUiStatus } from "@/lib/job-status"

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TimelineJob {
    id: string
    status: string
    triageStatus?: string | null
    createdAt: Date
    completedAt?: Date | null
    result?: Record<string, unknown> | null
}

export type TimelineStepStatus = "done" | "active" | "pending" | "skipped"

export interface TimelineStep {
    id: string
    label: string
    status: TimelineStepStatus
    timestamp?: Date
    detail?: string
    link?: string
}

// ── buildTimeline() ───────────────────────────────────────────────────────────

/**
 * Derives the ordered list of timeline steps from the job's current state.
 * Exported for unit testing.
 */
export function buildTimeline(job: TimelineJob): TimelineStep[] {
    const steps: TimelineStep[] = []
    const result = (job.result ?? {}) as Record<string, unknown>
    const uiStatus = getUiStatus({
        status: job.status,
        triageStatus: job.triageStatus,
        result,
    })

    // Step 1: Queued
    steps.push({
        id: "queued",
        label: "Queued",
        timestamp: job.createdAt,
        status: "done",
    })

    // Step 2: Analyzing
    if (uiStatus === "QUEUED") {
        steps.push({ id: "analyzing", label: "Analyzing", status: "pending" })
        return steps
    }
    steps.push({
        id: "analyzing",
        label: "Analyzing",
        status: uiStatus === "ANALYZING" ? "active" : "done",
    })
    if (uiStatus === "ANALYZING") return steps

    // Step 3: Analysis result
    const driftScore = result.drift_score as number | undefined ?? 0
    if (driftScore === 0) {
        steps.push({
            id: "analysis",
            label: "No drift detected",
            timestamp: job.completedAt ?? undefined,
            status: "done",
        })
        return steps
    }

    steps.push({
        id: "analysis",
        label: `Drift detected — score ${driftScore}`,
        timestamp: job.completedAt ?? undefined,
        status: "done",
    })

    // Short-circuit: dismissed
    if (uiStatus === "DISMISSED") {
        steps.push({
            id: "resolution",
            label: "Dismissed",
            status: "done",
            detail: result.dismiss_reason as string | undefined,
        })
        return steps
    }

    // Step 4: Fix PR
    const fixPrUrl = result.fixPrUrl as string | undefined

    if (uiStatus === "AI_FIXING") {
        steps.push({
            id: "fix_pr",
            label: "Generating fix PR…",
            status: "active",
        })
        return steps
    }

    if (uiStatus === "NEEDS_REVIEW") {
        steps.push({
            id: "fix_pr",
            label: "Awaiting review",
            status: "active",
        })
        return steps
    }

    // FIX_PR_OPEN or RESOLVED: fix PR exists
    if (fixPrUrl) {
        const prNum = fixPrUrl.split("/").pop()
        steps.push({
            id: "fix_pr",
            label: `Fix PR created${prNum ? ` #${prNum}` : ""}`,
            status: "done",
            link: fixPrUrl,
        })

        // Step 5: Merge
        if (uiStatus === "FIX_PR_OPEN") {
            steps.push({
                id: "merged",
                label: "Waiting for merge…",
                status: "active",
            })
        } else if (uiStatus === "RESOLVED") {
            const mergedAtStr = result.fix_pr_merged_at as string | undefined
            steps.push({
                id: "merged",
                label: "Fix PR merged",
                status: "done",
                timestamp: mergedAtStr ? new Date(mergedAtStr) : undefined,
            })
        }
    }

    return steps
}

// ── FixPrTimeline component ───────────────────────────────────────────────────

interface FixPrTimelineProps {
    job: TimelineJob
}

export function FixPrTimeline({ job }: FixPrTimelineProps) {
    const steps = buildTimeline(job)

    return (
        <div className="space-y-0">
            {steps.map((step, idx) => (
                <TimelineRow
                    key={step.id}
                    step={step}
                    isLast={idx === steps.length - 1}
                />
            ))}
        </div>
    )
}

function TimelineRow({ step, isLast }: { step: TimelineStep; isLast: boolean }) {
    return (
        <div className="flex gap-3">
            {/* Icon + connector line */}
            <div className="flex flex-col items-center">
                <StepIcon status={step.status} />
                {!isLast && (
                    <div className={cn(
                        "w-px flex-1 mt-1",
                        step.status === "done" ? "bg-emerald-500/40" : "bg-border"
                    )} />
                )}
            </div>

            {/* Content */}
            <div className={cn(
                "pb-4 min-w-0",
                isLast ? "pb-0" : ""
            )}>
                <div className="flex items-center gap-2 flex-wrap">
                    <span className={cn(
                        "text-xs font-semibold",
                        step.status === "done" ? "text-foreground" :
                        step.status === "active" ? "text-primary" :
                        "text-muted-foreground"
                    )}>
                        {step.label}
                    </span>
                    {step.link && (
                        <a
                            href={step.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-0.5 text-[10px] font-mono text-primary hover:underline"
                        >
                            {step.link.includes("/pull/") && (
                                <>
                                    <GitPullRequest className="w-2.5 h-2.5" />
                                    #{step.link.split("/pull/")[1]}
                                </>
                            )}
                            <ExternalLink className="w-2.5 h-2.5 ml-0.5" />
                        </a>
                    )}
                    {step.timestamp && (
                        <span className="text-[10px] text-muted-foreground">
                            {formatDistanceToNow(step.timestamp, { addSuffix: true })}
                        </span>
                    )}
                </div>
                {step.detail && (
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                        {step.detail}
                    </p>
                )}
            </div>
        </div>
    )
}

function StepIcon({ status }: { status: TimelineStepStatus }) {
    if (status === "done") return (
        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
    )
    if (status === "active") return (
        <Loader2 className="w-4 h-4 text-primary animate-spin shrink-0 mt-0.5" />
    )
    return (
        <Circle className="w-4 h-4 text-muted-foreground/40 shrink-0 mt-0.5" />
    )
}
