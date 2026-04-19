/**
 * I-02: Stripe Checkout & Portal API tests.
 *
 * AC-I02-1   POST /api/billing/checkout returns 401 when not authenticated
 * AC-I02-2   POST /api/billing/checkout returns 403 for non-ADMIN role
 * AC-I02-3   POST /api/billing/checkout returns 400 for missing/invalid plan
 * AC-I02-4   POST /api/billing/checkout creates Stripe Customer when none exists
 * AC-I02-5   POST /api/billing/checkout reuses existing stripeCustomerId
 * AC-I02-6   POST /api/billing/checkout returns checkout URL (no existing subscription)
 * AC-I02-7   POST /api/billing/checkout upgrades in-place when active subscription exists
 * AC-I02-8   POST /api/billing/checkout creates new checkout when subscription is cancel_at_period_end
 * AC-I02-9   POST /api/billing/portal returns 401 when not authenticated
 * AC-I02-10  POST /api/billing/portal returns 403 for non-ADMIN role
 * AC-I02-11  POST /api/billing/portal returns 400 when no stripeCustomerId set
 * AC-I02-12  POST /api/billing/portal returns portal URL
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { POST as checkoutPOST } from "@/app/api/billing/checkout/route"
import { POST as portalPOST } from "@/app/api/billing/portal/route"

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockFindUnique = vi.fn()
const mockUpdate = vi.fn()

vi.mock("@/lib/prisma", () => ({
    prisma: {
        tenant: {
            findUnique: (...args: any[]) => mockFindUnique(...args),
            update: (...args: any[]) => mockUpdate(...args),
        },
    },
}))

vi.mock("next-auth", () => ({
    getServerSession: vi.fn(),
}))

vi.mock("@/app/api/auth/[...nextauth]/route", () => ({
    authOptions: {},
}))

const mockStripeCustomersCreate = vi.fn()
const mockStripeCheckoutCreate = vi.fn()
const mockStripePortalCreate = vi.fn()
const mockStripeSubscriptionsList = vi.fn()
const mockStripeSubscriptionsUpdate = vi.fn()

const mockStripeInstance = {
    customers: { create: (...args: any[]) => mockStripeCustomersCreate(...args) },
    checkout: { sessions: { create: (...args: any[]) => mockStripeCheckoutCreate(...args) } },
    billingPortal: { sessions: { create: (...args: any[]) => mockStripePortalCreate(...args) } },
    subscriptions: {
        list: (...args: any[]) => mockStripeSubscriptionsList(...args),
        update: (...args: any[]) => mockStripeSubscriptionsUpdate(...args),
    },
}

vi.mock("@/lib/stripe", () => ({
    // HYB-05: stripe export replaced by getStripe() factory
    getStripe: () => mockStripeInstance,
    STRIPE_PRICE_IDS: {
        pro: "price_pro_test",
        team: "price_team_test",
    },
}))

import { getServerSession } from "next-auth"
const mockGetServerSession = vi.mocked(getServerSession)

// ── Helpers ───────────────────────────────────────────────────────────────────

function adminSession() {
    return {
        user: {
            id: "user-1",
            email: "admin@test.com",
            tenantId: "tenant-123",
            role: "ADMIN",
            plan: "FREE",
        },
    }
}

function viewerSession() {
    return {
        user: {
            id: "user-2",
            email: "viewer@test.com",
            tenantId: "tenant-123",
            role: "VIEWER",
            plan: "FREE",
        },
    }
}

function makeTenant(overrides: Record<string, any> = {}) {
    return { id: "tenant-123", name: "Acme Corp", stripeCustomerId: null, ...overrides }
}

/** Stripe subscriptions.list response with no active subscriptions */
function noSubscriptions() {
    return { data: [] }
}

/** Active subscription not scheduled to cancel */
function activeSubscription(priceId = "price_pro_test") {
    return {
        data: [{
            id: "sub_active123",
            cancel_at_period_end: false,
            items: { data: [{ id: "si_item123", price: { id: priceId } }] },
        }],
    }
}

/** Subscription scheduled to cancel at period end */
function cancellingSubscription() {
    return {
        data: [{
            id: "sub_cancelling123",
            cancel_at_period_end: true,
            items: { data: [{ id: "si_item123", price: { id: "price_pro_test" } }] },
        }],
    }
}

