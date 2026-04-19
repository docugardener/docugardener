// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * DG-ALIGN-05 / DG-SAAS-09: PlatformCloud billing proxy removed.
 *
 * The original DG-ALIGN-05 tests verified that the `client-installed` proxy
 * forwarded an `interval` field to PlatformCloud. That proxy branch was deleted
 * as part of DG-SAAS-09 (PlatformCloud frozen 2026-03-30).
 *
 * These tests confirm:
 *   AC-SAAS09-01  client-installed mode returns billing_not_available (no PC call)
 *   AC-SAAS09-02  SaaS mode still returns a Stripe checkout URL
 *   AC-SAAS09-03  "client-installed" string absent from checkout route source
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockGetServerSession = vi.fn()
vi.mock("next-auth", () => ({ getServerSession: mockGetServerSession }))
vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }))

const mockFindUnique = vi.fn()
const mockUpdate = vi.fn()
vi.mock("@/lib/prisma", () => ({
    prisma: {
        tenant: {
            findUnique: (...a: any[]) => mockFindUnique(...a),
            update: (...a: any[]) => mockUpdate(...a),
        },
    },
}))

const mockCheckoutCreate = vi.fn()
const mockSubsList = vi.fn()
vi.mock("@/lib/stripe", () => ({
    getStripe: () => ({
        customers: { create: vi.fn().mockResolvedValue({ id: "cus_new" }) },
        checkout: { sessions: { create: (...a: any[]) => mockCheckoutCreate(...a) } },
        subscriptions: { list: (...a: any[]) => mockSubsList(...a) },
    }),
    STRIPE_PRICE_IDS: { pro: "price_pro", team: "price_team" },
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

function adminSession() {
    return { user: { id: "u-1", email: "admin@test.com", role: "ADMIN", tenantId: "t-1" } }
}

function makeReq(body: object) {
    return new Request("http://localhost/api/billing/checkout", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
    })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("DG-SAAS-09: PlatformCloud interval proxy removed from checkout", () => {
    beforeEach(() => {
        vi.resetModules()
        vi.clearAllMocks()
        vi.stubEnv("BILLING_ENABLED", "true")
        mockGetServerSession.mockResolvedValue(adminSession())
        vi.stubGlobal("fetch", vi.fn())
    })

    afterEach(() => {
        vi.unstubAllEnvs()
        vi.unstubAllGlobals()
    })

    it("AC-SAAS09-01: client-installed returns billing_not_available, fetch never called", async () => {
        vi.stubEnv("DEPLOYMENT_MODE", "client-installed")
        const { POST } = await import("@/app/api/billing/checkout/route")
        const res = await POST(makeReq({ plan: "pro", interval: "annual" }))
        const data = await res.json()

        expect(data.error).toBe("billing_not_available")
        // No outbound PC fetch should occur
        expect(vi.mocked(global.fetch)).not.toHaveBeenCalled()
    })

    it("AC-SAAS09-02: SaaS mode (no DEPLOYMENT_MODE) returns Stripe checkout URL", async () => {
        mockFindUnique.mockResolvedValue({ id: "t-1", name: "Acme", stripeCustomerId: "cus_existing" })
        mockSubsList.mockResolvedValue({ data: [] })
        mockCheckoutCreate.mockResolvedValue({ url: "https://checkout.stripe.com/saas-session" })

        const { POST } = await import("@/app/api/billing/checkout/route")
        const res = await POST(makeReq({ plan: "pro" }))
        const data = await res.json()

        expect(data.url).toBe("https://checkout.stripe.com/saas-session")
        expect(vi.mocked(global.fetch)).not.toHaveBeenCalled()
    })

    it("AC-SAAS09-03: checkout route source does not contain client-installed proxy code", async () => {
        const { readFileSync } = await import("fs")
        const { join } = await import("path")
        const src = readFileSync(
            join(process.cwd(), "app/api/billing/checkout/route.ts"),
            "utf8",
        )
        expect(src).not.toContain("client-installed")
        expect(src).not.toContain("PLATFORM_CLOUD_URL")
    })
})
