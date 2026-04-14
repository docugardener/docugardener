/**
 * DG-ALIGN-05: Billing proxy interval passthrough.
 *
 * Verifies that POST /api/billing/checkout (client_installed mode) forwards
 * the caller's `interval` field to PlatformCloud instead of hardcoding "monthly".
 *
 * AC-ALIGN05-01  interval from body is forwarded to PC
 * AC-ALIGN05-02  missing interval defaults to "monthly"
 * AC-ALIGN05-03  interval="annual" is forwarded correctly
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockGetServerSession = vi.fn()
vi.mock("next-auth", () => ({ getServerSession: mockGetServerSession }))
vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }))

const mockFindUnique = vi.fn()
vi.mock("@/lib/prisma", () => ({
    prisma: { tenant: { findUnique: (...a: any[]) => mockFindUnique(...a) } },
}))
vi.mock("@/lib/stripe", () => ({
    getStripe: vi.fn(),
    STRIPE_PRICE_IDS: {},
}))

// Capture what fetch receives
const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

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

describe("POST /api/billing/checkout — DG-ALIGN-05 interval passthrough (client_installed)", () => {
    beforeEach(() => {
        vi.resetModules()
        vi.clearAllMocks()
        mockGetServerSession.mockResolvedValue(adminSession())
        process.env.DEPLOYMENT_MODE = "client-installed"
        process.env.PLATFORM_CLOUD_URL = "http://platform.test"
        process.env.PLATFORM_CLOUD_TOKEN = "tok-123"
        process.env.LICENSE_KEY = "dg_lic_abc"
    })

    it("AC-ALIGN05-01: forwards caller-supplied interval to PlatformCloud", async () => {
        mockFetch.mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ checkout_url: "https://stripe.com/pay/annual" }),
        })

        const { POST } = await import("@/app/api/billing/checkout/route")
        await POST(makeReq({ plan: "pro", interval: "annual" }))

        expect(mockFetch).toHaveBeenCalledOnce()
        const [, opts] = mockFetch.mock.calls[0]
        const body = JSON.parse(opts.body)
        expect(body.interval).toBe("annual")
    })

    it("AC-ALIGN05-02: defaults to 'monthly' when interval is absent", async () => {
        mockFetch.mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ checkout_url: "https://stripe.com/pay/monthly" }),
        })

        const { POST } = await import("@/app/api/billing/checkout/route")
        await POST(makeReq({ plan: "pro" }))

        expect(mockFetch).toHaveBeenCalledOnce()
        const [, opts] = mockFetch.mock.calls[0]
        const body = JSON.parse(opts.body)
        expect(body.interval).toBe("monthly")
    })

    it("AC-ALIGN05-03: returns checkout URL from PC response", async () => {
        mockFetch.mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ checkout_url: "https://stripe.com/pay/xyz" }),
        })

        const { POST } = await import("@/app/api/billing/checkout/route")
        const res = await POST(makeReq({ plan: "team", interval: "annual" }))
        const data = await res.json()

        expect(data.url).toBe("https://stripe.com/pay/xyz")
    })
})
