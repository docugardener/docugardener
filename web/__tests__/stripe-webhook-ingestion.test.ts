// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * DG-OWN-04: Stripe webhook → DB ingestion tests.
 *
 * Covers:
 *   A. POST /api/stripe/webhooks — rejects missing signature
 *   B. POST /api/stripe/webhooks — rejects invalid signature
 *   C. POST /api/stripe/webhooks — stores event for known types
 *   D. POST /api/stripe/webhooks — idempotent (duplicate events skipped)
 *   E. POST /api/stripe/webhooks — ignores unrecognized event types
 *   F. GET /api/admin/owner/events — reads from DB (no live Stripe call)
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockCreateEvent = vi.fn()
const mockStripeEventFindMany = vi.fn()
const mockStripeEventFindUnique = vi.fn()
const mockTenantFindMany = vi.fn().mockResolvedValue([])
// Alias used by tests that reference mockFindMany
const mockFindMany = mockStripeEventFindMany
const mockFindUnique = mockStripeEventFindUnique
vi.mock("@/lib/prisma", () => ({
    prisma: {
        stripeEvent: { create: mockCreateEvent, findMany: mockStripeEventFindMany, findUnique: mockStripeEventFindUnique },
        tenant: { findMany: mockTenantFindMany },
    },
}))

const mockConstructEvent = vi.fn()
const mockGetStripe = vi.fn(() => ({
    webhooks: { constructEvent: mockConstructEvent },
}))
vi.mock("@/lib/stripe", () => ({
    getStripe: mockGetStripe,
}))

const mockGetOwnerSession = vi.fn()
vi.mock("@/lib/owner-auth", () => ({ getOwnerSession: mockGetOwnerSession }))

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeWebhookRequest(body: string, sig: string = "t=1,v1=abc") {
    return new Request("http://localhost/api/stripe/webhooks", {
        method: "POST",
        headers: {
            "stripe-signature": sig,
            "Content-Type": "application/json",
        },
        body,
    })
}

const INVOICE_PAID_EVENT = {
    id: "evt_test_001",
    type: "invoice.payment_succeeded",
    created: 1700000000,
    data: {
        object: {
            customer: "cus_test_123",
            amount_paid: 2900,
            amount_due: 2900,
        },
    },
    livemode: false,
}

// ── A. Missing signature ──────────────────────────────────────────────────────

describe("A. Webhook — missing stripe-signature header", () => {
    beforeEach(() => { vi.resetModules(); vi.resetAllMocks() })

    it("returns 400 when stripe-signature header is absent", async () => {
        const { POST } = await import("@/app/api/stripe/webhooks/route")
        const req = new Request("http://localhost/api/stripe/webhooks", {
            method: "POST",
            body: JSON.stringify(INVOICE_PAID_EVENT),
        })
        const res = await POST(req)
        expect(res.status).toBe(400)
    })
})

// ── B. Invalid signature ──────────────────────────────────────────────────────

describe("B. Webhook — invalid signature", () => {
    beforeEach(() => { vi.resetModules(); vi.resetAllMocks() })

    it("returns 400 when constructEvent throws", async () => {
        mockGetStripe.mockReturnValueOnce({
            webhooks: { constructEvent: vi.fn().mockImplementation(() => { throw new Error("Signature mismatch") }) },
        })
        const { POST } = await import("@/app/api/stripe/webhooks/route")
        const res = await POST(makeWebhookRequest(JSON.stringify(INVOICE_PAID_EVENT), "invalid-sig"))
        expect(res.status).toBe(400)
    })
})

// ── C. Stores known event ─────────────────────────────────────────────────────

describe("C. Webhook — stores event for known types", () => {
    beforeEach(() => { vi.resetModules(); vi.resetAllMocks() })

    it("creates StripeEvent record for invoice.payment_succeeded", async () => {
        mockConstructEvent.mockReturnValueOnce(INVOICE_PAID_EVENT)
        mockFindUnique.mockResolvedValueOnce(null) // not a duplicate
        mockCreateEvent.mockResolvedValueOnce({ id: "evt_test_001" })
        mockGetStripe.mockReturnValueOnce({
            webhooks: { constructEvent: mockConstructEvent },
        })

        const { POST } = await import("@/app/api/stripe/webhooks/route")
        const res = await POST(makeWebhookRequest(JSON.stringify(INVOICE_PAID_EVENT)))
        expect(res.status).toBe(200)
        expect(mockCreateEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    id: "evt_test_001",
                    type: "invoice.payment_succeeded",
                    customerId: "cus_test_123",
                    amountCents: 2900,
                }),
            })
        )
    })

    it("returns 200 and stores checkout.session.completed event", async () => {
        const checkoutEvent = {
            id: "evt_test_002",
            type: "checkout.session.completed",
            created: 1700000001,
            data: { object: { customer: "cus_test_456", amount_total: 4900 } },
            livemode: false,
        }
        mockConstructEvent.mockReturnValueOnce(checkoutEvent)
        mockFindUnique.mockResolvedValueOnce(null)
        mockCreateEvent.mockResolvedValueOnce({ id: "evt_test_002" })
        mockGetStripe.mockReturnValueOnce({
            webhooks: { constructEvent: mockConstructEvent },
        })

        const { POST } = await import("@/app/api/stripe/webhooks/route")
        const res = await POST(makeWebhookRequest(JSON.stringify(checkoutEvent)))
        expect(res.status).toBe(200)
        expect(mockCreateEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    amountCents: 4900,
                }),
            })
        )
    })
})

