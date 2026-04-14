import { describe, it, expect } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { useState } from "react"

/**
 * Tests for the compact drift table and policy violations panel.
 * Logic is replicated inline to avoid heavy deps from SemanticDiffViewer.
 */

// ── Compact drift table component (mirrors SemanticDiffViewer logic) ──────────

interface DriftItem {
    file_path?: string
    severity?: string
    required_updates?: Array<{ description: string } | string>
    summary?: string
    reason?: string
    reasoning?: string
}

function CompactDriftTable({ items }: { items: DriftItem[] }) {
    const [expandedIdx, setExpandedIdx] = useState<number | null>(null)
    const [showCode, setShowCode] = useState<Record<number, boolean>>({})

    return (
        <div data-testid="drift-table">
            {items.map((item, i) => {
                const filePath = item.file_path ?? "Repository Code"
                const firstAction =
                    (typeof item.required_updates?.[0] === "object"
                        ? (item.required_updates[0] as { description: string }).description
                        : item.required_updates?.[0] as string)
                    ?? item.summary
                    ?? "Review required"
                const isExpanded = expandedIdx === i

                return (
                    <div key={i}>
                        <div
                            data-testid={`drift-row-${i}`}
                            onClick={() => setExpandedIdx(isExpanded ? null : i)}
                            style={{ cursor: "pointer" }}
                        >
                            <span data-testid={`row-file-${i}`}>{filePath}</span>
                            <span data-testid={`row-action-${i}`}>{firstAction}</span>
                        </div>

                        {isExpanded && (
                            <div data-testid={`accordion-${i}`}>
                                <div data-testid={`file-context-${i}`}>
                                    File: {filePath}
                                </div>
                                {(item.reason || item.reasoning) && (
                                    <p data-testid={`analysis-${i}`}>{item.reasoning || item.reason}</p>
                                )}
                                <button
                                    data-testid={`show-code-btn-${i}`}
                                    onClick={e => {
                                        e.stopPropagation()
                                        setShowCode(prev => ({ ...prev, [i]: !prev[i] }))
                                    }}
                                >
                                    {showCode[i] ? "Hide code" : "Show code"}
                                </button>
                                {showCode[i] && (
                                    <div data-testid={`code-section-${i}`}>code content</div>
                                )}
                            </div>
                        )}
                    </div>
                )
            })}
        </div>
    )
}

// ── Policy violations component (mirrors SemanticDiffViewer logic) ────────────

interface PolicyViolation {
    rule_name: string
    enforcement: string
}

function PolicyViolationsPanel({ violations }: { violations: PolicyViolation[] }) {
    if (violations.length === 0) return null
    return (
        <details data-testid="policy-violations">
            <summary data-testid="policy-summary">
                {violations.length} policy violation{violations.length !== 1 ? "s" : ""}
            </summary>
            <div data-testid="policy-body">
                {violations.map((v, i) => (
                    <div key={i} data-testid={`violation-${i}`}>{v.rule_name}</div>
                ))}
            </div>
        </details>
    )
}

// ── Sample data ───────────────────────────────────────────────────────────────

const sampleItems: DriftItem[] = [
    {
        file_path: "docs/README.md",
        severity: "critical",
        required_updates: [{ description: "Update API section" }, { description: "Add examples" }],
        reason: "The API has changed significantly",
    },
    {
        file_path: "docs/CONTRIBUTING.md",
        severity: "moderate",
        summary: "Minor wording update needed",
        reasoning: "Contributing guide is out of date",
    },
]

// ── Compact drift table tests ─────────────────────────────────────────────────

