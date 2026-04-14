/**
 * GTM-01: PRO Trial API — Next.js layer tests.
 *
 * Groups:
 *   A. GET /api/billing/trial  — auth, trial status payload
 *   B. POST /api/billing/trial — auth, role check, activation, idempotency
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

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

const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined)
vi.mock("@/lib/audit", () => ({
    writeAuditLog: (...args: any[]) => mockWriteAuditLog(...args),
    AuditEvent: { TRIAL_STARTED: "TRIAL_STARTED", TRIAL_EXPIRED: "TRIAL_EXPIRED" },
    getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}))

const mockGetServerSession = vi.fn()
vi.mock("next-auth", () => ({ getServerSession: mockGetServerSession }))
vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }))

// ── Session helpers ───────────────────────────────────────────────────────────

function adminSession(tenantId = "t-1") {
    return { user: { id: "u-admin", email: "admin@test.com", role: "ADMIN", tenantId } }
}

function viewerSession() {
    return { user: { id: "u-1", email: "viewer@test.com", role: "VIEWER", tenantId: "t-1" } }
}

// ── A. GET /api/billing/trial ─────────────────────────────────────────────────

describe("GET /api/billing/trial", () => {
    beforeEach(() => { vi.resetModules(); vi.resetAllMocks() })

    it("returns 401 when unauthenticated", async () => {
        mockGetServerSession.mockResolvedValue(null)
        const { GET } = await import("@/app/api/billing/trial/route")
        const res = await GET(new Request("http://localhost/api/billing/trial"))
        expect(res.status).toBe(401)
    })

    it("returns trial status with no trial started", async () => {
        mockGetServerSession.mockResolvedValue(adminSession())
        mockFindUnique.mockResolvedValue({ plan: "FREE", trialExpiresAt: null })

        const { GET } = await import("@/app/api/billing/trial/route")
        const res = await GET(new Request("http://localhost/api/billing/trial"))
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.isActive).toBe(false)
        expect(body.isExpired).toBe(false)
        expect(body.alreadyUsed).toBe(false)
        expect(body.plan).toBe("FREE")
    })

    it("returns isActive:true when trial is in the future", async () => {
        mockGetServerSession.mockResolvedValue(adminSession())
        const future = new Date(Date.now() + 7 * 86_400_000)
        mockFindUnique.mockResolvedValue({ plan: "FREE", trialExpiresAt: future })

        const { GET } = await import("@/app/api/billing/trial/route")
        const res = await GET(new Request("http://localhost/api/billing/trial"))
        const body = await res.json()
        expect(body.isActive).toBe(true)
        expect(body.isExpired).toBe(false)
        expect(body.alreadyUsed).toBe(true)
        expect(body.daysRemaining).toBeGreaterThan(0)
    })

    it("returns isExpired:true when trial is in the past", async () => {
        mockGetServerSession.mockResolvedValue(adminSession())
        const past = new Date(Date.now() - 2 * 86_400_000)
        mockFindUnique.mockResolvedValue({ plan: "FREE", trialExpiresAt: past })

        const { GET } = await import("@/app/api/billing/trial/route")
        const res = await GET(new Request("http://localhost/api/billing/trial"))
        const body = await res.json()
        expect(body.isActive).toBe(false)
        expect(body.isExpired).toBe(true)
        expect(body.daysRemaining).toBe(0)
    })
})

// ── B. POST /api/billing/trial ────────────────────────────────────────────────

describe("POST /api/billing/trial", () => {
    beforeEach(() => { vi.resetModules(); vi.resetAllMocks() })

    it("returns 401 when unauthenticated", async () => {
        mockGetServerSession.mockResolvedValue(null)
        const { POST } = await import("@/app/api/billing/trial/route")
        const res = await POST(new Request("http://localhost/api/billing/trial", { method: "POST" }))
        expect(res.status).toBe(401)
    })

    it("returns 403 for VIEWER role", async () => {
        mockGetServerSession.mockResolvedValue(viewerSession())
        const { POST } = await import("@/app/api/billing/trial/route")
        const res = await POST(new Request("http://localhost/api/billing/trial", { method: "POST" }))
        expect(res.status).toBe(403)
        const body = await res.json()
        expect(body.error).toBe("forbidden")
    })

    it("returns 400 when tenant is not FREE plan", async () => {
        mockGetServerSession.mockResolvedValue(adminSession())
        mockFindUnique.mockResolvedValue({ plan: "PRO", trialExpiresAt: null })

        const { POST } = await import("@/app/api/billing/trial/route")
        const res = await POST(new Request("http://localhost/api/billing/trial", { method: "POST" }))
        expect(res.status).toBe(400)
        const body = await res.json()
        expect(body.error).toBe("trial_unavailable")
    })

    it("returns 409 when trial was already used", async () => {
        mockGetServerSession.mockResolvedValue(adminSession())
        // Trial already set (even if expired)
        const past = new Date(Date.now() - 86_400_000)
        mockFindUnique.mockResolvedValue({ plan: "FREE", trialExpiresAt: past })

        const { POST } = await import("@/app/api/billing/trial/route")
        const res = await POST(new Request("http://localhost/api/billing/trial", { method: "POST" }))
        expect(res.status).toBe(409)
        const body = await res.json()
        expect(body.error).toBe("trial_already_used")
    })

    it("activates trial for eligible FREE tenant", async () => {
        mockGetServerSession.mockResolvedValue(adminSession())
        mockFindUnique.mockResolvedValue({ plan: "FREE", trialExpiresAt: null })
        mockUpdate.mockResolvedValue({ plan: "FREE", trialExpiresAt: new Date(Date.now() + 14 * 86_400_000) })

        const { POST } = await import("@/app/api/billing/trial/route")
        const res = await POST(new Request("http://localhost/api/billing/trial", { method: "POST" }))
        expect(res.status).toBe(201)
        const body = await res.json()
        expect(body.isActive).toBe(true)
        expect(body.alreadyUsed).toBe(true)
        expect(body.daysRemaining).toBeGreaterThanOrEqual(13)
    })

    it("writes TRIAL_STARTED audit log on activation", async () => {
        mockGetServerSession.mockResolvedValue(adminSession())
        mockFindUnique.mockResolvedValue({ plan: "FREE", trialExpiresAt: null })
        mockUpdate.mockResolvedValue({})

        const { POST } = await import("@/app/api/billing/trial/route")
        await POST(new Request("http://localhost/api/billing/trial", { method: "POST" }))

        expect(mockWriteAuditLog).toHaveBeenCalledOnce()
        const auditCall = mockWriteAuditLog.mock.calls[0][0]
        expect(auditCall.event).toBe("TRIAL_STARTED")
        expect(auditCall.resourceType).toBe("tenant")
        expect(auditCall.metadata.trialDays).toBe(14)
    })

    it("sets trialExpiresAt ~14 days in the future", async () => {
        mockGetServerSession.mockResolvedValue(adminSession())
        mockFindUnique.mockResolvedValue({ plan: "FREE", trialExpiresAt: null })
        mockUpdate.mockResolvedValue({})

        const { POST } = await import("@/app/api/billing/trial/route")
        const before = Date.now()
        await POST(new Request("http://localhost/api/billing/trial", { method: "POST" }))
        const after = Date.now()

        const updateCall = mockUpdate.mock.calls[0][0]
        const expiresAt = new Date(updateCall.data.trialExpiresAt).getTime()
        const expectedMin = before + 13 * 86_400_000
        const expectedMax = after + 15 * 86_400_000
        expect(expiresAt).toBeGreaterThanOrEqual(expectedMin)
        expect(expiresAt).toBeLessThanOrEqual(expectedMax)
    })
})
