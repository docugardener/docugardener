// SPDX-License-Identifier: AGPL-3.0-or-later
import posthog from "posthog-js"

export function initPostHog() {
    if (typeof window === "undefined") return
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
    if (!key) return
    posthog.init(key, {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com",
        capture_pageview: false, // manual pageview control
        persistence: "localStorage+cookie",
    })
}

export function captureEvent(event: string, properties?: Record<string, unknown>) {
    if (typeof window === "undefined") return
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return
    posthog.capture(event, properties)
}

/** Fire event only once per browser (localStorage dedup). For "first_X" milestones. */
export function captureOnce(event: string, properties?: Record<string, unknown>) {
    if (typeof window === "undefined") return
    const key = `dg_fired_${event}`
    if (localStorage.getItem(key)) return
    localStorage.setItem(key, "1")
    captureEvent(event, properties)
}

// ── Named event helpers ────────────────────────────────────────────────────

export const Analytics = {
    installStarted:         (p?: Record<string, unknown>) => captureEvent("install_started", p),
    installCompleted:       (p?: Record<string, unknown>) => captureEvent("install_completed", p),
    firstAnalysisTriggered: (p?: Record<string, unknown>) => captureOnce("first_analysis_triggered", p),
    firstDriftDetected:     (p?: Record<string, unknown>) => captureOnce("first_drift_detected", p),
    repoLimitHit:           (p?: Record<string, unknown>) => captureEvent("repo_limit_hit", p),
    upgradePromptShown:     (p?: Record<string, unknown>) => captureEvent("upgrade_prompt_shown", p),
    upgradeClicked:         (p?: Record<string, unknown>) => captureEvent("upgrade_clicked", p),
    subscriptionStarted:    (p?: Record<string, unknown>) => captureEvent("subscription_started", p),
    /**
     * first_fix_pr_merged is best fired server-side the moment the fix PR is
     * auto-merged.  The Python handler already logs "fix PR auto-merged" in
     * src/pipeline/handler.py (search for "fix PR merged").
     * TODO: fire this via PostHog's Python SDK in src/pipeline/handler.py once
     * the posthog Python SDK is added to pyproject.toml (EPIC-02 follow-up).
     */
    firstFixPrMerged:       (p?: Record<string, unknown>) => captureOnce("first_fix_pr_merged", p),
} as const
