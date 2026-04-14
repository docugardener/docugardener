/**
 * RBAC Role Enforcement — cross-route role checks
 *
 * Covers:
 *   GET  /api/inbox               → ADMIN | VIEWER only
 *   GET  /api/inbox/[id]          → ADMIN | VIEWER only
 *   PATCH /api/inbox/[id]         → ADMIN only
 *   GET  /api/billing             → ADMIN | BILLING_ADMIN only
 *   GET  /api/billing/settings    → ADMIN | BILLING_ADMIN only
 *   GET  /api/stats/activity      → ADMIN | VIEWER | AUDITOR
 *   GET  /api/stats/summary       → ADMIN | VIEWER | AUDITOR
 *   GET  /api/users               → ADMIN only
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Shared mocks ──────────────────────────────────────────────────────────────

const mockGetServerSession = vi.fn()
vi.mock("next-auth", () => ({ getServerSession: mockGetServerSession }))
vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }))

const mockFindUnique = vi.fn()
const mockFindMany = vi.fn()
const mockCount = vi.fn()
vi.mock("@/lib/prisma", () => ({
    prisma: {
        tenant: { findUnique: (...a: any[]) => mockFindUnique(...a) },
        user: { findMany: (...a: any[]) => mockFindMany(...a), findUnique: (...a: any[]) => mockFindUnique(...a) },
        job: { findMany: (...a: any[]) => mockFindMany(...a), count: (...a: any[]) => mockCount(...a) },
        repository: { count: (...a: any[]) => mockCount(...a) },
    },
}))

vi.mock("@/lib/audit", () => ({
    writeAuditLog: vi.fn().mockResolvedValue(undefined),
    AuditEvent: { TRIAGE_DECISION: "TRIAGE_DECISION", POLICY_VIOLATION_DISMISSED: "POLICY_VIOLATION_DISMISSED" },
    getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}))

vi.mock("@/lib/billing", () => ({
    getPlanLimits: vi.fn().mockReturnValue({ seats: 5, prsPerMonth: 500 }),
    canAddUser: vi.fn().mockReturnValue(true),
}))

// ── Session helpers ────────────────────────────────────────────────────────────

function session(role: string, tenantId = "t-1") {
    return { user: { id: "u-1", email: "u@test.com", role, tenantId } }
}

const ROLES = ["ADMIN", "VIEWER", "AUDITOR", "BILLING_ADMIN"] as const
type Role = typeof ROLES[number]

// ── GET /api/inbox ────────────────────────────────────────────────────────────

describe("GET /api/inbox — ADMIN | VIEWER only", () => {
    beforeEach(() => { vi.resetModules(); vi.clearAllMocks() })

    const req = () => new Request("http://localhost/api/inbox") as any

    it.each([
        ["ADMIN",  200],
        ["VIEWER", 200],
        ["AUDITOR", 403],
        ["BILLING_ADMIN", 403],
    ] as [Role, number][])("%s → %i", async (role, expectedStatus) => {
        mockGetServerSession.mockResolvedValue(session(role))
        // fetch is called to backend — stub it
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve([]),
            status: 200,
        }) as any

        const { GET } = await import("@/app/api/inbox/route")
        const res = await GET(req())
        expect(res.status).toBe(expectedStatus)

        if (expectedStatus === 403) {
            const body = await res.json()
            expect(body.error).toBe("forbidden")
        }
    })
})

// ── GET /api/inbox/[id] ────────────────────────────────────────────────────────

describe("GET /api/inbox/[id] — ADMIN | VIEWER only", () => {
    beforeEach(() => { vi.resetModules(); vi.clearAllMocks() })

    const req = () => new Request("http://localhost/api/inbox/job-1") as any
    const params = () => Promise.resolve({ id: "job-1" })

    it.each([
        ["ADMIN",  200],
        ["VIEWER", 200],
        ["AUDITOR", 403],
        ["BILLING_ADMIN", 403],
    ] as [Role, number][])("%s → %i", async (role, expectedStatus) => {
        mockGetServerSession.mockResolvedValue(session(role))
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ id: "job-1" }),
            status: 200,
        }) as any

        const { GET } = await import("@/app/api/inbox/[id]/route")
        const res = await GET(req(), { params: params() })
        expect(res.status).toBe(expectedStatus)

        if (expectedStatus === 403) {
            const body = await res.json()
            expect(body.error).toBe("forbidden")
        }
    })
})

// ── PATCH /api/inbox/[id] ─────────────────────────────────────────────────────

describe("PATCH /api/inbox/[id] — ADMIN only", () => {
    beforeEach(() => { vi.resetModules(); vi.clearAllMocks() })

    const req = () => new Request("http://localhost/api/inbox/job-1?status=ACCEPTED", {
        method: "PATCH",
    }) as any
    const params = () => Promise.resolve({ id: "job-1" })

    it.each([
        ["ADMIN",        200],
        ["VIEWER",       403],
        ["AUDITOR",      403],
        ["BILLING_ADMIN",403],
    ] as [Role, number][])("%s → %i", async (role, expectedStatus) => {
        mockGetServerSession.mockResolvedValue(session(role))
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ id: "job-1", status: "ACCEPTED" }),
            status: 200,
        }) as any

        const { PATCH } = await import("@/app/api/inbox/[id]/route")
        const res = await PATCH(req(), { params: params() })
        expect(res.status).toBe(expectedStatus)

        if (expectedStatus === 403) {
            const body = await res.json()
            expect(body.error).toBe("forbidden")
        }
    })
})

// ── GET /api/billing ─────────────────────────────────────────────────────────

describe("GET /api/billing — ADMIN | BILLING_ADMIN only", () => {
    beforeEach(() => { vi.resetModules(); vi.clearAllMocks() })

    const req = () => new Request("http://localhost/api/billing") as any

    it.each([
        ["ADMIN",         200],
        ["BILLING_ADMIN", 200],
        ["VIEWER",        403],
        ["AUDITOR",       403],
    ] as [Role, number][])("%s → %i", async (role, expectedStatus) => {
        mockGetServerSession.mockResolvedValue(session(role))
        mockFindMany.mockResolvedValue([])
        mockCount.mockResolvedValue(0)
        mockFindUnique.mockResolvedValue({ billingConfig: {}, plan: "PRO" })

        const { GET } = await import("@/app/api/billing/route")
        const res = await GET()
        expect(res.status).toBe(expectedStatus)

        if (expectedStatus === 403) {
            const body = await res.json()
            expect(body.error).toBe("forbidden")
        }
    })
})

// ── GET /api/billing/settings ─────────────────────────────────────────────────

describe("GET /api/billing/settings — ADMIN | BILLING_ADMIN only", () => {
    beforeEach(() => { vi.resetModules(); vi.clearAllMocks() })

    it.each([
        ["ADMIN",         200],
        ["BILLING_ADMIN", 200],
        ["VIEWER",        403],
        ["AUDITOR",       403],
    ] as [Role, number][])("%s → %i", async (role, expectedStatus) => {
        mockGetServerSession.mockResolvedValue(session(role))
        mockFindUnique.mockResolvedValue({ billingConfig: { monthlyBudgetUsd: 100 } })

        const { GET } = await import("@/app/api/billing/settings/route")
        const res = await GET()
        expect(res.status).toBe(expectedStatus)

        if (expectedStatus === 403) {
            const body = await res.json()
            expect(body.error).toBe("forbidden")
        }
    })
})

// ── GET /api/stats/activity ───────────────────────────────────────────────────

describe("GET /api/stats/activity — ADMIN | VIEWER | AUDITOR", () => {
    beforeEach(() => { vi.resetModules(); vi.clearAllMocks() })

    const req = () => new Request("http://localhost/api/stats/activity") as any

    it.each([
        ["ADMIN",         200],
        ["VIEWER",        200],
        ["AUDITOR",       200],
        ["BILLING_ADMIN", 403],
    ] as [Role, number][])("%s → %i", async (role, expectedStatus) => {
        mockGetServerSession.mockResolvedValue(session(role))
        mockFindMany.mockResolvedValue([])

        const { GET } = await import("@/app/api/stats/activity/route")
        const res = await GET()
        expect(res.status).toBe(expectedStatus)

        if (expectedStatus === 403) {
            const body = await res.json()
            expect(body.error).toBe("forbidden")
        }
    })
})

// ── GET /api/stats/summary ────────────────────────────────────────────────────

describe("GET /api/stats/summary — ADMIN | VIEWER | AUDITOR", () => {
    beforeEach(() => { vi.resetModules(); vi.clearAllMocks() })

    it.each([
        ["ADMIN",         200],
        ["VIEWER",        200],
        ["AUDITOR",       200],
        ["BILLING_ADMIN", 403],
    ] as [Role, number][])("%s → %i", async (role, expectedStatus) => {
        mockGetServerSession.mockResolvedValue(session(role))
        mockCount.mockResolvedValue(0)
        mockFindMany.mockResolvedValue([])

        const { GET } = await import("@/app/api/stats/summary/route")
        const res = await GET()
        expect(res.status).toBe(expectedStatus)

        if (expectedStatus === 403) {
            const body = await res.json()
            expect(body.error).toBe("forbidden")
        }
    })
})

// ── GET /api/users ────────────────────────────────────────────────────────────

describe("GET /api/users — ADMIN only", () => {
    beforeEach(() => { vi.resetModules(); vi.clearAllMocks() })

    const req = () => new Request("http://localhost/api/users") as any

    it.each([
        ["ADMIN",         200],
        ["VIEWER",        403],
        ["AUDITOR",       403],
        ["BILLING_ADMIN", 403],
    ] as [Role, number][])("%s → %i", async (role, expectedStatus) => {
        mockGetServerSession.mockResolvedValue(session(role))
        mockFindMany.mockResolvedValue([])
        mockFindUnique.mockResolvedValue({ plan: "PRO" })

        const { GET } = await import("@/app/api/users/route")
        const res = await GET(req())
        expect(res.status).toBe(expectedStatus)

        if (expectedStatus === 403) {
            const body = await res.json()
            expect(body.error).toBe("forbidden")
        }
    })
})
