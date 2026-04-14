// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Landing page routing behaviour.
 *
 * Tests the three redirect paths in app/page.tsx:
 *  1. Self-hosted mode (NEXT_PUBLIC_DEPLOYMENT_MODE !== "saas")
 *     → redirect /auth/signin (no marketing page for private instances)
 *  2. SaaS + authenticated user with tenantId → redirect /dashboard
 *  3. SaaS + authenticated user without tenantId → redirect /onboarding
 *  4. SaaS + unauthenticated → renders landing page (no redirect)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// ── Shared mocks ──────────────────────────────────────────────────────────────

const mockRedirect = vi.fn()
const mockGetServerSession = vi.fn()

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    mockRedirect(url)
    throw new Error(`NEXT_REDIRECT:${url}`)
  },
}))

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }))

// Stub all marketing section components — they're tested in landing-page.test.tsx
vi.mock("@/components/marketing/MarketingHeader", () => ({ MarketingHeader: () => null }))
vi.mock("@/components/marketing/MarketingFooter", () => ({ MarketingFooter: () => null }))
vi.mock("@/components/home/HeroSection", () => ({ HeroSection: () => null }))
vi.mock("@/components/home/DemoSection", () => ({ DemoSection: () => null }))
vi.mock("@/components/home/HowItWorks", () => ({ HowItWorks: () => null }))
vi.mock("@/components/home/WhySaaS", () => ({ WhySaaS: () => null }))
vi.mock("@/components/home/PricingTeaser", () => ({ PricingTeaser: () => null }))
vi.mock("@/components/home/FeaturesTeaser", () => ({ FeaturesTeaser: () => null }))
vi.mock("@/components/home/SelfHostedCallout", () => ({ SelfHostedCallout: () => null }))
vi.mock("@/components/home/FAQTeaser", () => ({ FAQTeaser: () => null }))
vi.mock("@/components/home/SocialProof", () => ({ SocialProof: () => null }))

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("app/page.tsx routing", () => {
  const origMode = process.env.NEXT_PUBLIC_DEPLOYMENT_MODE

  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mockGetServerSession.mockResolvedValue(null)
  })

  afterEach(() => {
    process.env.NEXT_PUBLIC_DEPLOYMENT_MODE = origMode
  })

  // ── Self-hosted guard ────────────────────────────────────────────────────

  it("redirects to /auth/signin when DEPLOYMENT_MODE is not set (self-hosted default)", async () => {
    delete process.env.NEXT_PUBLIC_DEPLOYMENT_MODE
    const { default: Home } = await import("../app/page")
    await expect(Home()).rejects.toThrow("NEXT_REDIRECT:/auth/signin")
    expect(mockRedirect).toHaveBeenCalledWith("/auth/signin")
    // Must NOT call getServerSession — redirect happens before auth check
    expect(mockGetServerSession).not.toHaveBeenCalled()
  })

  it("redirects to /auth/signin when DEPLOYMENT_MODE=selfhosted", async () => {
    process.env.NEXT_PUBLIC_DEPLOYMENT_MODE = "selfhosted"
    const { default: Home } = await import("../app/page")
    await expect(Home()).rejects.toThrow("NEXT_REDIRECT:/auth/signin")
    expect(mockRedirect).toHaveBeenCalledWith("/auth/signin")
  })

  it("redirects to /auth/signin when DEPLOYMENT_MODE=air-gap", async () => {
    process.env.NEXT_PUBLIC_DEPLOYMENT_MODE = "air-gap"
    const { default: Home } = await import("../app/page")
    await expect(Home()).rejects.toThrow("NEXT_REDIRECT:/auth/signin")
    expect(mockRedirect).toHaveBeenCalledWith("/auth/signin")
  })

  // ── SaaS mode — authenticated paths ─────────────────────────────────────

  it("redirects authenticated user with tenantId to /dashboard in saas mode", async () => {
    process.env.NEXT_PUBLIC_DEPLOYMENT_MODE = "saas"
    mockGetServerSession.mockResolvedValue({
      user: { email: "user@test.com", tenantId: "t-1" },
    })
    const { default: Home } = await import("../app/page")
    await expect(Home()).rejects.toThrow("NEXT_REDIRECT:/dashboard")
    expect(mockRedirect).toHaveBeenCalledWith("/dashboard")
  })

  it("redirects authenticated user without tenantId to /onboarding in saas mode", async () => {
    process.env.NEXT_PUBLIC_DEPLOYMENT_MODE = "saas"
    mockGetServerSession.mockResolvedValue({
      user: { email: "user@test.com" }, // no tenantId
    })
    const { default: Home } = await import("../app/page")
    await expect(Home()).rejects.toThrow("NEXT_REDIRECT:/onboarding")
    expect(mockRedirect).toHaveBeenCalledWith("/onboarding")
  })

  // ── SaaS mode — unauthenticated ──────────────────────────────────────────

  it("does NOT redirect when saas mode + no session — renders landing page", async () => {
    process.env.NEXT_PUBLIC_DEPLOYMENT_MODE = "saas"
    mockGetServerSession.mockResolvedValue(null)
    const { default: Home } = await import("../app/page")
    // Should not throw — renders landing page JSX
    await expect(Home()).resolves.not.toThrow()
    expect(mockRedirect).not.toHaveBeenCalled()
  })
})