// ── D. Idempotency ────────────────────────────────────────────────────────────

describe("D. Webhook — idempotent for duplicate events", () => {
    beforeEach(() => { vi.resetModules(); vi.resetAllMocks() })

    it("skips create and returns 200 if event already stored", async () => {
        mockConstructEvent.mockReturnValueOnce(INVOICE_PAID_EVENT)
        mockFindUnique.mockResolvedValueOnce({ id: "evt_test_001" }) // already exists
        mockGetStripe.mockReturnValueOnce({
            webhooks: { constructEvent: mockConstructEvent },
        })

        const { POST } = await import("@/app/api/stripe/webhooks/route")
        const res = await POST(makeWebhookRequest(JSON.stringify(INVOICE_PAID_EVENT)))
        expect(res.status).toBe(200)
        expect(mockCreateEvent).not.toHaveBeenCalled()
    })
})

// ── E. Unknown event types ────────────────────────────────────────────────────

describe("E. Webhook — ignores unrecognized event types", () => {
    beforeEach(() => { vi.resetModules(); vi.resetAllMocks() })

    it("returns 200 without storing for unknown event type", async () => {
        const unknownEvent = { id: "evt_test_003", type: "payment_intent.created", created: 1700000002, data: { object: {} }, livemode: false }
        mockConstructEvent.mockReturnValueOnce(unknownEvent)
        mockGetStripe.mockReturnValueOnce({
            webhooks: { constructEvent: mockConstructEvent },
        })

        const { POST } = await import("@/app/api/stripe/webhooks/route")
        const res = await POST(makeWebhookRequest(JSON.stringify(unknownEvent)))
        expect(res.status).toBe(200)
        expect(mockCreateEvent).not.toHaveBeenCalled()
    })
})

// ── F. Owner events feed reads from DB ───────────────────────────────────────

describe("F. Owner events feed — reads from DB", () => {
    beforeEach(() => {
        vi.resetModules()
        vi.resetAllMocks()
        // Restore default for tenant.findMany after resetAllMocks clears it
        mockTenantFindMany.mockResolvedValue([])
    })

    it("returns events from DB without calling stripe.events.list", async () => {
        mockGetOwnerSession.mockResolvedValueOnce({ user: { email: "owner@test.com" } })
        mockFindMany.mockResolvedValueOnce([
            {
                id: "evt_db_001",
                type: "invoice.payment_succeeded",
                customerId: "cus_123",
                amountCents: 2900,
                metadata: {},
                stripeUrl: "https://dashboard.stripe.com/test/events/evt_db_001",
                livemode: false,
                createdAt: new Date("2024-01-01T00:00:00Z"),
            },
        ])
        // prisma.tenant.findMany already mocked to return []

        const { GET } = await import("@/app/api/admin/owner/events/route")
        const req = new Request("http://localhost/api/admin/owner/events")
        const res = await GET(req as any)
        expect(res.status).toBe(200)
        const data = await res.json()
        expect(data.events).toHaveLength(1)
        expect(data.events[0].id).toBe("evt_db_001")
        // getStripe should NOT have been called
        expect(mockGetStripe).not.toHaveBeenCalled()
    })

    it("enriches events with tenant name and plan from DB", async () => {
        mockGetOwnerSession.mockResolvedValueOnce({ user: { email: "owner@test.com" } })
        mockFindMany.mockResolvedValueOnce([
            {
                id: "evt_db_002",
                type: "customer.subscription.created",
                customerId: "cus_456",
                amountCents: null,
                metadata: {},
                stripeUrl: "https://dashboard.stripe.com/test/events/evt_db_002",
                livemode: false,
                createdAt: new Date("2024-01-02T00:00:00Z"),
            },
        ])
        // Supply tenant data for enrichment via the shared mock
        mockTenantFindMany.mockResolvedValueOnce([
            { id: "t-1", name: "Acme Inc", plan: "TEAM", stripeCustomerId: "cus_456" },
        ])

        const { GET } = await import("@/app/api/admin/owner/events/route")
        const res = await GET(new Request("http://localhost/api/admin/owner/events") as any)
        const data = await res.json()
        expect(data.events[0].tenantName).toBe("Acme Inc")
        expect(data.events[0].tenantPlan).toBe("TEAM")
    })
})
