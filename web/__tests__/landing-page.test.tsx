import { render, screen } from "@testing-library/react"
import { describe, it, expect, vi } from "vitest"

// ── shared mocks ──────────────────────────────────────────────────────────────
vi.mock("next/link", () => ({
  default: ({ children, href }: any) => <a href={href}>{children}</a>,
}))

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}))

vi.mock("lucide-react", () => ({
  Zap: () => <span data-testid="icon-zap" />,
  Bot: () => <span data-testid="icon-bot" />,
  GitBranch: () => <span data-testid="icon-gitbranch" />,
  GitPullRequest: () => <span data-testid="icon-pr" />,
  ShieldCheck: () => <span data-testid="icon-shield" />,
  MessageSquare: () => <span data-testid="icon-msg" />,
  Github: () => <span data-testid="icon-github" />,
}))

// ── HeroSection ───────────────────────────────────────────────────────────────
import { HeroSection } from "@/components/home/HeroSection"

describe("landing-page — Hero section", () => {
  it("renders the 'No server. No API key.' headline", () => {
    render(<HeroSection />)
    expect(screen.getByText(/no server\. no api key\./i)).toBeInTheDocument()
  })

  it("renders the '3 minutes' time-to-value promise", () => {
    render(<HeroSection />)
    expect(screen.getByText(/connect in 3 minutes/i)).toBeInTheDocument()
  })

  it("renders 'Get started free' CTA button", () => {
    render(<HeroSection />)
    expect(screen.getByRole("button", { name: /get started free/i })).toBeInTheDocument()
  })

  it("renders 'See How It Works' CTA button", () => {
    render(<HeroSection />)
    expect(
      screen.getByRole("button", { name: /see how it works/i })
    ).toBeInTheDocument()
  })

  it("'Get started free' links to /auth/signin?signup=1", () => {
    render(<HeroSection />)
    const link = screen.getByRole("link", { name: /get started free/i })
    expect(link.getAttribute("href")).toBe("/auth/signin?signup=1")
  })

  it("'See How It Works' links to #demo", () => {
    render(<HeroSection />)
    const link = screen.getByRole("link", { name: /see how it works/i })
    expect(link.getAttribute("href")).toBe("#demo")
  })
})

describe("landing-page — Hero trust strip", () => {
  it("renders 'Drift detection in every PR'", () => {
    render(<HeroSection />)
    expect(screen.getByText(/drift detection in every pr/i)).toBeInTheDocument()
  })

  it("renders 'No code ever stored'", () => {
    render(<HeroSection />)
    expect(screen.getByText(/no code ever stored/i)).toBeInTheDocument()
  })

  it("renders 'Bundled LLM — no API key needed'", () => {
    render(<HeroSection />)
    expect(screen.getByText(/bundled llm.*no api key needed/i)).toBeInTheDocument()
  })

  it("renders 'Open source — self-host free (AGPL)'", () => {
    render(<HeroSection />)
    expect(screen.getByText(/open source.*self-host free.*agpl/i)).toBeInTheDocument()
  })

  it("renders exactly 5 trust strip items", () => {
    render(<HeroSection />)
    // All trust items are inside the trust strip aria-label region
    const strip = screen.getByRole("region", { name: /trust signals/i })
    // Each item is a <span> with a checkmark sibling
    const checkmarks = strip.querySelectorAll("span.text-green-500")
    expect(checkmarks).toHaveLength(5)
  })
})

// ── Section smoke tests ───────────────────────────────────────────────────────
import { WhySaaS } from "@/components/home/WhySaaS"
import { PricingTeaser } from "@/components/home/PricingTeaser"
import { FeaturesTeaser } from "@/components/home/FeaturesTeaser"
import { SelfHostedCallout } from "@/components/home/SelfHostedCallout"

describe("landing-page — Section smoke tests", () => {
  it("HeroSection renders without crashing", () => {
    render(<HeroSection />)
    expect(screen.getByRole("region", { name: /hero/i })).toBeInTheDocument()
  })

  it("WhySaaS renders without crashing", () => {
    render(<WhySaaS />)
    expect(
      screen.getByRole("region", { name: /why use the hosted version/i })
    ).toBeInTheDocument()
  })

  it("PricingTeaser renders without crashing", () => {
    render(<PricingTeaser />)
    expect(screen.getByRole("region", { name: /pricing plans/i })).toBeInTheDocument()
  })

  it("FeaturesTeaser renders without crashing", () => {
    render(<FeaturesTeaser />)
    expect(
      screen.getByRole("heading", { name: /everything you need to keep docs honest/i })
    ).toBeInTheDocument()
  })

  it("SelfHostedCallout renders without crashing", () => {
    render(<SelfHostedCallout />)
    expect(
      screen.getByRole("heading", { name: /prefer to run it yourself/i })
    ).toBeInTheDocument()
  })
})