describe("CompactDriftTable", () => {
    it("renders one row per drift item", () => {
        render(<CompactDriftTable items={sampleItems} />)
        expect(screen.getByTestId("drift-row-0")).toBeInTheDocument()
        expect(screen.getByTestId("drift-row-1")).toBeInTheDocument()
    })

    it("shows file path in row", () => {
        render(<CompactDriftTable items={sampleItems} />)
        expect(screen.getByTestId("row-file-0")).toHaveTextContent("docs/README.md")
        expect(screen.getByTestId("row-file-1")).toHaveTextContent("docs/CONTRIBUTING.md")
    })

    it("shows first required action text in row", () => {
        render(<CompactDriftTable items={sampleItems} />)
        expect(screen.getByTestId("row-action-0")).toHaveTextContent("Update API section")
        expect(screen.getByTestId("row-action-1")).toHaveTextContent("Minor wording update needed")
    })

    it("no expanded content visible by default", () => {
        render(<CompactDriftTable items={sampleItems} />)
        expect(screen.queryByTestId("accordion-0")).not.toBeInTheDocument()
        expect(screen.queryByTestId("accordion-1")).not.toBeInTheDocument()
    })

    it("click row expands content with file context", () => {
        render(<CompactDriftTable items={sampleItems} />)
        fireEvent.click(screen.getByTestId("drift-row-0"))
        expect(screen.getByTestId("accordion-0")).toBeInTheDocument()
        expect(screen.getByTestId("file-context-0")).toHaveTextContent("docs/README.md")
    })

    it("click same row again collapses content", () => {
        render(<CompactDriftTable items={sampleItems} />)
        fireEvent.click(screen.getByTestId("drift-row-0"))
        expect(screen.getByTestId("accordion-0")).toBeInTheDocument()
        fireEvent.click(screen.getByTestId("drift-row-0"))
        expect(screen.queryByTestId("accordion-0")).not.toBeInTheDocument()
    })

    it("click row A then row B — A collapses, B expands", () => {
        render(<CompactDriftTable items={sampleItems} />)
        fireEvent.click(screen.getByTestId("drift-row-0"))
        expect(screen.getByTestId("accordion-0")).toBeInTheDocument()
        expect(screen.queryByTestId("accordion-1")).not.toBeInTheDocument()

        fireEvent.click(screen.getByTestId("drift-row-1"))
        expect(screen.queryByTestId("accordion-0")).not.toBeInTheDocument()
        expect(screen.getByTestId("accordion-1")).toBeInTheDocument()
    })

    it("Show code button not visible before row is expanded", () => {
        render(<CompactDriftTable items={sampleItems} />)
        expect(screen.queryByTestId("show-code-btn-0")).not.toBeInTheDocument()
    })

    it("Show code button visible after row is expanded", () => {
        render(<CompactDriftTable items={sampleItems} />)
        fireEvent.click(screen.getByTestId("drift-row-0"))
        expect(screen.getByTestId("show-code-btn-0")).toBeInTheDocument()
    })

    it("click Show code makes code section visible", () => {
        render(<CompactDriftTable items={sampleItems} />)
        fireEvent.click(screen.getByTestId("drift-row-0"))
        expect(screen.queryByTestId("code-section-0")).not.toBeInTheDocument()
        fireEvent.click(screen.getByTestId("show-code-btn-0"))
        expect(screen.getByTestId("code-section-0")).toBeInTheDocument()
    })
})

// ── Policy violations tests ───────────────────────────────────────────────────

describe("PolicyViolationsPanel", () => {
    it("renders details element when violations exist", () => {
        render(<PolicyViolationsPanel violations={[{ rule_name: "must-have-readme", enforcement: "blocking" }]} />)
        expect(screen.getByTestId("policy-violations")).toBeInTheDocument()
    })

    it("details element is NOT open by default", () => {
        render(<PolicyViolationsPanel violations={[{ rule_name: "must-have-readme", enforcement: "blocking" }]} />)
        const details = screen.getByTestId("policy-violations")
        expect(details).not.toHaveAttribute("open")
    })

    it("summary shows violation count", () => {
        render(<PolicyViolationsPanel violations={[
            { rule_name: "rule-a", enforcement: "blocking" },
            { rule_name: "rule-b", enforcement: "advisory" },
        ]} />)
        expect(screen.getByTestId("policy-summary")).toHaveTextContent("2 policy violations")
    })

    it("renders nothing when violations array is empty", () => {
        const { container } = render(<PolicyViolationsPanel violations={[]} />)
        expect(container).toBeEmptyDOMElement()
    })
})
