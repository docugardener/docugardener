/**
 * GTM-03: Plan-Gating for Audit Log and Role Assignment.
 *
 * Groups:
 *   A. GET /api/audit         — FREE blocked, PRO allowed
 *   B. PATCH /api/users/[id]  — FREE cannot assign AUDITOR/BILLING_ADMIN, PRO can
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockFindUnique = vi.fn()
const mockFindMany = vi.fn()
const mockUpdate = vi.fn()
vi.mock("@/lib/prisma", () => ({
    prisma: {
        tenant: { findUnique: (...args: any[]) => mockFindUnique(...args) },
        auditLog: { findMany: (...args: any[]) => mockFindMany(...args) },
        user: {
            findUnique: (...args: any[]) => mockFindUnique(...args),
            update: (...args: any[]) => mockUpdate(...args),
        },
    },
}))

const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined)
vi.mock("@/lib/audit", () => ({
    writeAuditLog: (...args: any[]) => mockWriteAuditLog(...args),
    AuditEvent: { USER_ROLE_CHANGED: "USER_ROLE_CHANGED" },
    getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}))

const mockGetServerSession = vi.fn()
vi.mock("next-auth", () => ({ getServerSession: mockGetServerSession }))
vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }))

// ── Session helpers ───────────────────────────────────────────────────────────

function adminSession(tenantId = "t-1") {
    return { user: { id: "u-admin", email: "admin@test.com", role: "ADMIN", tenantId } }
}

function auditorSession() {
    return { user: { id: "u-aud", email: "auditor@test.com", role: "AUDITOR", tenantId: "t-1" } }
}

// ── A. GET /api/audit ─────────────────────────────────────────────────────────

describe("GET /api/audit — plan gate", () => {
    beforeEach(() => { vi.resetModules(); vi.resetAllMocks() })

    it("AC-1: FREE tenant receives 403 upgrade_required", async () => {
        mockGetServerSession.mockResolvedValue(adminSession())
        mockFindUnique.mockResolvedValue({ plan: "FREE" })

        const { GET } = await import("@/app/api/audit/route")
        const res = await GET(new Request("http://localhost/api/audit") as any)
        expect(res.status).toBe(403)
        const body = await res.json()
        expect(body.error).toBe("upgrade_required")
        expect(body.feature).toBe("audit_log")
    })

    it("AC-1: PRO tenant with ADMIN role receives audit log (200)", async () => {
        mockGetServerSession.mockResolvedValue(adminSession())
        mockFindUnique.mockResolvedValue({ plan: "PRO" })
        mockFindMany.mockResolvedValue([])

        const { GET } = await import("@/app/api/audit/route")
        const res = await GET(new Request("http://localhost/api/audit") as any)
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body).toHaveProperty("logs")
        expect(body).toHaveProperty("nextCursor")
    })
})

// ── B. PATCH /api/users/[id] ──────────────────────────────────────────────────

describe("PATCH /api/users/[id] — PRO-only role gate", () => {
    beforeEach(() => { vi.resetModules(); vi.resetAllMocks() })

    const makeRequest = (role: string) =>
        new Request("http://localhost/api/users/u-target", {
            method: "PATCH",
            body: JSON.stringify({ role }),
            headers: { "Content-Type": "application/json" },
        }) as any

    const makeParams = () => Promise.resolve({ id: "u-target" })

    it("AC-3: FREE tenant cannot assign AUDITOR role — 400 role_unavailable", async () => {
        mockGetServerSession.mockResolvedValue(adminSession())
        // findUnique called first for plan gate, then for target user existence check
        mockFindUnique
            .mockResolvedValueOnce({ plan: "FREE" })              // plan check
            .mockResolvedValueOnce({ id: "u-target", tenantId: "t-1", role: "VIEWER" }) // user lookup

        const { PATCH } = await import("@/app/api/users/[id]/route")
        const res = await PATCH(makeRequest("AUDITOR"), { params: makeParams() })
        expect(res.status).toBe(400)
        const body = await res.json()
        expect(body.error).toBe("role_unavailable")
        expect(body.plan).toBe("FREE")
    })

    it("AC-3: PRO tenant can assign AUDITOR role — 200", async () => {
        mockGetServerSession.mockResolvedValue(adminSession())
        mockFindUnique
            .mockResolvedValueOnce({ plan: "PRO" })               // plan check
            .mockResolvedValueOnce({ id: "u-target", tenantId: "t-1", role: "VIEWER" }) // user lookup
        mockUpdate.mockResolvedValue({ id: "u-target", role: "AUDITOR", tenantId: "t-1" })

        const { PATCH } = await import("@/app/api/users/[id]/route")
        const res = await PATCH(makeRequest("AUDITOR"), { params: makeParams() })
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.role).toBe("AUDITOR")
    })
})
