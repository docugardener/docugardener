/**
 * FEED-01: Analysis Feedback Signal — frontend tests.
 *
 * Tests:
 *  - False-positive rate KPI computation (mirrors getProofPoints())
 *  - Feedback badge display logic (mirrors FeedbackBadge in jobs/page.tsx)
 *  - HMAC token verification logic (mirrors /api/feedback/route.ts)
 *  - URL query parameter extraction and validation
 */

import { describe, it, expect } from "vitest"
import { createHmac, timingSafeEqual } from "crypto"

// ---------------------------------------------------------------------------
// Mirror the HMAC helpers from /api/feedback/route.ts
// ---------------------------------------------------------------------------

function makeToken(secret: string, jobId: string, tenantId: string): string {
    const mac = createHmac("sha256", secret)
    mac.update(`${jobId}:${tenantId}`)
    return mac.digest("hex").slice(0, 24)
}

function verifyToken(secret: string, jobId: string, tenantId: string, token: string): boolean {
    if (!secret || token.length !== 24) return false
    const expected = makeToken(secret, jobId, tenantId)
    return timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(token, "utf8"))
}

// ---------------------------------------------------------------------------
// Helper: compute false-positive rate the same way getProofPoints() does
// ---------------------------------------------------------------------------

function computeFalsePositiveRate(
    total: number,
    down: number
): number | null {
    if (total === 0) return null
    return Math.round((down / total) * 100)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("FEED-01 — false-positive rate computation", () => {
    it("returns null when no feedback signals exist", () => {
        expect(computeFalsePositiveRate(0, 0)).toBeNull()
    })

    it("returns 0% when all signals are thumbs-up", () => {
        expect(computeFalsePositiveRate(10, 0)).toBe(0)
    })

    it("returns 100% when all signals are thumbs-down", () => {
        expect(computeFalsePositiveRate(5, 5)).toBe(100)
    })

    it("rounds to nearest integer", () => {
        // 1/3 ≈ 33.3% → rounds to 33
        expect(computeFalsePositiveRate(3, 1)).toBe(33)
    })

    it("returns 50% for equal split", () => {
        expect(computeFalsePositiveRate(8, 4)).toBe(50)
    })

    it("threshold check: 15% is considered green (low false-positive rate)", () => {
        const rate = computeFalsePositiveRate(20, 3) // 15%
        expect(rate).toBe(15)
        expect(rate! <= 15).toBe(true)
    })

    it("threshold check: 16% is amber (above threshold)", () => {
        const rate = computeFalsePositiveRate(25, 4) // 16%
        expect(rate).toBe(16)
        expect(rate! <= 15).toBe(false)
    })
})

describe("FEED-01 — feedback badge display logic", () => {
    /**
     * Mirror the FeedbackBadge display logic from jobs/page.tsx:
     * null → hidden, "up" → thumbs-up, "down" → thumbs-down
     */
    function getBadgeState(signal: string | null | undefined): "hidden" | "up" | "down" {
        if (!signal) return "hidden"
        if (signal === "up") return "up"
        return "down"
    }

    it("shows nothing when no feedback signal", () => {
        expect(getBadgeState(null)).toBe("hidden")
        expect(getBadgeState(undefined)).toBe("hidden")
    })

    it("shows thumbs-up for 'up' signal", () => {
        expect(getBadgeState("up")).toBe("up")
    })

    it("shows thumbs-down for 'down' signal", () => {
        expect(getBadgeState("down")).toBe("down")
    })
})

// ---------------------------------------------------------------------------
// Tests: HMAC token generation and verification
// ---------------------------------------------------------------------------

describe("FEED-01 — HMAC token verification", () => {
    const SECRET = "test-secret-32-chars-long-enough!"
    const JOB_ID = "clx1234567890"
    const TENANT_ID = "clx9876543210"

    it("generates a 24-character hex token", () => {
        const token = makeToken(SECRET, JOB_ID, TENANT_ID)
        expect(token).toHaveLength(24)
        expect(/^[0-9a-f]+$/.test(token)).toBe(true)
    })

    it("verifies a valid token", () => {
        const token = makeToken(SECRET, JOB_ID, TENANT_ID)
        expect(verifyToken(SECRET, JOB_ID, TENANT_ID, token)).toBe(true)
    })

    it("rejects a tampered token", () => {
        const token = makeToken(SECRET, JOB_ID, TENANT_ID)
        const tampered = token.slice(0, 23) + (token[23] === "a" ? "b" : "a")
        expect(verifyToken(SECRET, JOB_ID, TENANT_ID, tampered)).toBe(false)
    })

    it("rejects token with wrong job ID", () => {
        const token = makeToken(SECRET, JOB_ID, TENANT_ID)
        expect(verifyToken(SECRET, "different-job-id", TENANT_ID, token)).toBe(false)
    })

    it("rejects token with wrong tenant ID", () => {
        const token = makeToken(SECRET, JOB_ID, TENANT_ID)
        expect(verifyToken(SECRET, JOB_ID, "different-tenant", token)).toBe(false)
    })

    it("rejects when secret is empty", () => {
        const token = makeToken(SECRET, JOB_ID, TENANT_ID)
        expect(verifyToken("", JOB_ID, TENANT_ID, token)).toBe(false)
    })

    it("rejects tokens shorter than 24 chars", () => {
        expect(verifyToken(SECRET, JOB_ID, TENANT_ID, "short")).toBe(false)
    })

    it("different jobs produce different tokens", () => {
        const t1 = makeToken(SECRET, "job-a", TENANT_ID)
        const t2 = makeToken(SECRET, "job-b", TENANT_ID)
        expect(t1).not.toBe(t2)
    })

    it("is deterministic — same inputs always produce same token", () => {
        const t1 = makeToken(SECRET, JOB_ID, TENANT_ID)
        const t2 = makeToken(SECRET, JOB_ID, TENANT_ID)
        expect(t1).toBe(t2)
    })
})

// ---------------------------------------------------------------------------
// Tests: query param validation
// ---------------------------------------------------------------------------

describe("FEED-01 — signal validation", () => {
    const VALID_SIGNALS = ["up", "down"]

    it("'up' is a valid signal", () => {
        expect(VALID_SIGNALS.includes("up")).toBe(true)
    })

    it("'down' is a valid signal", () => {
        expect(VALID_SIGNALS.includes("down")).toBe(true)
    })

    it("'maybe' is not a valid signal", () => {
        expect(VALID_SIGNALS.includes("maybe")).toBe(false)
    })

    it("empty string is not a valid signal", () => {
        expect(VALID_SIGNALS.includes("")).toBe(false)
    })

    it("null/undefined coerced to empty string is not valid", () => {
        expect(VALID_SIGNALS.includes((null ?? "") as string)).toBe(false)
    })
})
