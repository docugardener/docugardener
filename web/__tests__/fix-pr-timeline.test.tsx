/**
 * Tests for the FixPrTimeline component and buildTimeline() helper.
 *
 * Coverage:
 *  F1  QUEUED job: only "Queued" step, all others pending
 *  F2  PROCESSING job: "Queued" + "Analyzing" done/active
 *  F3  COMPLETED, drift_score=0: ends at "No drift" — no fix PR steps
 *  F4  COMPLETED, drift_score>0, auto_fix_enqueued: "Generating fix PR" step active
 *  F5  COMPLETED, drift_score>0, no auto_fix, PENDING triage: "Awaiting review" step
 *  F6  FIX_PR_OPEN: "Fix PR created" step done with link, "Waiting for merge" active
 *  F7  RESOLVED with fix_pr_merged_at: all 5 steps done including "Fix PR merged" + timestamp
 *  F8  RESOLVED without fix_pr_merged_at: "Fix PR merged" done but no timestamp shown
 *  F9  IGNORED (dismissed): ends at "Dismissed" step with reason
 *  F10 fix PR link renders as anchor tag pointing to fixPrUrl
 */

import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { buildTimeline, FixPrTimeline, type TimelineJob } from "@/components/jobs/FixPrTimeline"

vi.mock("lucide-react", () => ({
    CheckCircle2: ({ className }: any) => <span data-icon="check" className={className} />,
    Circle: ({ className }: any) => <span data-icon="circle" className={className} />,
    Loader2: ({ className }: any) => <span data-icon="loader" className={className} />,
    GitPullRequest: ({ className }: any) => <span data-icon="git-pr" className={className} />,
    XCircle: ({ className }: any) => <span data-icon="x-circle" className={className} />,
    ExternalLink: ({ className }: any) => <span data-icon="ext" className={className} />,
}))

function job(overrides: Partial<TimelineJob> = {}): TimelineJob {
    return {
        id: "job-1",
        status: "COMPLETED",
        triageStatus: "PENDING",
        createdAt: new Date("2026-03-31T12:00:00Z"),
        completedAt: new Date("2026-03-31T12:01:00Z"),
        result: { drift_score: 75 },
        ...overrides,
    }
}

// ── buildTimeline() unit tests ────────────────────────────────────────────────