function makeRequest(body: unknown) {
    return new Request("http://localhost/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    })
}

// ── Checkout Tests ─────────────────────────────────────────────────────────────

describe("POST /api/billing/checkout", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.stubEnv("BILLING_ENABLED", "true")
        mockStripeCustomersCreate.mockResolvedValue({ id: "cus_new123" })
        mockStripeCheckoutCreate.mockResolvedValue({ url: "https://checkout.stripe.com/session123" })
        mockStripeSubscriptionsList.mockResolvedValue(noSubscriptions())
        mockStripeSubscriptionsUpdate.mockResolvedValue({ id: "sub_active123", status: "active" })
        mockUpdate.mockResolvedValue({})
    })

    it("AC-I02-1: returns 401 when not authenticated", async () => {
        mockGetServerSession.mockResolvedValue(null)
        const res = await checkoutPOST(makeRequest({ plan: "pro" }))
        expect(res.status).toBe(401)
    })

    it("AC-I02-2: returns 403 for non-ADMIN role", async () => {
        mockGetServerSession.mockResolvedValue(viewerSession() as any)
        mockFindUnique.mockResolvedValue(makeTenant())
        const res = await checkoutPOST(makeRequest({ plan: "pro" }))
        expect(res.status).toBe(403)
    })

    it("AC-I02-3: returns 400 for missing plan", async () => {
        mockGetServerSession.mockResolvedValue(adminSession() as any)
        mockFindUnique.mockResolvedValue(makeTenant())
        const res = await checkoutPOST(makeRequest({}))
        expect(res.status).toBe(400)
        const data = await res.json()
        expect(data.error).toMatch(/plan/i)
    })

    it("AC-I02-3: returns 400 for invalid plan value", async () => {
        mockGetServerSession.mockResolvedValue(adminSession() as any)
        mockFindUnique.mockResolvedValue(makeTenant())
        const res = await checkoutPOST(makeRequest({ plan: "enterprise" }))
        expect(res.status).toBe(400)
    })

    it("AC-I02-4: creates Stripe Customer when none exists and saves ID", async () => {
        mockGetServerSession.mockResolvedValue(adminSession() as any)
        mockFindUnique.mockResolvedValue(makeTenant({ stripeCustomerId: null }))

        const res = await checkoutPOST(makeRequest({ plan: "pro" }))
        expect(res.status).toBe(200)

        expect(mockStripeCustomersCreate).toHaveBeenCalledOnce()
        expect(mockStripeCustomersCreate.mock.calls[0][0]).toMatchObject({
            metadata: { tenantId: "tenant-123" },
        })
        expect(mockUpdate).toHaveBeenCalledOnce()
        expect(mockUpdate.mock.calls[0][0].data.stripeCustomerId).toBe("cus_new123")
    })

    it("AC-I02-5: reuses existing stripeCustomerId without creating a new customer", async () => {
        mockGetServerSession.mockResolvedValue(adminSession() as any)
        mockFindUnique.mockResolvedValue(makeTenant({ stripeCustomerId: "cus_existing" }))

        await checkoutPOST(makeRequest({ plan: "pro" }))

        expect(mockStripeCustomersCreate).not.toHaveBeenCalled()
        expect(mockUpdate).not.toHaveBeenCalled()
    })

    it("AC-I02-6: returns checkout URL when no existing subscription", async () => {
        mockGetServerSession.mockResolvedValue(adminSession() as any)
        mockFindUnique.mockResolvedValue(makeTenant({ stripeCustomerId: "cus_existing" }))
        mockStripeSubscriptionsList.mockResolvedValue(noSubscriptions())

        const res = await checkoutPOST(makeRequest({ plan: "pro" }))
        expect(res.status).toBe(200)
        const data = await res.json()
        expect(data.url).toBe("https://checkout.stripe.com/session123")
        expect(mockStripeCheckoutCreate).toHaveBeenCalledOnce()
        expect(mockStripeSubscriptionsUpdate).not.toHaveBeenCalled()
    })

    it("AC-I02-7: upgrades in-place when active non-cancelling subscription exists", async () => {
        mockGetServerSession.mockResolvedValue(adminSession() as any)
        mockFindUnique.mockResolvedValue(makeTenant({ stripeCustomerId: "cus_existing" }))
        mockStripeSubscriptionsList.mockResolvedValue(activeSubscription("price_pro_test"))

        const res = await checkoutPOST(makeRequest({ plan: "team" }))
        expect(res.status).toBe(200)
        const data = await res.json()
        expect(data.upgraded).toBe(true)
        expect(data.url).toBeUndefined()

        // Updates existing subscription — no new checkout session
        expect(mockStripeSubscriptionsUpdate).toHaveBeenCalledOnce()
        expect(mockStripeSubscriptionsUpdate.mock.calls[0][0]).toBe("sub_active123")
        expect(mockStripeSubscriptionsUpdate.mock.calls[0][1].items[0].price).toBe("price_team_test")
        expect(mockStripeCheckoutCreate).not.toHaveBeenCalled()
    })

    it("DG-BIL-01-saas-path: SaaS mode calls Stripe directly — fetch to PlatformCloud never called", async () => {
        // DEPLOYMENT_MODE is not set in this describe block → SaaS path.
        // Confirms that the client_installed proxy branch is not accidentally
        // activated in SaaS mode, which would break SaaS customers' billing.
        vi.stubGlobal("fetch", vi.fn())
        mockGetServerSession.mockResolvedValue(adminSession() as any)
        mockFindUnique.mockResolvedValue(makeTenant({ stripeCustomerId: "cus_saas_test" }))
        mockStripeSubscriptionsList.mockResolvedValue(noSubscriptions())

        const res = await checkoutPOST(makeRequest({ plan: "pro" }))
        expect(res.status).toBe(200)

        // Stripe checkout session was created
        expect(mockStripeCheckoutCreate).toHaveBeenCalledOnce()
        // fetch (PC proxy) was NOT called
        expect(vi.mocked(global.fetch)).not.toHaveBeenCalled()

        vi.unstubAllGlobals()
    })

    it("AC-I02-8: creates new checkout when subscription is cancel_at_period_end", async () => {
        mockGetServerSession.mockResolvedValue(adminSession() as any)
        mockFindUnique.mockResolvedValue(makeTenant({ stripeCustomerId: "cus_existing" }))
        mockStripeSubscriptionsList.mockResolvedValue(cancellingSubscription())

        const res = await checkoutPOST(makeRequest({ plan: "pro" }))
        expect(res.status).toBe(200)
        const data = await res.json()

        // cancel_at_period_end treated as no active subscription → new checkout
        expect(data.url).toBe("https://checkout.stripe.com/session123")
        expect(mockStripeCheckoutCreate).toHaveBeenCalledOnce()
        expect(mockStripeSubscriptionsUpdate).not.toHaveBeenCalled()
    })
})

