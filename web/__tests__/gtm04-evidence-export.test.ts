/**
 * GTM-04: Evidence Export MVP — API layer tests.
 *
 * Groups:
 *   A. Plan gating    — FREE and PRO blocked, TEAM allowed
 *   B. CSV format     — correct columns and encoding
 *   C. JSON format    — correct envelope structure
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockFindUnique = vi.fn()
const mockFindMany = vi.fn()
const mockJobFindMany = vi.fn()
vi.mock("@/lib/prisma", () => ({
    prisma: {
        tenant: { findUnique: (...args: any[]) => mockFindUnique(...args) },
        auditLog: { findMany: (...args: any[]) => mockFindMany(...args) },
        job: { findMany: (...args: any[]) => mockJobFindMany(...args) },
        repository: { findMany: vi.fn().mockResolvedValue([]) },
    },
}))

const mockGetServerSession = vi.fn()
vi.mock("next-auth", () => ({ getServerSession: mockGetServerSession }))
vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }))

// ── Helpers ───────────────────────────────────────────────────────────────────

function adminSession(tenantId = "t-1") {
    return { user: { id: "u-admin", email: "admin@test.com", role: "ADMIN", tenantId } }
}

function makeRequest(params: Record<string, string> = {}) {
    const url = new URL("http://localhost/api/audit/export")
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
    return new Request(url.toString())
}

const SAMPLE_LOG = {
    id: "log-1",
    createdAt: new Date("2026-03-01T10:00:00Z"),
    event: "TRIAGE_DECISION",
    actorEmail: "admin@test.com",
    actorIp: "1.2.3.4",
    resourceType: "job",
    resourceId: "job-abc",
    metadata: { action: "ACCEPTED" },
    hash: "abc123def456",
}

// EVID-01: job.findMany is called for row enrichment — default to empty array
beforeEach(() => { mockJobFindMany.mockResolvedValue([]) })

// ── A. Plan gating ────────────────────────────────────────────────────────────

describe("GET /api/audit/export — plan gate", () => {
    beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); mockJobFindMany.mockResolvedValue([]) })

    it("AC-4: FREE tenant receives 403 upgrade_required", async () => {
        mockGetServerSession.mockResolvedValue(adminSession())
        mockFindUnique.mockResolvedValue({ plan: "FREE" })

        const { GET } = await import("@/app/api/audit/export/route")
        const res = await GET(makeRequest())
        expect(res.status).toBe(403)
        const body = await res.json()
        expect(body.error).toBe("upgrade_required")
        expect(body.feature).toBe("evidence_export")
    })

    it("AC-4: PRO tenant receives 403 upgrade_required", async () => {
        mockGetServerSession.mockResolvedValue(adminSession())
        mockFindUnique.mockResolvedValue({ plan: "PRO" })

        const { GET } = await import("@/app/api/audit/export/route")
        const res = await GET(makeRequest())
        expect(res.status).toBe(403)
        const body = await res.json()
        expect(body.error).toBe("upgrade_required")
    })

    it("AC-4: TEAM tenant is allowed through (200)", async () => {
        mockGetServerSession.mockResolvedValue(adminSession("t-team"))
        mockFindUnique.mockResolvedValue({ plan: "TEAM" })
        mockFindMany.mockResolvedValue([SAMPLE_LOG])

        const { GET } = await import("@/app/api/audit/export/route")
        const res = await GET(makeRequest({ format: "json" }))
        expect(res.status).toBe(200)
    })
})

// ── B. CSV format ─────────────────────────────────────────────────────────────

describe("GET /api/audit/export — CSV format", () => {
    beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); mockJobFindMany.mockResolvedValue([]) })

    it("AC-1: CSV has correct header row and data row", async () => {
        mockGetServerSession.mockResolvedValue(adminSession("t-csv"))
        mockFindUnique.mockResolvedValue({ plan: "TEAM" })
        mockFindMany.mockResolvedValue([SAMPLE_LOG])

        const { GET } = await import("@/app/api/audit/export/route")
        const res = await GET(makeRequest({ format: "csv" }))
        expect(res.status).toBe(200)
        expect(res.headers.get("Content-Type")).toContain("text/csv")
        expect(res.headers.get("Content-Disposition")).toMatch(/attachment.*\.csv/)

        const text = await res.text()
        const [header, dataRow] = text.split("\n")
        expect(header).toContain("id")
        expect(header).toContain("event")
        expect(header).toContain("actorEmail")
        expect(header).toContain("hash")
        expect(dataRow).toContain("log-1")
        expect(dataRow).toContain("TRIAGE_DECISION")
        expect(dataRow).toContain("admin@test.com")
    })
})

// ── C. JSON format ────────────────────────────────────────────────────────────

describe("GET /api/audit/export — JSON format", () => {
    beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); mockJobFindMany.mockResolvedValue([]) })

    it("AC-2: JSON response has exportedAt, count, and logs array", async () => {
        mockGetServerSession.mockResolvedValue(adminSession("t-json"))
        mockFindUnique.mockResolvedValue({ plan: "TEAM" })
        mockFindMany.mockResolvedValue([SAMPLE_LOG])

        const { GET } = await import("@/app/api/audit/export/route")
        const res = await GET(makeRequest({ format: "json" }))
        expect(res.status).toBe(200)
        expect(res.headers.get("Content-Type")).toContain("application/json")
        expect(res.headers.get("Content-Disposition")).toMatch(/attachment.*\.json/)

        const body = await res.json()
        expect(body).toHaveProperty("exportedAt")
        expect(body).toHaveProperty("count", 1)
        expect(body.logs).toHaveLength(1)
        expect(body.logs[0].event).toBe("TRIAGE_DECISION")
        expect(body.logs[0].actorEmail).toBe("admin@test.com")
    })
})
