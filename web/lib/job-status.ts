// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Single source-of-truth for user-visible job state.
 *
 * Both the Inbox and the Jobs page derive their status display from this
 * function so they always agree on what a job means to the user.
 *
 * State machine:
 *   jobStatus:    QUEUED → PROCESSING → COMPLETED | FAILED | QUOTA_EXCEEDED
 *   triageStatus: PENDING → ACCEPTED → FIX_PR_OPEN → RESOLVED
 *                         → IGNORED  (dismissed)
 *
 * UiStatus priority (highest first):
 *   FAILED / QUOTA_EXCEEDED  — terminal error states (override everything)
 *   DISMISSED                — user dismissed (triageStatus=IGNORED)
 *   RESOLVED                 — fix PR merged (terminal success)
 *   FIX_PR_OPEN              — fix PR created, awaiting merge
 *   AI_FIXING                — fix job enqueued (ACCEPTED) or auto_fix_enqueued=true
 *   QUEUED                   — job not yet picked up by worker
 *   ANALYZING                — LLM analysis running
 *   NO_DRIFT                 — analysis complete, drift_score=0
 *   NEEDS_REVIEW             — analysis complete, drift found, user action required
 */

export type UiStatus =
    | "QUEUED"
    | "ANALYZING"
    | "NEEDS_REVIEW"
    | "AI_FIXING"
    | "FIX_PR_OPEN"
    | "RESOLVED"
    | "DISMISSED"
    | "NO_DRIFT"
    | "FAILED"
    | "QUOTA_EXCEEDED"

export interface JobLike {
    status: string
    triageStatus?: string | null
    result?: Record<string, unknown> | null
}

export function getUiStatus(job: JobLike): UiStatus {
    // Error terminals take precedence over everything
    if (job.status === "FAILED") return "FAILED"
    if (job.status === "QUOTA_EXCEEDED") return "QUOTA_EXCEEDED"

    // Triage-based terminal / in-flight states
    if (job.triageStatus === "IGNORED") return "DISMISSED"
    if (job.triageStatus === "RESOLVED") return "RESOLVED"
    if (job.triageStatus === "FIX_PR_OPEN") return "FIX_PR_OPEN"
    // ACCEPTED means user clicked "Accept Changes" and fix job was queued
    if (job.triageStatus === "ACCEPTED") return "AI_FIXING"

    // triageStatus is PENDING — derive from jobStatus + result
    if (job.status === "QUEUED") return "QUEUED"
    if (job.status === "PROCESSING") return "ANALYZING"

    // COMPLETED — differentiate based on result
    const result = job.result ?? {}
    if (result.auto_fix_enqueued) return "AI_FIXING"
    if ((result.drift_score as number | undefined ?? 0) === 0) return "NO_DRIFT"
    return "NEEDS_REVIEW"
}

/** Human-readable label for each UiStatus. */
export const UI_STATUS_LABEL: Record<UiStatus, string> = {
    QUEUED: "Queued",
    ANALYZING: "Analyzing…",
    NEEDS_REVIEW: "Review required",
    AI_FIXING: "AI fixing…",
    FIX_PR_OPEN: "Fix PR open",
    RESOLVED: "Resolved",
    DISMISSED: "Dismissed",
    NO_DRIFT: "No drift",
    FAILED: "Failed",
    QUOTA_EXCEEDED: "Quota exceeded",
}

/** True when the job is actively being worked on by the system. */
export function isInFlight(status: UiStatus): boolean {
    return status === "QUEUED" || status === "ANALYZING" || status === "AI_FIXING"
}

/** True when the job needs a human action. */
export function needsHumanAction(status: UiStatus): boolean {
    return status === "NEEDS_REVIEW"
}
