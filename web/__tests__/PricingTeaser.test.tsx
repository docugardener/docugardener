// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * PricingTeaser tests — updated for the 2026-06 de-commercialisation
 * (compact teaser, no toggle, no prices/TBA badges; paid tiers route to the
 * self-hosting docs instead of waitlist/checkout).
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
      screen.getByRole("heading", { name: /free to start/i })
    ).toBeInTheDocument()
  })

  it("renders the open-source self-host subhead", () => {
    render(<PricingTeaser />)
    expect(
      screen.getByText(/self-host the full feature set for free/i)
    ).toBeInTheDocument()
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

  it("shows no TBA badges and a real $0 for the Free tier", () => {
    render(<PricingTeaser />)
    expect(screen.queryAllByText("TBA").length).toBe(0)
    expect(screen.getByText("$0")).toBeInTheDocument()
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

  it("renders 'Self-host free' CTAs for the two paid tiers", () => {
    render(<PricingTeaser />)
    const ctas = screen.getAllByRole("link", { name: /^self-host free →$/i })
    expect(ctas.length).toBe(2)
  })

  it("paid-tier CTAs route to the self-hosting docs", () => {
    render(<PricingTeaser />)
    const ctas = screen.getAllByRole("link", { name: /^self-host free →$/i })
    ctas.forEach((c) => expect(c.getAttribute("href")).toBe("/docs/self-hosting"))
  })

  it("renders no billing period toggle", () => {
    render(<PricingTeaser />)
    expect(screen.queryByRole("button", { name: /monthly/i })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /annual/i })).not.toBeInTheDocument()
  })
})

describe("PricingTeaser — footer link", () => {
  it("renders 'Self-host for free' link to the self-hosting docs", () => {
    render(<PricingTeaser />)
    const link = screen.getByRole("link", { name: /self-host for free/i })
    expect(link).toBeInTheDocument()
    expect(link.getAttribute("href")).toBe("/docs/self-hosting")
  })
})
