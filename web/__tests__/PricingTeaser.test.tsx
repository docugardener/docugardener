import { render, screen, fireEvent } from "@testing-library/react"
import { describe, it, expect, vi, afterEach } from "vitest"
import { PricingTeaser, PLANS } from "@/components/home/PricingTeaser"

vi.mock("next/link", () => ({
  default: ({ children, href }: any) => <a href={href}>{children}</a>,
}))

describe("PricingTeaser — section header", () => {
  it("renders without crashing", () => {
    render(<PricingTeaser />)
    expect(screen.getByRole("region")).toBeInTheDocument()
  })

  it("renders the 'Pricing' eyebrow", () => {
    render(<PricingTeaser />)
    expect(screen.getByText(/^pricing$/i)).toBeInTheDocument()
  })

  it("renders the section heading", () => {
    render(<PricingTeaser />)
    expect(
      screen.getByRole("heading", { name: /simple, honest pricing/i })
    ).toBeInTheDocument()
  })
})

describe("PricingTeaser — plan cards", () => {
  it("renders all three plan names", () => {
    render(<PricingTeaser />)
    expect(screen.getByText("Free")).toBeInTheDocument()
    expect(screen.getByText("Pro")).toBeInTheDocument()
    expect(screen.getByText("Team")).toBeInTheDocument()
  })

  it("renders FREE plan as $0", () => {
    render(<PricingTeaser />)
    expect(screen.getByTestId("price-free-monthly")).toHaveTextContent("0")
  })

  it("renders PRO monthly price from PLANS constant", () => {
    render(<PricingTeaser />)
    const pro = PLANS.find((p) => p.id === "pro")!
    expect(screen.getByTestId("price-pro-monthly")).toHaveTextContent(
      String(pro.monthlyPrice)
    )
  })

  it("renders TEAM monthly price from PLANS constant", () => {
    render(<PricingTeaser />)
    const team = PLANS.find((p) => p.id === "team")!
    expect(screen.getByTestId("price-team-monthly")).toHaveTextContent(
      String(team.monthlyPrice)
    )
  })

  it("renders AI Author Mode highlight in Free plan", () => {
    render(<PricingTeaser />)
    expect(screen.getByText(/ai author mode/i)).toBeInTheDocument()
  })

  it("renders Bundled LLM highlight in Pro plan", () => {
    render(<PricingTeaser />)
    expect(screen.getByText(/bundled llm/i)).toBeInTheDocument()
  })

  it("renders Agent Governance highlight in Pro plan", () => {
    render(<PricingTeaser />)
    expect(screen.getByText(/agent governance/i)).toBeInTheDocument()
  })

  it("renders SSO highlight in Team plan", () => {
    render(<PricingTeaser />)
    expect(screen.getByText(/sso/i)).toBeInTheDocument()
  })

  it("renders 'Get Started' CTA for Free plan", () => {
    render(<PricingTeaser />)
    expect(screen.getByRole("link", { name: /get started/i })).toBeInTheDocument()
  })

  // Billing disabled by default — paid CTAs show "Join waitlist"
  it("renders 'Join waitlist' CTA for Pro when billing is disabled", () => {
    render(<PricingTeaser />)
    const waitlistLinks = screen.getAllByRole("link", { name: /join waitlist/i })
    expect(waitlistLinks.length).toBeGreaterThanOrEqual(1)
  })

  it("renders 'Join waitlist' CTA for Team when billing is disabled", () => {
    render(<PricingTeaser />)
    const waitlistLinks = screen.getAllByRole("link", { name: /join waitlist/i })
    expect(waitlistLinks.length).toBe(2) // Pro + Team
  })
})

