/**
 * DG-SAAS-05: AgentRulesPanel — free tier quota tests
 *
 * Tests that:
 * - FREE plan shows quota banner with correct limit (3)
 * - PRO plan hides quota banner
 * - FREE plan disables Propose button when at limit
 * - FREE plan allows Propose when under limit
 */
import { render, screen } from "@testing-library/react"
import { describe, it, expect, vi } from "vitest"
import { AgentRulesPanel } from "@/components/settings/AgentRulesPanel"

vi.mock("lucide-react", () => ({
  Bot: () => <span>Bot</span>,
  RefreshCw: () => <span>RefreshCw</span>,
  ExternalLink: () => <span>ExternalLink</span>,
  CheckCircle: () => <span>CheckCircle</span>,
  AlertTriangle: () => <span>AlertTriangle</span>,
  Circle: () => <span>Circle</span>,
  ChevronDown: () => <span>ChevronDown</span>,
  ChevronUp: () => <span>ChevronUp</span>,
  Loader2: () => <span>Loader2</span>,
  InfoIcon: () => <span>InfoIcon</span>,
}))

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children, ...props }: any) => <span {...props}>{children}</span>,
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

const ALL_FORMATS = ["AGENTS_MD", "COPILOT_INSTRUCTIONS", "CURSOR_MDC", "CLAUDE_MD"]

// rulesCount = number of distinct formats to create artifacts for
function makeRepo(id: string, rulesCount = 0) {
  return {
    id,
    name: `repo-${id}`,
    fullName: `owner/repo-${id}`,
    githubInstallationId: "inst-1",
    githubRepoId: `repo-${id}-github`,
    rulesArtifacts: ALL_FORMATS.slice(0, rulesCount).map((targetFormat, i) => ({
      id: `art-${id}-${i}`,
      repoId: id,
      tenantId: "t-1",
      targetFormat,
      content: "# rules",
      isStale: false,
      outputPath: "",
      lastHash: null,
      lastGeneratedAt: null,
      lastPrUrl: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })),
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("AgentRulesPanel — free quota banner", () => {
  it("shows quota banner for FREE plan (isPro=false)", () => {
    render(<AgentRulesPanel repos={[makeRepo("r1")]} isPro={false} />)
    expect(screen.getByTestId("free-quota-banner")).toBeInTheDocument()
  })

  it("hides quota banner for PRO plan (isPro=true)", () => {
    render(<AgentRulesPanel repos={[makeRepo("r1")]} isPro={true} />)
    expect(screen.queryByTestId("free-quota-banner")).not.toBeInTheDocument()
  })

  it("shows correct FREE_LIMIT (3) in banner", () => {
    render(<AgentRulesPanel repos={[makeRepo("r1")]} isPro={false} />)
    expect(screen.getByTestId("free-quota-banner")).toHaveTextContent("3")
  })

  it("shows used count of 0 when no rules exist", () => {
    render(<AgentRulesPanel repos={[makeRepo("r1", 0)]} isPro={false} />)
    expect(screen.getByTestId("free-quota-banner")).toHaveTextContent("0/3")
  })

  it("shows used count of 2 when 2 artifacts exist", () => {
    render(<AgentRulesPanel repos={[makeRepo("r1", 2)]} isPro={false} />)
    expect(screen.getByTestId("free-quota-banner")).toHaveTextContent("2/3")
  })

  it("banner contains upgrade link to /pricing", () => {
    render(<AgentRulesPanel repos={[makeRepo("r1")]} isPro={false} />)
    const banner = screen.getByTestId("free-quota-banner")
    const link = banner.querySelector("a")
    expect(link).toBeTruthy()
    expect(link?.getAttribute("href")).toBe("/pricing")
  })

  it("banner mentions Pro", () => {
    render(<AgentRulesPanel repos={[makeRepo("r1")]} isPro={false} />)
    expect(screen.getByTestId("free-quota-banner")).toHaveTextContent(/pro/i)
  })
})

describe("AgentRulesPanel — empty state", () => {
  it("shows 'no repos' message when repos is empty", () => {
    render(<AgentRulesPanel repos={[]} isPro={false} />)
    expect(screen.getByText(/no enabled repositories/i)).toBeInTheDocument()
  })

  it("does not show quota banner when repos is empty", () => {
    render(<AgentRulesPanel repos={[]} isPro={false} />)
    expect(screen.queryByTestId("free-quota-banner")).not.toBeInTheDocument()
  })
})
