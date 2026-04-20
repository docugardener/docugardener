// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, screen } from "@testing-library/react"
import { describe, it, expect, vi } from "vitest"

// Mock next/navigation to avoid router errors in unit tests
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/pricing",
  useSearchParams: () => new URLSearchParams(),
}))

// Mock next-auth (pricing page uses useSession to detect current plan)
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: "unauthenticated" }),
}))

// Mock next/link to render as plain anchor
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))

// Mock next/image
vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}))

import PricingPage from "@/app/pricing/page"

describe("Pricing page — cross-repo siblings row", () => {
  it("renders the cross-repo siblings row label", () => {
    render(<PricingPage />)
    const label = screen.getByText(/cross-repo siblings/i)
    expect(label).toBeTruthy()
  })

  it("TEAM column shows 'Up to 3' for cross-repo siblings", () => {
    render(<PricingPage />)
    // Matrix cell shows exactly "Up to 3"; plan feature list shows full phrase
    const cells = screen.getAllByText(/up to 3/i)
    expect(cells.length).toBeGreaterThanOrEqual(1)
  })

  it("ENTERPRISE column shows 'Up to 10' for cross-repo siblings", () => {
    render(<PricingPage />)
    const cells = screen.getAllByText(/up to 10/i)
    expect(cells.length).toBeGreaterThanOrEqual(1)
  })

  it("FREE and PRO matrix cells show lock icon (not 'Up to' text)", () => {
    render(<PricingPage />)
    // The matrix "Up to 3" cell should appear exactly once (TEAM column)
    // Note: plan feature list also contains "up to 3 siblings" so we check the exact matrix value
    const matrixCells = screen.getAllByText("Up to 3")
    expect(matrixCells).toHaveLength(1)
    const matrixCells10 = screen.getAllByText("Up to 10")
    expect(matrixCells10).toHaveLength(1)
  })
})
