// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from "vitest"
import { buildTimeline, type TimelineJob } from "@/components/jobs/FixPrTimeline"

function makeJob(result: Record<string, unknown> = {}): TimelineJob {
    return {
        id: "j1",
        status: "COMPLETED",
        triageStatus: "RESOLVED",
        // drift_score > 0 required to reach the RESOLVED branch in buildTimeline
        result: { drift_score: 80, fixPrUrl: "https://github.com/org/repo/pull/5", ...result },
        createdAt: new Date(),
    }
}

describe("buildTimeline — resolution_actor", () => {
    it("shows Auto-resolved and AI Author Mode detail when resolution_actor=ai_auto", () => {
        const job = makeJob({
            resolution_actor: "ai_auto",
            fix_pr_merged_at: new Date().toISOString(),
        })
        const steps = buildTimeline(job)
        const mergedStep = steps.find((s) => s.id === "merged")
        expect(mergedStep).toBeDefined()
        expect(mergedStep!.label).toBe("Auto-resolved")
        expect(mergedStep!.detail).toContain("AI Author Mode")
    })

    it("shows Fix PR merged when resolution_actor=human", () => {
        const job = makeJob({
            resolution_actor: "human",
            fix_pr_merged_at: new Date().toISOString(),
        })
        const steps = buildTimeline(job)
        const mergedStep = steps.find((s) => s.id === "merged")
        expect(mergedStep).toBeDefined()
        expect(mergedStep!.label).toBe("Fix PR merged")
    })

    it("gracefully falls back to Fix PR merged when resolution_actor is absent", () => {
        const job = makeJob({ fix_pr_merged_at: new Date().toISOString() })
        const steps = buildTimeline(job)
        const mergedStep = steps.find((s) => s.id === "merged")
        expect(mergedStep).toBeDefined()
        expect(mergedStep!.label).toBe("Fix PR merged")
    })
})