describe("PricingTeaser — plan cards (billing enabled)", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("renders 'Start Pro' CTA when NEXT_PUBLIC_BILLING_ENABLED=true", () => {
    vi.stubEnv("NEXT_PUBLIC_BILLING_ENABLED", "true")
    render(<PricingTeaser />)
    expect(screen.getByRole("link", { name: /start pro/i })).toBeInTheDocument()
  })

  it("renders 'Start Team' CTA when NEXT_PUBLIC_BILLING_ENABLED=true", () => {
    vi.stubEnv("NEXT_PUBLIC_BILLING_ENABLED", "true")
    render(<PricingTeaser />)
    expect(screen.getByRole("link", { name: /start team/i })).toBeInTheDocument()
  })
})

describe("PricingTeaser — billing toggle", () => {
  it("renders 'Monthly' toggle button", () => {
    render(<PricingTeaser />)
    expect(screen.getByRole("button", { name: /monthly/i })).toBeInTheDocument()
  })

  it("renders 'Annual' toggle button", () => {
    render(<PricingTeaser />)
    expect(screen.getByRole("button", { name: /annual/i })).toBeInTheDocument()
  })

  it("Monthly is selected by default (aria-pressed='true')", () => {
    render(<PricingTeaser />)
    expect(screen.getByRole("button", { name: /monthly/i })).toHaveAttribute(
      "aria-pressed",
      "true"
    )
  })

  it("Annual is not selected by default (aria-pressed='false')", () => {
    render(<PricingTeaser />)
    expect(screen.getByRole("button", { name: /annual/i })).toHaveAttribute(
      "aria-pressed",
      "false"
    )
  })

  it("clicking Annual shows annual PRO price", () => {
    render(<PricingTeaser />)
    const pro = PLANS.find((p) => p.id === "pro")!
    fireEvent.click(screen.getByRole("button", { name: /annual/i }))
    expect(screen.getByTestId("price-pro-annual")).toHaveTextContent(
      String(pro.annualPrice)
    )
  })

  it("clicking Annual switches Annual to aria-pressed='true'", () => {
    render(<PricingTeaser />)
    fireEvent.click(screen.getByRole("button", { name: /annual/i }))
    expect(screen.getByRole("button", { name: /annual/i })).toHaveAttribute(
      "aria-pressed",
      "true"
    )
  })

  it("clicking Annual switches Monthly to aria-pressed='false'", () => {
    render(<PricingTeaser />)
    fireEvent.click(screen.getByRole("button", { name: /annual/i }))
    expect(screen.getByRole("button", { name: /monthly/i })).toHaveAttribute(
      "aria-pressed",
      "false"
    )
  })

  it("clicking Monthly after Annual reverts PRO to monthly price", () => {
    render(<PricingTeaser />)
    const pro = PLANS.find((p) => p.id === "pro")!
    fireEvent.click(screen.getByRole("button", { name: /annual/i }))
    fireEvent.click(screen.getByRole("button", { name: /monthly/i }))
    expect(screen.getByTestId("price-pro-monthly")).toHaveTextContent(
      String(pro.monthlyPrice)
    )
  })
})

describe("PricingTeaser — self-hosted note", () => {
  it("renders 'Self-hosted?' text", () => {
    render(<PricingTeaser />)
    expect(screen.getByText(/self-hosted\?/i)).toBeInTheDocument()
  })

  it("renders 'free forever' text in self-hosted note", () => {
    render(<PricingTeaser />)
    // text is split by <span>AGPL</span> — match the unbroken fragment
    expect(screen.getByText(/— free forever under the/i)).toBeInTheDocument()
  })

  it("renders 'AGPL' mention", () => {
    render(<PricingTeaser />)
    expect(screen.getByText(/agpl/i)).toBeInTheDocument()
  })

  it("renders a GitHub link", () => {
    render(<PricingTeaser />)
    const links = screen.getAllByRole("link")
    const githubLink = links.find((l) =>
      l.getAttribute("href")?.includes("github.com")
    )
    expect(githubLink).toBeDefined()
  })

  it("renders 'See full comparison' link to /pricing", () => {
    render(<PricingTeaser />)
    const link = screen.getByRole("link", { name: /see full comparison/i })
    expect(link).toBeInTheDocument()
    expect(link.getAttribute("href")).toBe("/pricing")
  })
})
