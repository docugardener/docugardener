import { render, screen } from "@testing-library/react"
import { describe, it, expect, vi } from "vitest"
import { FeaturesTeaser } from "@/components/home/FeaturesTeaser"

vi.mock("next/link", () => ({
  default: ({ children, href }: any) => <a href={href}>{children}</a>,
}))

vi.mock("lucide-react", () => ({
  Zap: () => <span data-testid="icon-zap" />,
  GitPullRequest: () => <span data-testid="icon-pr" />,
  ShieldCheck: () => <span data-testid="icon-shield" />,
  MessageSquare: () => <span data-testid="icon-msg" />,
}))

describe("FeaturesTeaser — structure", () => {
  it("renders without crashing", () => {
    render(<FeaturesTeaser />)
    expect(
      screen.getByRole("heading", { name: /everything you need to keep docs honest/i })
    ).toBeInTheDocument()
  })

  it("renders exactly 4 feature groups", () => {
    render(<FeaturesTeaser />)
    expect(screen.getAllByRole("article")).toHaveLength(4)
  })

  it("renders 'Explore all features' link to /features", () => {
    render(<FeaturesTeaser />)
    const link = screen.getByRole("link", { name: /explore all features/i })
    expect(link).toBeInTheDocument()
    expect(link.getAttribute("href")).toBe("/features")
  })
})

describe("FeaturesTeaser — zero-ops framing", () => {
  it("renders 'Zero Ops Deployment' group title", () => {
    render(<FeaturesTeaser />)
    expect(screen.getByText("Zero Ops Deployment")).toBeInTheDocument()
  })

  it("mentions 'Bundled LLM' in Zero Ops card", () => {
    render(<FeaturesTeaser />)
    expect(screen.getByText(/bundled llm/i)).toBeInTheDocument()
  })

  it("renders 'Drift Detection & Auto-Fix' group title", () => {
    render(<FeaturesTeaser />)
    expect(screen.getByText("Drift Detection & Auto-Fix")).toBeInTheDocument()
  })

  it("mentions 'Copilot, Cursor, Devin' in drift detection card", () => {
    render(<FeaturesTeaser />)
    expect(screen.getByText(/copilot.*cursor.*devin/i)).toBeInTheDocument()
  })

  it("renders 'Governance & Audit' group title", () => {
    render(<FeaturesTeaser />)
    expect(screen.getByText("Governance & Audit")).toBeInTheDocument()
  })

  it("renders 'Integrations' group title", () => {
    render(<FeaturesTeaser />)
    expect(screen.getByText("Integrations")).toBeInTheDocument()
  })
})
