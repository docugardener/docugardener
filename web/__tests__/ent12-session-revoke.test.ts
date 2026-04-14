/**
 * Tests for POST /api/admin/sessions (session revocation)
 *
 * Covers:
 *   A. Auth — 401 unauthenticated, 403 non-ADMIN
 *   B. Success — sets sessionsRevokedAt and returns revokedAt
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockUpdate = vi.fn()
const mockFindMany = vi.fn()
const mockCreate = vi.fn()
vi.mock("@/lib/prisma", () => ({
    prisma: {
        tenant: { update: mockUpdate },
        auditLog: { findMany: mockFindMany, create: mockCreate },
    },
}))

const mockGetServerSession = vi.fn()
vi.mock("next-auth", () => ({ getServerSession: mockGetServerSession }))
vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }))
vi.mock("@/lib/audit", () => ({
    writeAuditLog: vi.fn().mockResolvedValue(undefined),
    AuditEvent: { SESSIONS_REVOKED: "SESSIONS_REVOKED" },
}))

// ── A. Auth ────────────────────────────────────────────────────────────────────

describe("POST /api/admin/sessions — auth", () => {
    beforeEach(() => { vi.resetModules(); vi.resetAllMocks() })

    it("returns 401 when not authenticated", async () => {
        mockGetServerSession.mockResolvedValue(null)
        const { POST } = await import("@/app/api/admin/sessions/route")
        const res = await POST(new Request("http://localhost/api/admin/sessions", { method: "POST" }))
        expect(res.status).toBe(401)
    })

    it("returns 403 for VIEWER role", async () => {
        mockGetServerSession.mockResolvedValue({
            user: { id: "u-1", email: "v@test.com", role: "VIEWER", tenantId: "t-1" },
        })
        const { POST } = await import("@/app/api/admin/sessions/route")
        const res = await POST(new Request("http://localhost/api/admin/sessions", { method: "POST" }))
        expect(res.status).toBe(403)
    })

    it("returns 403 for AUDITOR role", async () => {
        mockGetServerSession.mockResolvedValue({
            user: { id: "u-1", email: "a@test.com", role: "AUDITOR", tenantId: "t-1" },
        })
        const { POST } = await import("@/app/api/admin/sessions/route")
        const res = await POST(new Request("http://localhost/api/admin/sessions", { method: "POST" }))
        expect(res.status).toBe(403)
    })
})

// ── B. Success ─────────────────────────────────────────────────────────────────

describe("POST /api/admin/sessions — success", () => {
    beforeEach(() => { vi.resetModules(); vi.resetAllMocks() })

    it("updates sessionsRevokedAt and returns revokedAt", async () => {
        mockGetServerSession.mockResolvedValue({
            user: { id: "u-admin", email: "admin@test.com", role: "ADMIN", tenantId: "t-1" },
        })
        mockUpdate.mockResolvedValue({ id: "t-1" })
        mockFindMany.mockResolvedValue([])
        mockCreate.mockResolvedValue({})

        const { POST } = await import("@/app/api/admin/sessions/route")
        const res = await POST(new Request("http://localhost/api/admin/sessions", { method: "POST" }))
        expect(res.status).toBe(200)

        const data = await res.json()
        expect(data).toHaveProperty("revokedAt")
        expect(new Date(data.revokedAt).getTime()).toBeGreaterThan(0)

        expect(mockUpdate).toHaveBeenCalledWith({
            where: { id: "t-1" },
            data: { sessionsRevokedAt: expect.any(Date) },
        })
    })
})
