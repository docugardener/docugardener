import { describe, it, expect } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import React, { useState } from "react"

/**
 * Tests for the pill-based lineage step indicator.
 * Logic is copied inline to avoid heavy deps from SemanticDiffViewer.
 */

// ── Duration / detail string helpers (mirrors SemanticDiffViewer logic) ────────

function buildDurationStr(createdAt?: string, completedAt?: string | null): string | null {
    if (!completedAt || !createdAt) return null
    const ms = new Date(completedAt).getTime() - new Date(createdAt).getTime()
    return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}

function buildAnalyzedDetail({
    durationStr,
    driftScore,
    model,
    totalTokens,
    completedAt,
}: {
    durationStr: string | null
    driftScore?: number
    model?: string
    totalTokens: number | null
    completedAt?: string | null
}): string {
    const parts = [
        durationStr,
        driftScore !== undefined ? `drift score ${driftScore}` : null,
        model ?? null,
        totalTokens ? `${totalTokens.toLocaleString()} tokens` : null,
    ].filter((x): x is string => Boolean(x))
    return parts.join(" · ") || (completedAt ? "Analysis complete" : "In progress…")
}

// ── TierBadge class selection (mirrors jobs/page.tsx TierBadge) ─────────────

function tierBadgeClasses(score: number): string {
    if (score <= 60) return "bg-transparent text-emerald-700 border-emerald-500/50 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800"
    if (score <= 80) return "bg-transparent text-amber-700 border-amber-500/50 dark:bg-yellow-950/40 dark:text-yellow-400 dark:border-yellow-800"
    return "bg-transparent text-rose-700 border-rose-500/50 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800"
}

// ── Expandable lineage panel component (mirrors SemanticDiffViewer behavior) ──

function ExpandableLineage({ steps, jobId }: {
    steps: Array<{ label: string; detail: string }>
    jobId: string
}) {
    const [open, setOpen] = useState(false)
    return (
        <div>
            <button onClick={() => setOpen(o => !o)} aria-label={open ? "Collapse step details" : "Expand step details"}>
                {open ? "Less" : "Details"}
            </button>
            {open && (
                <div data-testid="lineage-detail">
                    {steps.map((s, i) => (
                        <div key={i} data-testid={`lineage-row-${i}`}>
                            <span data-testid={`lineage-label-${i}`}>{s.label}</span>
                            <p data-testid={`lineage-detail-${i}`}>{s.detail}</p>
                        </div>
                    ))}
                    <a href={`/dashboard/jobs/${jobId}`} data-testid="jobs-link">Jobs queue</a>
                </div>
            )}
        </div>
    )
}

// ── Minimal step data types ────────────────────────────────────────────────────

interface Step {
    label: string
    done: boolean
    active: boolean
    href?: string
    sub?: string | null
}

function buildSteps({
    createdAt,
    completedAt,
    triageStatus,
    fixPrUrl,
}: {
    createdAt?: string
    completedAt?: string | null
    triageStatus?: string
    fixPrUrl?: string
}): Step[] {
    const ts = triageStatus ?? "PENDING"
    const steps: Step[] = [
        {
            label: "Detected",
            done: true,
            active: false,
            sub: createdAt ? "some time ago" : null,
        },
        {
            label: "Analyzed",
            done: !!completedAt,
            active: !completedAt,
            sub: completedAt ? "some time ago" : null,
        },
        {
            label: ts === "PENDING" ? "Awaiting Triage" : ts === "IGNORED" ? "Dismissed" : ts === "ACCEPTED" ? "Accepted" : "Resolved",
            done: ts !== "PENDING",
            active: ts === "PENDING",
        },
    ]
    if (fixPrUrl) {
        steps.push({
            label: "Fix PR Created",
            done: true,
            active: false,
            href: fixPrUrl,
        })
    }
    return steps
}

// ── Minimal StepIndicator component ───────────────────────────────────────────