describe("buildTimeline()", () => {
    it("F1 — QUEUED: Queued is done, Analyzing is pending", () => {
        const steps = buildTimeline(job({ status: "QUEUED", triageStatus: "PENDING", result: {} }))
        const queued = steps.find(s => s.id === "queued")
        const analyzing = steps.find(s => s.id === "analyzing")
        expect(queued?.status).toBe("done")
        expect(analyzing?.status).toBe("pending")
    })

    it("F2 — PROCESSING: Queued done, Analyzing active", () => {
        const steps = buildTimeline(job({ status: "PROCESSING", triageStatus: "PENDING", result: {} }))
        expect(steps.find(s => s.id === "queued")?.status).toBe("done")
        expect(steps.find(s => s.id === "analyzing")?.status).toBe("active")
    })

    it("F3 — drift_score=0: ends after analysis step, no fix PR steps", () => {
        const steps = buildTimeline(job({ result: { drift_score: 0 } }))
        expect(steps.find(s => s.id === "analysis")?.status).toBe("done")
        expect(steps.find(s => s.id === "fix_pr")).toBeUndefined()
        expect(steps.find(s => s.id === "merged")).toBeUndefined()
    })

    it("F4 — auto_fix_enqueued: fix_pr step is active (generating)", () => {
        const steps = buildTimeline(job({
            result: { drift_score: 80, auto_fix_enqueued: true },
        }))
        const fixStep = steps.find(s => s.id === "fix_pr")
        expect(fixStep).toBeDefined()
        expect(fixStep?.status).toBe("active")
        expect(fixStep?.label).toMatch(/generating|fix pr/i)
    })

    it("F5 — NEEDS_REVIEW (no auto_fix): awaiting review step active", () => {
        const steps = buildTimeline(job({
            result: { drift_score: 75 },
            triageStatus: "PENDING",
        }))
        const fixStep = steps.find(s => s.id === "fix_pr")
        expect(fixStep?.status).toBe("active")
        expect(fixStep?.label).toMatch(/review/i)
    })

    it("F6 — FIX_PR_OPEN: fix_pr done with link, merged step active", () => {
        const steps = buildTimeline(job({
            status: "COMPLETED",
            triageStatus: "FIX_PR_OPEN",
            result: { drift_score: 80, fixPrUrl: "https://github.com/org/repo/pull/5" },
        }))
        const fixStep = steps.find(s => s.id === "fix_pr")
        const mergeStep = steps.find(s => s.id === "merged")
        expect(fixStep?.status).toBe("done")
        expect(fixStep?.link).toBe("https://github.com/org/repo/pull/5")
        expect(mergeStep?.status).toBe("active")
    })

    it("F7 — RESOLVED + fix_pr_merged_at: all steps done, merged has timestamp", () => {
        const steps = buildTimeline(job({
            triageStatus: "RESOLVED",
            result: {
                drift_score: 80,
                fixPrUrl: "https://github.com/org/repo/pull/5",
                fix_pr_merged_at: "2026-03-31T12:05:00Z",
            },
        }))
        expect(steps.find(s => s.id === "merged")?.status).toBe("done")
        expect(steps.find(s => s.id === "merged")?.timestamp).toEqual(new Date("2026-03-31T12:05:00Z"))
    })

    it("F8 — RESOLVED without fix_pr_merged_at: merged step done, no timestamp", () => {
        const steps = buildTimeline(job({
            triageStatus: "RESOLVED",
            result: { drift_score: 80, fixPrUrl: "https://github.com/org/repo/pull/5" },
        }))
        const mergeStep = steps.find(s => s.id === "merged")
        expect(mergeStep?.status).toBe("done")
        expect(mergeStep?.timestamp).toBeUndefined()
    })

    it("F9 — IGNORED: ends at dismissed step with reason", () => {
        const steps = buildTimeline(job({
            triageStatus: "IGNORED",
            result: { drift_score: 75, dismiss_reason: "Not applicable" },
        }))
        const dismissed = steps.find(s => s.id === "resolution")
        expect(dismissed?.status).toBe("done")
        expect(dismissed?.label).toMatch(/dismiss/i)
        expect(dismissed?.detail).toBe("Not applicable")
    })
})

// ── FixPrTimeline component rendering tests ───────────────────────────────────

describe("FixPrTimeline component", () => {
    it("F10 — fix PR link renders as anchor pointing to fixPrUrl", () => {
        const fixUrl = "https://github.com/org/repo/pull/5"
        render(<FixPrTimeline job={job({
            triageStatus: "FIX_PR_OPEN",
            result: { drift_score: 80, fixPrUrl: fixUrl },
        })} />)
        const link = screen.getByRole("link")
        expect(link.getAttribute("href")).toBe(fixUrl)
    })

    it("renders all step labels for a fully resolved AI-author job", () => {
        render(<FixPrTimeline job={job({
            triageStatus: "RESOLVED",
            result: {
                drift_score: 80,
                fixPrUrl: "https://github.com/org/repo/pull/5",
                fix_pr_merged_at: "2026-03-31T12:05:00Z",
            },
        })} />)
        expect(screen.getByText(/queued/i)).toBeTruthy()
        expect(screen.getByText(/analyz/i)).toBeTruthy()
        expect(screen.getByText(/drift/i)).toBeTruthy()
        expect(screen.getAllByText(/fix pr/i).length).toBeGreaterThan(0)
        expect(screen.getByText(/merged/i)).toBeTruthy()
    })
})
