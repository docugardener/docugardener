// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { UpgradeContextCard } from "@/components/billing/UpgradeContextCard"

const defaultProps = {
  title: "Slack, Jira & Linear Integrations",
  description:
    "Route drift alerts directly to your team's Slack channels and create Jira tickets.",
  persona: "Engineering leads managing multiple repos across teams",
  outcomes: [
    "Reduce mean time to documentation fix by routing alerts automatically",
    "Cut context-switching: drift tickets appear in Jira with full PR context",
  ] as [string, string],
  requiredPlan: "PRO" as const,
}

describe("UpgradeContextCard", () => {
  it("renders title and description", () => {
    render(<UpgradeContextCard {...defaultProps} />)
    expect(screen.getByText(defaultProps.title)).toBeDefined()
    expect(screen.getByText(defaultProps.description)).toBeDefined()
  })

  it("renders persona string", () => {
    render(<UpgradeContextCard {...defaultProps} />)
    expect(screen.getByText(defaultProps.persona)).toBeDefined()
  })

  it("renders both outcome bullets with checkmark prefix", () => {
    render(<UpgradeContextCard {...defaultProps} />)
    const checkmarks = screen.getAllByText("✓")
    expect(checkmarks).toHaveLength(2)
    expect(screen.getByText(defaultProps.outcomes[0])).toBeDefined()
    expect(screen.getByText(defaultProps.outcomes[1])).toBeDefined()
  })

  it('shows "Pro" in the plan label for requiredPlan="PRO"', () => {
    render(<UpgradeContextCard {...defaultProps} requiredPlan="PRO" />)
    // "Available on the Pro plan and above." contains "Pro"
    const planSpans = screen.getAllByText("Pro")
    expect(planSpans.length).toBeGreaterThan(0)
  })

  it('shows "Team" in the plan label for requiredPlan="TEAM"', () => {
    render(<UpgradeContextCard {...defaultProps} requiredPlan="TEAM" />)
    // "Available on the Team plan and above." contains "Team"
    const planSpans = screen.getAllByText("Team")
    expect(planSpans.length).toBeGreaterThan(0)
  })

  it("CTA link href is /dashboard/billing", () => {
    render(<UpgradeContextCard {...defaultProps} />)
    // The link text includes the arrow →
    const link = screen.getByRole("link")
    expect(link.getAttribute("href")).toBe("/dashboard/billing")
  })

  it('default CTA label is "Upgrade to Pro →" when requiredPlan="PRO"', () => {
    render(<UpgradeContextCard {...defaultProps} requiredPlan="PRO" />)
    const link = screen.getByRole("link")
    expect(link.textContent).toBe("Upgrade to Pro →")
  })

  it('default CTA label is "Upgrade to Team →" when requiredPlan="TEAM"', () => {
    render(<UpgradeContextCard {...defaultProps} requiredPlan="TEAM" />)
    const link = screen.getByRole("link")
    expect(link.textContent).toBe("Upgrade to Team →")
  })

  it("custom ctaLabel prop overrides default", () => {
    render(
      <UpgradeContextCard {...defaultProps} ctaLabel="See pricing plans" />
    )
    const link = screen.getByRole("link")
    expect(link.textContent).toBe("See pricing plans →")
  })

  it('has role="region" with accessible aria-label', () => {
    render(<UpgradeContextCard {...defaultProps} />)
    const region = screen.getByRole("region", {
      name: `Upgrade required: ${defaultProps.title}`,
    })
    expect(region).toBeDefined()
  })
})