function StepIndicator({ steps }: { steps: Step[] }) {
    return (
        <div data-testid="step-indicator">
            {steps.map((step, i) => (
                <div key={i}>
                    {step.href ? (
                        <a
                            href={step.href}
                            data-testid={`step-pill-${i}`}
                            data-done="true"
                            data-fix-pr="true"
                            className="pill-fix-pr"
                        >
                            {step.label}
                        </a>
                    ) : (
                        <span
                            data-testid={`step-pill-${i}`}
                            data-done={step.done ? "true" : "false"}
                            data-active={step.active ? "true" : "false"}
                            className={step.done ? "pill-done" : step.active ? "pill-active" : "pill-future"}
                        >
                            {step.label}
                        </span>
                    )}
                    {step.sub && <span data-testid={`step-sub-${i}`}>{step.sub}</span>}
                </div>
            ))}
        </div>
    )
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("StepIndicator — pill timeline", () => {
    it("renders Detected pill always", () => {
        const steps = buildSteps({})
        render(<StepIndicator steps={steps} />)
        expect(screen.getByText("Detected")).toBeInTheDocument()
    })

    it("renders Analyzed pill as done when completedAt is set", () => {
        const steps = buildSteps({ completedAt: "2026-03-01T00:00:00Z" })
        render(<StepIndicator steps={steps} />)
        const pill = screen.getByText("Analyzed")
        expect(pill).toHaveAttribute("data-done", "true")
    })

    it("does not render Analyzed pill as done when completedAt is null", () => {
        const steps = buildSteps({ completedAt: null })
        render(<StepIndicator steps={steps} />)
        const pill = screen.getByText("Analyzed")
        expect(pill).toHaveAttribute("data-done", "false")
    })

    it("renders Awaiting Triage for PENDING status", () => {
        const steps = buildSteps({ triageStatus: "PENDING" })
        render(<StepIndicator steps={steps} />)
        expect(screen.getByText("Awaiting Triage")).toBeInTheDocument()
    })

    it("renders Accepted for ACCEPTED status", () => {
        const steps = buildSteps({ triageStatus: "ACCEPTED" })
        render(<StepIndicator steps={steps} />)
        expect(screen.getByText("Accepted")).toBeInTheDocument()
    })

    it("renders Dismissed for IGNORED status", () => {
        const steps = buildSteps({ triageStatus: "IGNORED" })
        render(<StepIndicator steps={steps} />)
        expect(screen.getByText("Dismissed")).toBeInTheDocument()
    })

    it("renders Fix PR pill when fixPrUrl is provided", () => {
        const steps = buildSteps({ fixPrUrl: "https://github.com/org/repo/pull/42" })
        render(<StepIndicator steps={steps} />)
        expect(screen.getByText("Fix PR Created")).toBeInTheDocument()
    })

    it("does not render Fix PR pill when fixPrUrl is null/undefined", () => {
        const steps = buildSteps({})
        render(<StepIndicator steps={steps} />)
        expect(screen.queryByText("Fix PR Created")).not.toBeInTheDocument()
    })

    it("Fix PR pill is an anchor tag with correct href", () => {
        const url = "https://github.com/org/repo/pull/42"
        const steps = buildSteps({ fixPrUrl: url })
        render(<StepIndicator steps={steps} />)
        const link = screen.getByText("Fix PR Created")
        expect(link.tagName).toBe("A")
        expect(link).toHaveAttribute("href", url)
    })

    it("done steps have different className than pending steps", () => {
        const steps = buildSteps({ completedAt: "2026-03-01T00:00:00Z", triageStatus: "PENDING" })
        render(<StepIndicator steps={steps} />)
        const detected = screen.getByText("Detected")
        const awaiting = screen.getByText("Awaiting Triage")
        expect(detected.className).not.toBe(awaiting.className)
        expect(detected).toHaveAttribute("data-done", "true")
        expect(awaiting).toHaveAttribute("data-done", "false")
    })
})

describe("Lineage expandable detail panel", () => {
    const mockSteps = [
        { label: "Detected", detail: "Webhook received" },
        { label: "Analyzed", detail: "3.2s · drift score 73 · gemini-2.0-flash · 1,200 tokens" },
        { label: "Awaiting Triage", detail: "Pending review" },
    ]

    it("detail panel is hidden by default", () => {
        render(<ExpandableLineage steps={mockSteps} jobId="job-123" />)
        expect(screen.queryByTestId("lineage-detail")).not.toBeInTheDocument()
    })

    it("toggle button shows 'Details' when collapsed", () => {
        render(<ExpandableLineage steps={mockSteps} jobId="job-123" />)
        expect(screen.getByText("Details")).toBeInTheDocument()
    })

    it("clicking toggle opens the detail panel", () => {
        render(<ExpandableLineage steps={mockSteps} jobId="job-123" />)
        fireEvent.click(screen.getByRole("button"))
        expect(screen.getByTestId("lineage-detail")).toBeInTheDocument()
    })

    it("toggle button shows 'Less' when expanded", () => {
        render(<ExpandableLineage steps={mockSteps} jobId="job-123" />)
        fireEvent.click(screen.getByRole("button"))
        expect(screen.getByText("Less")).toBeInTheDocument()
    })

    it("clicking toggle again closes the detail panel", () => {
        render(<ExpandableLineage steps={mockSteps} jobId="job-123" />)
        fireEvent.click(screen.getByRole("button"))
        fireEvent.click(screen.getByRole("button"))
        expect(screen.queryByTestId("lineage-detail")).not.toBeInTheDocument()
    })

    it("shows all step labels in expanded state", () => {
        render(<ExpandableLineage steps={mockSteps} jobId="job-123" />)
        fireEvent.click(screen.getByRole("button"))
        expect(screen.getByTestId("lineage-label-0")).toHaveTextContent("Detected")
        expect(screen.getByTestId("lineage-label-1")).toHaveTextContent("Analyzed")
        expect(screen.getByTestId("lineage-label-2")).toHaveTextContent("Awaiting Triage")
    })

    it("shows step detail text in expanded state", () => {
        render(<ExpandableLineage steps={mockSteps} jobId="job-123" />)
        fireEvent.click(screen.getByRole("button"))
        expect(screen.getByTestId("lineage-detail-1")).toHaveTextContent("gemini-2.0-flash")
        expect(screen.getByTestId("lineage-detail-1")).toHaveTextContent("drift score 73")
    })

    it("Jobs queue link points to correct job detail URL", () => {
        render(<ExpandableLineage steps={mockSteps} jobId="job-abc-42" />)
        fireEvent.click(screen.getByRole("button"))
        const link = screen.getByTestId("jobs-link")
        expect(link).toHaveAttribute("href", "/dashboard/jobs/job-abc-42")
    })
})

describe("Step detail content — durationStr builder", () => {
    it("returns null when no timestamps provided", () => {
        expect(buildDurationStr()).toBeNull()
    })

    it("returns null when completedAt is null", () => {
        expect(buildDurationStr("2026-03-01T10:00:00Z", null)).toBeNull()
    })

    it("formats sub-second durations as ms", () => {
        const created = "2026-03-01T10:00:00.000Z"
        const completed = "2026-03-01T10:00:00.500Z"
        expect(buildDurationStr(created, completed)).toBe("500ms")
    })

    it("formats durations ≥ 1s as seconds with 1 decimal", () => {
        const created = "2026-03-01T10:00:00.000Z"
        const completed = "2026-03-01T10:00:03.200Z"
        expect(buildDurationStr(created, completed)).toBe("3.2s")
    })

    it("builds analyzed detail with all fields", () => {
        const detail = buildAnalyzedDetail({
            durationStr: "4.1s",
            driftScore: 82,
            model: "gemini-2.0-flash",
            totalTokens: 1500,
            completedAt: "2026-03-01T10:00:04Z",
        })
        expect(detail).toBe("4.1s · drift score 82 · gemini-2.0-flash · 1,500 tokens")
    })

    it("builds analyzed detail without optional fields", () => {
        const detail = buildAnalyzedDetail({
            durationStr: null,
            driftScore: undefined,
            model: undefined,
            totalTokens: null,
            completedAt: "2026-03-01T10:00:04Z",
        })
        expect(detail).toBe("Analysis complete")
    })

    it("shows 'In progress…' when no completedAt and no other data", () => {
        const detail = buildAnalyzedDetail({
            durationStr: null,
            driftScore: undefined,
            model: undefined,
            totalTokens: null,
            completedAt: null,
        })
        expect(detail).toBe("In progress…")
    })
})

describe("TierBadge — light/dark mode class selection", () => {
    it("Pass badge uses transparent bg in light mode", () => {
        expect(tierBadgeClasses(60)).toContain("bg-transparent")
        expect(tierBadgeClasses(60)).toContain("text-emerald-700")
    })

    it("Pass badge uses tinted bg in dark mode", () => {
        expect(tierBadgeClasses(60)).toContain("dark:bg-emerald-950/40")
        expect(tierBadgeClasses(60)).toContain("dark:text-emerald-400")
    })

    it("Warning badge uses transparent bg in light mode", () => {
        expect(tierBadgeClasses(80)).toContain("bg-transparent")
        expect(tierBadgeClasses(80)).toContain("text-amber-700")
    })

    it("Warning badge uses tinted bg in dark mode", () => {
        expect(tierBadgeClasses(80)).toContain("dark:bg-yellow-950/40")
    })

    it("Blocked badge uses transparent bg in light mode", () => {
        expect(tierBadgeClasses(81)).toContain("bg-transparent")
        expect(tierBadgeClasses(81)).toContain("text-rose-700")
    })

    it("Blocked badge uses tinted bg in dark mode", () => {
        expect(tierBadgeClasses(81)).toContain("dark:bg-rose-950/40")
    })

    it("score exactly 60 → Pass", () => {
        expect(tierBadgeClasses(60)).toContain("emerald")
    })

    it("score exactly 80 → Warning", () => {
        expect(tierBadgeClasses(80)).toContain("amber")
    })

    it("score 100 → Blocked", () => {
        expect(tierBadgeClasses(100)).toContain("rose")
    })
})
