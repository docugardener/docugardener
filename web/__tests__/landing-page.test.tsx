// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Landing page component tests — updated for FEAT-021 refactor.
 * Hero: asymmetric layout, 2 CTAs, 3-item neutral trust strip.
 * PricingTeaser: compact, no toggle, blurred prices.
 */
import { render, screen } from "@testing-library/react"
import { describe, it, expect, vi } from "vitest"

// ── shared mocks ──────────────────────────────────────────────────────────────
vi.mock("next/link", () => ({
  default: ({ children, href }: any) => <a href={href}>{children}</a>,
}))

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}))

vi.mock("@/lib/posthog", () => ({
  captureEvent: vi.fn(),
}))

vi.mock("@/components/home/HeroVisual", () => ({
  HeroVisual: () => <div data-testid="hero-visual-placeholder" />,
}))

vi.mock("lucide-react", () => ({
  Zap: () => <span data-testid="icon-zap" />,
  Bot: () => <span data-testid="icon-bot" />,
  GitBranch: () => <span data-testid="icon-gitbranch" />,
  GitPullRequest: () => <span data-testid="icon-pr" />,
  ShieldCheck: () => <span data-testid="icon-shield" />,
  Plug: () => <span data-testid="icon-plug" />,
  MessageSquare: () => <span data-testid="icon-msg" />,
  Github: () => <span data-testid="icon-github" />,
  ArrowRight: () => <span data-testid="icon-arrow" />,
  Check: () => <span data-testid="icon-check" />,
  AlertTriangle: () => <span data-testid="icon-alert" />,
  FileText: () => <span data-testid="icon-file" />,
}))

// ── HeroSection ───────────────────────────────────────────────────────────────
import { HeroSection } from "@/components/home/HeroSection"

describe("landing-page — Hero section", () => {
  it("renders the main headline", () => {
    render(<HeroSection />)
    expect(screen.getByText(/keep your docs/i)).toBeInTheDocument()
  })

  it("renders 'Get started free' CTA button", () => {
    render(<HeroSection />)
    expect(screen.getByRole("button", { name: /get started free/i })).toBeInTheDocument()
  })

  it("renders 'See How It Works' CTA button", () => {
    render(<HeroSection />)
    expect(screen.getByRole("button", { name: /see how it works/i })).toBeInTheDocument()
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

  it("does NOT render a third CTA link (Story 4)", () => {
    render(<HeroSection />)
    // The old "See a live sample drift report" link is removed
    expect(screen.queryByText(/live sample drift report/i)).not.toBeInTheDocument()
  })
})

describe("landing-page — Hero trust strip", () => {
  it("renders 'Drift detection in every PR'", () => {
    render(<HeroSection />)
    expect(screen.getByText(/drift detection in every pr/i)).toBeInTheDocument()
  })

  it("renders 'Bundled LLM — no key needed'", () => {
    render(<HeroSection />)
    // "Bundled LLM" appears in both the body and the trust strip
    expect(screen.getAllByText(/bundled llm/i).length).toBeGreaterThanOrEqual(1)
  })

  it("renders 'Open source — self-host free'", () => {
    render(<HeroSection />)
    expect(screen.getByText(/open source.*self-host free/i)).toBeInTheDocument()
  })

  it("renders exactly 3 trust strip items (was 5)", () => {
    render(<HeroSection />)
    const strip = screen.getByRole("region", { name: /trust signals/i })
    const items = strip.querySelectorAll("span.flex.items-center")
    expect(items).toHaveLength(3)
  })

  it("trust-strip checkmarks use neutral gray (not green)", () => {
    render(<HeroSection />)
    const strip = screen.getByRole("region", { name: /trust signals/i })
    // Story 8 prep: checkmarks should NOT use text-green-500
    const greenChecks = strip.querySelectorAll("span.text-green-500")
    expect(greenChecks).toHaveLength(0)
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

  it("WhySaaS renders without crashing (retained on disk)", () => {
    render(<WhySaaS />)
    expect(
      screen.getByRole("region", { name: /why use the hosted version/i })
    ).toBeInTheDocument()
  })

  it("PricingTeaser renders without crashing", () => {
    render(<PricingTeaser />)
    expect(screen.getByRole("region", { name: /pricing/i })).toBeInTheDocument()
  })

  it("FeaturesTeaser renders without crashing (retained on disk)", () => {
    render(<FeaturesTeaser />)
    expect(
      screen.getByRole("heading", { name: /everything you need to keep docs honest/i })
    ).toBeInTheDocument()
  })

  it("SelfHostedCallout renders without crashing (retained on disk)", () => {
    render(<SelfHostedCallout />)
    expect(
      screen.getByRole("heading", { name: /prefer to run it yourself/i })
    ).toBeInTheDocument()
  })
})
