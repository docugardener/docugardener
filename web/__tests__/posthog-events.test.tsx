// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// vi.mock is hoisted — factory must not reference outer variables
vi.mock("posthog-js", () => ({
    default: {
        init: vi.fn(),
        capture: vi.fn(),
    },
}))

// Import posthog after the mock so we get the mocked instance
import posthog from "posthog-js"
import {
    captureEvent,
    captureOnce,
    Analytics,
} from "@/lib/posthog"

// Typed references to the mock fns
const mockCapture = vi.mocked(posthog.capture)
const mockInit = vi.mocked(posthog.init)

describe("PostHog analytics lib", () => {
    beforeEach(() => {
        mockCapture.mockClear()
        mockInit.mockClear()
        localStorage.clear()
    })

    afterEach(() => {
        vi.unstubAllEnvs()
    })

    // ── captureEvent ──────────────────────────────────────────────────────────

    it("captureEvent() is a no-op when NEXT_PUBLIC_POSTHOG_KEY is not set", () => {
        vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "")
        captureEvent("test_event")
        expect(mockCapture).not.toHaveBeenCalled()
    })

    it("captureEvent() calls posthog.capture() when NEXT_PUBLIC_POSTHOG_KEY is set", () => {
        vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test_key")
        captureEvent("test_event", { foo: "bar" })
        expect(mockCapture).toHaveBeenCalledOnce()
        expect(mockCapture).toHaveBeenCalledWith("test_event", { foo: "bar" })
    })

    it("captureEvent() passes undefined properties correctly", () => {
        vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test_key")
        captureEvent("naked_event")
        expect(mockCapture).toHaveBeenCalledWith("naked_event", undefined)
    })

    // ── captureOnce ───────────────────────────────────────────────────────────

    it("captureOnce() fires the first time for a given event name", () => {
        vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test_key")
        captureOnce("milestone_event")
        expect(mockCapture).toHaveBeenCalledOnce()
        expect(mockCapture).toHaveBeenCalledWith("milestone_event", undefined)
    })

    it("captureOnce() does NOT fire a second time for the same event (localStorage guard)", () => {
        vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test_key")
        captureOnce("dedup_event")
        captureOnce("dedup_event")
        captureOnce("dedup_event")
        expect(mockCapture).toHaveBeenCalledOnce()
    })

    it("captureOnce() fires again after localStorage entry is cleared", () => {
        vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test_key")
        captureOnce("reset_event")
        expect(mockCapture).toHaveBeenCalledOnce()

        localStorage.removeItem("dg_fired_reset_event")
        mockCapture.mockClear()

        captureOnce("reset_event")
        expect(mockCapture).toHaveBeenCalledOnce()
    })

    it("captureOnce() is independent per event name", () => {
        vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test_key")
        captureOnce("event_a")
        captureOnce("event_b")
        captureOnce("event_a") // duplicate — should not fire
        expect(mockCapture).toHaveBeenCalledTimes(2)
    })

    it("captureOnce() is still a no-op when key is unset", () => {
        vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "")
        captureOnce("should_not_fire")
        expect(mockCapture).not.toHaveBeenCalled()
    })

    // ── Named event helpers ────────────────────────────────────────────────────

    it("Analytics.installStarted() calls captureEvent('install_started')", () => {
        vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test_key")
        Analytics.installStarted({ source: "auto" })
        expect(mockCapture).toHaveBeenCalledWith("install_started", { source: "auto" })
    })

    it("Analytics.installCompleted() calls captureEvent('install_completed')", () => {
        vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test_key")
        Analytics.installCompleted()
        expect(mockCapture).toHaveBeenCalledWith("install_completed", undefined)
    })

    it("Analytics.firstAnalysisTriggered() calls captureOnce('first_analysis_triggered')", () => {
        vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test_key")
        Analytics.firstAnalysisTriggered()
        Analytics.firstAnalysisTriggered() // second call must be deduped
        expect(mockCapture).toHaveBeenCalledOnce()
        expect(mockCapture).toHaveBeenCalledWith("first_analysis_triggered", undefined)
    })

    it("Analytics.firstDriftDetected() calls captureOnce('first_drift_detected')", () => {
        vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test_key")
        Analytics.firstDriftDetected({ repo: "acme/api" })
        Analytics.firstDriftDetected() // deduped
        expect(mockCapture).toHaveBeenCalledOnce()
        expect(mockCapture).toHaveBeenCalledWith("first_drift_detected", { repo: "acme/api" })
    })

    it("Analytics.repoLimitHit() calls captureEvent('repo_limit_hit')", () => {
        vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test_key")
        Analytics.repoLimitHit({ plan: "FREE", limit: 1 })
        expect(mockCapture).toHaveBeenCalledWith("repo_limit_hit", { plan: "FREE", limit: 1 })
    })

    it("Analytics.upgradePromptShown() calls captureEvent('upgrade_prompt_shown')", () => {
        vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test_key")
        Analytics.upgradePromptShown({ feature: "private_repos" })
        expect(mockCapture).toHaveBeenCalledWith("upgrade_prompt_shown", { feature: "private_repos" })
    })

    it("Analytics.upgradeClicked() calls captureEvent('upgrade_clicked')", () => {
        vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test_key")
        Analytics.upgradeClicked({ from_page: "/dashboard/billing" })
        expect(mockCapture).toHaveBeenCalledWith("upgrade_clicked", { from_page: "/dashboard/billing" })
    })

    it("Analytics.subscriptionStarted() calls captureEvent('subscription_started')", () => {
        vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test_key")
        Analytics.subscriptionStarted({ plan: "pro" })
        expect(mockCapture).toHaveBeenCalledWith("subscription_started", { plan: "pro" })
    })

    it("Analytics.firstFixPrMerged() calls captureOnce('first_fix_pr_merged')", () => {
        vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test_key")
        Analytics.firstFixPrMerged()
        Analytics.firstFixPrMerged() // deduped
        expect(mockCapture).toHaveBeenCalledOnce()
        expect(mockCapture).toHaveBeenCalledWith("first_fix_pr_merged", undefined)
    })
})
