/**
 * Tests for DriftAlertList status chips and action-button gating.
 *
 * Coverage:
 *  E1  QUEUED job shows "Queued" spinner chip, no action buttons
 *  E2  ANALYZING job shows "Analyzing" spinner chip, no action buttons
 *  E3  AI_FIXING (auto_fix_enqueued=true) shows "AI working" spinner, no action buttons
 *  E4  AI_FIXING via ACCEPTED triageStatus shows "AI fixing" spinner, no action buttons
 *  E5  FIX_PR_OPEN shows "Fix PR open" chip (no action buttons)
 *  E6  NEEDS_REVIEW shows "Review" chip
 *  E7  NO_DRIFT shows no Review chip
 *  E8  Multiple alerts render independently
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { DriftAlertList, type DriftAlert } from "@/components/inbox/DriftAlertList"

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/components/editor/LiveCodeBlock", () => ({
    LiveCodeBlock: () => null,
    DriftStatus: {},
}))

vi.mock("@/lib/severity", () => ({
    normaliseSeverity: (s: string) => s ?? "minor",
    SEVERITY_CONFIG: {
        critical: { border: "", dot: "", badge: "" },
        significant: { border: "", dot: "", badge: "" },
        moderate: { border: "", dot: "", badge: "" },
        minor: { border: "", dot: "", badge: "" },
    },
}))

beforeEach(() => {
    vi.clearAllMocks()
})

// ── Helpers ───────────────────────────────────────────────────────────────────

function baseAlert(overrides: Partial<DriftAlert> = {}): DriftAlert {
    return {
        id: "alert-1",
        repositoryName: "myrepo",
        repoOwner: "org",
        headSha: "abc1234",
        prNumber: 42,
        driftScore: 75,
        createdAt: new Date().toISOString(),
        filesChanged: ["src/payments.py"],
        result: { drift_score: 75 },
        ...overrides,
    }
}

function renderList(alert: DriftAlert) {
    render(
        <DriftAlertList
            alerts={[alert]}
            onSelect={() => {}}
        />
    )
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("DriftAlertList status chips", () => {
    it("E1 — QUEUED: shows Queued chip with spinner", () => {
        renderList(baseAlert({ status: "QUEUED", triageStatus: "PENDING", driftScore: 0 }))
        expect(screen.getByTestId("status-chip-queued")).toBeTruthy()
    })

    it("E2 — ANALYZING: shows Analyzing chip with spinner", () => {
        renderList(baseAlert({ status: "PROCESSING", triageStatus: "PENDING", driftScore: 0 }))
        expect(screen.getByTestId("status-chip-analyzing")).toBeTruthy()
    })

    it("E3 — AI_FIXING via auto_fix_enqueued: shows AI working spinner, no Review chip", () => {
        renderList(baseAlert({
            status: "COMPLETED",
            triageStatus: "PENDING",
            autoFixEnqueued: true,
            result: { drift_score: 75, auto_fix_enqueued: true },
        }))
        expect(screen.getByTestId("status-chip-ai-fixing")).toBeTruthy()
        expect(screen.queryByTestId("status-chip-review")).toBeNull()
    })

    it("E4 — AI_FIXING via ACCEPTED triageStatus: shows AI fixing chip, no Review chip", () => {
        renderList(baseAlert({
            status: "COMPLETED",
            triageStatus: "ACCEPTED",
        }))
        expect(screen.getByTestId("status-chip-ai-fixing")).toBeTruthy()
        expect(screen.queryByTestId("status-chip-review")).toBeNull()
    })

    it("E5 — FIX_PR_OPEN: shows Fix PR open chip", () => {
        renderList(baseAlert({
            status: "COMPLETED",
            triageStatus: "FIX_PR_OPEN",
            fixPrUrl: "https://github.com/org/repo/pull/43",
            result: { drift_score: 75, fixPrUrl: "https://github.com/org/repo/pull/43" },
        }))
        expect(screen.getByTestId("status-chip-fix-pr-open")).toBeTruthy()
        expect(screen.queryByTestId("status-chip-review")).toBeNull()
    })

    it("E6 — NEEDS_REVIEW: shows Review chip", () => {
        renderList(baseAlert({
            status: "COMPLETED",
            triageStatus: "PENDING",
            driftScore: 75,
            result: { drift_score: 75 },
        }))
        expect(screen.getByTestId("status-chip-review")).toBeTruthy()
    })

    it("E7 — NO_DRIFT: shows no Review chip", () => {
        renderList(baseAlert({
            status: "COMPLETED",
            triageStatus: "PENDING",
            driftScore: 0,
            result: { drift_score: 0 },
        }))
        expect(screen.queryByTestId("status-chip-review")).toBeNull()
    })

    it("E8 — Multiple alerts render independently with correct chips", () => {
        const alerts: DriftAlert[] = [
            baseAlert({ id: "a1", status: "PROCESSING", triageStatus: "PENDING", driftScore: 0 }),
            baseAlert({ id: "a2", status: "COMPLETED", triageStatus: "PENDING", driftScore: 80, result: { drift_score: 80 } }),
        ]
        render(<DriftAlertList alerts={alerts} onSelect={() => {}} />)
        expect(screen.getByTestId("status-chip-analyzing")).toBeTruthy()
        expect(screen.getByTestId("status-chip-review")).toBeTruthy()
    })
})