// ── DG-SAAS-09: client-installed proxy removed ────────────────────────────────

describe("DG-SAAS-09: client-installed proxy branch removed", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.stubEnv("BILLING_ENABLED", "true")
        vi.stubEnv("DEPLOYMENT_MODE", "client-installed")
        vi.stubGlobal("fetch", vi.fn())
    })

    afterEach(() => {
        vi.unstubAllEnvs()
        vi.unstubAllGlobals()
    })

    it("checkout: client-installed falls through to HYB-05 → billing_not_available (no PC proxy)", async () => {
        mockGetServerSession.mockResolvedValue(adminSession() as any)
        const res = await checkoutPOST(makeRequest({ plan: "pro" }))
        const data = await res.json()
        expect(data.error).toBe("billing_not_available")
        // PlatformCloud fetch must NOT be called
        expect(vi.mocked(global.fetch)).not.toHaveBeenCalled()
    })

    it("portal: client-installed falls through to HYB-05 → billing_not_available (no PC proxy)", async () => {
        mockGetServerSession.mockResolvedValue(adminSession() as any)
        const req = new Request("http://localhost/api/billing/portal", { method: "POST" })
        const res = await portalPOST(req)
        const data = await res.json()
        expect(data.error).toBe("billing_not_available")
        // PlatformCloud fetch must NOT be called
        expect(vi.mocked(global.fetch)).not.toHaveBeenCalled()
    })

    it("checkout source: DEPLOYMENT_MODE=client-installed string is absent from route", async () => {
        const { readFileSync } = await import("fs")
        const { join } = await import("path")
        const src = readFileSync(
            join(process.cwd(), "app/api/billing/checkout/route.ts"),
            "utf8",
        )
        expect(src).not.toContain("client-installed")
    })

    it("portal source: DEPLOYMENT_MODE=client-installed string is absent from route", async () => {
        const { readFileSync } = await import("fs")
        const { join } = await import("path")
        const src = readFileSync(
            join(process.cwd(), "app/api/billing/portal/route.ts"),
            "utf8",
        )
        expect(src).not.toContain("client-installed")
    })
})

// ── Portal Tests ──────────────────────────────────────────────────────────────

describe("POST /api/billing/portal", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockStripePortalCreate.mockResolvedValue({ url: "https://billing.stripe.com/portal123" })
    })

    it("AC-I02-9: returns 401 when not authenticated", async () => {
        mockGetServerSession.mockResolvedValue(null)
        const req = new Request("http://localhost/api/billing/portal", { method: "POST" })
        const res = await portalPOST(req)
        expect(res.status).toBe(401)
    })

    it("AC-I02-10: returns 403 for non-ADMIN role", async () => {
        mockGetServerSession.mockResolvedValue(viewerSession() as any)
        mockFindUnique.mockResolvedValue(makeTenant({ stripeCustomerId: "cus_existing" }))
        const req = new Request("http://localhost/api/billing/portal", { method: "POST" })
        const res = await portalPOST(req)
        expect(res.status).toBe(403)
    })

    it("AC-I02-11: returns 400 when no stripeCustomerId set", async () => {
        mockGetServerSession.mockResolvedValue(adminSession() as any)
        mockFindUnique.mockResolvedValue(makeTenant({ stripeCustomerId: null }))
        const req = new Request("http://localhost/api/billing/portal", { method: "POST" })
        const res = await portalPOST(req)
        expect(res.status).toBe(400)
        const data = await res.json()
        expect(data.error).toMatch(/subscription/i)
    })

    it("AC-I02-12: returns portal URL for subscribed customer", async () => {
        mockGetServerSession.mockResolvedValue(adminSession() as any)
        mockFindUnique.mockResolvedValue(makeTenant({ stripeCustomerId: "cus_existing" }))
        const req = new Request("http://localhost/api/billing/portal", { method: "POST" })
        const res = await portalPOST(req)
        expect(res.status).toBe(200)
        const data = await res.json()
        expect(data.url).toBe("https://billing.stripe.com/portal123")
        expect(mockStripePortalCreate.mock.calls[0][0]).toMatchObject({
            customer: "cus_existing",
        })
    })
})
