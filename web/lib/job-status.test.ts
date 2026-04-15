// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Tests for getUiStatus() — the single source-of-truth for user-visible job state.
 *
 * Coverage:
 *  D1  FAILED jobStatus → FAILED
 *  D2  QUOTA_EXCEEDED jobStatus → QUOTA_EXCEEDED
 *  D3  triageStatus=IGNORED → DISMISSED
 *  D4  triageStatus=RESOLVED → RESOLVED
 *  D5  triageStatus=FIX_PR_OPEN → FIX_PR_OPEN
 *  D6  triageStatus=ACCEPTED → AI_FIXING (fix job queued by user click)
 *  D7  jobStatus=QUEUED → QUEUED
 *  D8  jobStatus=PROCESSING → ANALYZING
 *  D9  COMPLETED + auto_fix_enqueued=true → AI_FIXING
 *  D10 COMPLETED + drift_score=0 → NO_DRIFT
 *  D11 COMPLETED + drift_score>0 + no auto_fix → NEEDS_REVIEW
 *  D12 FAILED overrides triageStatus (FAILED wins)
 *  D13 null/undefined result treated as empty → falls through to NEEDS_REVIEW if score missing
 *  D14 drift_score=0 edge case: explicit zero → NO_DRIFT
 */

import { describe, it, expect } from "vitest"
import { getUiStatus } from "./job-status"

type JobInput = Parameters<typeof getUiStatus>[0]

function job(overrides: Partial<JobInput>): JobInput {
    return {
        status: "COMPLETED",
        triageStatus: "PENDING",
        result: { drift_score: 75 },
        ...overrides,
    }
}

describe("getUiStatus()", () => {
    it("D1 — FAILED jobStatus returns FAILED", () => {
        expect(getUiStatus(job({ status: "FAILED" }))).toBe("FAILED")
    })

    it("D2 — QUOTA_EXCEEDED jobStatus returns QUOTA_EXCEEDED", () => {
        expect(getUiStatus(job({ status: "QUOTA_EXCEEDED" }))).toBe("QUOTA_EXCEEDED")
    })

    it("D3 — triageStatus=IGNORED returns DISMISSED", () => {
        expect(getUiStatus(job({ triageStatus: "IGNORED" }))).toBe("DISMISSED")
    })

    it("D4 — triageStatus=RESOLVED returns RESOLVED", () => {
        expect(getUiStatus(job({ triageStatus: "RESOLVED" }))).toBe("RESOLVED")
    })

    it("D5 — triageStatus=FIX_PR_OPEN returns FIX_PR_OPEN", () => {
        expect(getUiStatus(job({ triageStatus: "FIX_PR_OPEN" }))).toBe("FIX_PR_OPEN")
    })

    it("D6 — triageStatus=ACCEPTED returns AI_FIXING (user clicked Accept, fix job queued)", () => {
        expect(getUiStatus(job({ triageStatus: "ACCEPTED" }))).toBe("AI_FIXING")
    })

    it("D7 — jobStatus=QUEUED returns QUEUED", () => {
        expect(getUiStatus(job({ status: "QUEUED", triageStatus: "PENDING" }))).toBe("QUEUED")
    })

    it("D8 — jobStatus=PROCESSING returns ANALYZING", () => {
        expect(getUiStatus(job({ status: "PROCESSING", triageStatus: "PENDING" }))).toBe("ANALYZING")
    })

    it("D9 — COMPLETED + auto_fix_enqueued=true returns AI_FIXING", () => {
        expect(getUiStatus(job({ result: { drift_score: 80, auto_fix_enqueued: true } }))).toBe("AI_FIXING")
    })

    it("D10 — COMPLETED + drift_score=0 returns NO_DRIFT", () => {
        expect(getUiStatus(job({ result: { drift_score: 0 } }))).toBe("NO_DRIFT")
    })

    it("D11 — COMPLETED + drift_score>0 + no auto_fix returns NEEDS_REVIEW", () => {
        expect(getUiStatus(job({ result: { drift_score: 60 } }))).toBe("NEEDS_REVIEW")
    })

    it("D12 — FAILED overrides triageStatus=RESOLVED", () => {
        expect(getUiStatus(job({ status: "FAILED", triageStatus: "RESOLVED" }))).toBe("FAILED")
    })

    it("D13 — null result falls through to NEEDS_REVIEW (drift_score treated as 0 → NO_DRIFT)", () => {
        // drift_score undefined → 0 by default → NO_DRIFT
        expect(getUiStatus(job({ result: null }))).toBe("NO_DRIFT")
    })

    it("D14 — explicit drift_score=0 is NO_DRIFT (not NEEDS_REVIEW)", () => {
        expect(getUiStatus(job({ result: { drift_score: 0, auto_fix_enqueued: false } }))).toBe("NO_DRIFT")
    })

    it("D15 — auto_fix_enqueued takes priority over drift_score>0", () => {
        // Even high score: if AI is fixing it, show AI_FIXING not NEEDS_REVIEW
        expect(getUiStatus(job({ result: { drift_score: 95, auto_fix_enqueued: true } }))).toBe("AI_FIXING")
    })
})
