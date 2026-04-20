// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * PricingTeaser tests — updated for FEAT-021 (compact teaser, no toggle,
 * blurred prices pending final confirmation).
 */
import { render, screen } from "@testing-library/react"
import { describe, it, expect, vi } from "vitest"
import { PricingTeaser } from "@/components/home/PricingTeaser"

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
      screen.getByRole("heading", { name: /start free/i })
    ).toBeInTheDocument()
  })

  it("renders the pricing-TBA banner", () => {
    render(<PricingTeaser />)
    expect(screen.getByText(/pricing is being finalised/i)).toBeInTheDocument()
  })
})

describe("PricingTeaser — plan cards", () => {
  it("renders all three plan names", () => {
    render(<PricingTeaser />)
    expect(screen.getByRole("heading", { name: /^free$/i })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: /^pro$/i })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: /^team$/i })).toBeInTheDocument()
  })

  it("marks Pro as popular", () => {
    render(<PricingTeaser />)
    expect(screen.getByText(/popular/i)).toBeInTheDocument()
  })

  it("prices are blurred (TBA state)", () => {
    render(<PricingTeaser />)
    const tbaBadges = screen.getAllByText("TBA")
    expect(tbaBadges.length).toBe(3)
  })

  it("renders AI Author Mode highlight in Free plan", () => {
    render(<PricingTeaser />)
    expect(screen.getByText(/ai author mode/i)).toBeInTheDocument()
  })

  it("renders Bundled LLM highlight in Pro plan", () => {
    render(<PricingTeaser />)
    expect(screen.getAllByText(/bundled llm/i).length).toBeGreaterThanOrEqual(1)
  })

  it("renders Agent Governance highlight in Pro plan", () => {
    render(<PricingTeaser />)
    expect(screen.getByText(/agent governance/i)).toBeInTheDocument()
  })

  it("renders SSO highlight in Team plan", () => {
    render(<PricingTeaser />)
    expect(screen.getByText(/sso/i)).toBeInTheDocument()
  })
})

describe("PricingTeaser — CTAs", () => {
  it("renders Get started CTA for Free plan linking to sign-in", () => {
    render(<PricingTeaser />)
    const link = screen.getByRole("link", { name: /get started/i })
    expect(link).toBeInTheDocument()
    expect(link.getAttribute("href")).toBe("/auth/signin?signup=1")
  })

  it("renders Start Pro CTA", () => {
    render(<PricingTeaser />)
    expect(screen.getByRole("link", { name: /start pro/i })).toBeInTheDocument()
  })

  it("renders Start Team CTA", () => {
    render(<PricingTeaser />)
    expect(screen.getByRole("link", { name: /start team/i })).toBeInTheDocument()
  })

  it("renders no billing period toggle", () => {
    render(<PricingTeaser />)
    expect(screen.queryByRole("button", { name: /monthly/i })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /annual/i })).not.toBeInTheDocument()
  })
})

describe("PricingTeaser — footer link", () => {
  it("renders 'See full pricing' link to /pricing", () => {
    render(<PricingTeaser />)
    const link = screen.getByRole("link", { name: /see full pricing/i })
    expect(link).toBeInTheDocument()
    expect(link.getAttribute("href")).toBe("/pricing")
  })
})
