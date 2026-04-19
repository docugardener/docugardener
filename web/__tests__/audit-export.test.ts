/**
 * Tests for GET /api/audit/export
 *
 * Covers:
 *   A. CSV format — header row, data rows, proper escaping
 *   B. JSON format — correct structure
 *   C. Auth enforcement — ADMIN and AUDITOR pass, VIEWER blocked
 *   D. Row limit respected (max 10k)
 *   E. from/to date filters passed to Prisma
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockFindMany = vi.fn()
const mockTenantFindUnique = vi.fn()
const mockJobFindMany = vi.fn()
vi.mock("@/lib/prisma", () => ({
    prisma: {
        auditLog: { findMany: mockFindMany },
        // GTM-04: plan gate added — default to TEAM so export tests pass through
        tenant: { findUnique: (...args: any[]) => mockTenantFindUnique(...args) },
        // EVID-01: job.findMany called for row enrichment
        job: { findMany: (...args: any[]) => mockJobFindMany(...args) },
        repository: { findMany: vi.fn().mockResolvedValue([]) },
    },
}))

const mockGetServerSession = vi.fn()
vi.mock("next-auth", () => ({ getServerSession: mockGetServerSession }))
vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }))

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeSession(role: string) {
    return { user: { role, tenantId: "t-1", email: "actor@test.com" } }
}

const BASE_LOG = {
    id: "log-1",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    event: "USER_LOGIN",
    actorEmail: "alice@test.com",
    actorIp: "1.2.3.4",
    resourceType: "user",
    resourceId: "u-1",
    metadata: { detail: "ok" },
    hash: "abc123",
}

// GTM-04: default tenant to TEAM so all pre-existing export tests pass through the plan gate
// EVID-01: default job mock to empty array (enrichment step)
beforeEach(() => {
    mockTenantFindUnique.mockResolvedValue({ plan: "TEAM" })
    mockJobFindMany.mockResolvedValue([])
})

async function callExport(url: string, role = "ADMIN") {
    mockGetServerSession.mockResolvedValue(makeSession(role))
    mockFindMany.mockResolvedValue([BASE_LOG])
    const { GET } = await import("@/app/api/audit/export/route")
    return GET(new Request(url))
}

// ── A. CSV format ──────────────────────────────────────────────────────────────

describe("GET /api/audit/export — CSV", () => {
    beforeEach(() => { vi.resetModules(); mockFindMany.mockReset() })

    it("returns 200 with text/csv content-type", async () => {
        const res = await callExport("http://localhost/api/audit/export?format=csv")
        expect(res.status).toBe(200)
        expect(res.headers.get("content-type")).toContain("text/csv")
    })

    it("includes Content-Disposition attachment header", async () => {
        const res = await callExport("http://localhost/api/audit/export")
        const disposition = res.headers.get("content-disposition") ?? ""
        expect(disposition).toContain("attachment")
        expect(disposition).toMatch(/filename="audit-log-.+\.csv"/)
    })

    it("CSV header row lists all columns", async () => {
        const res = await callExport("http://localhost/api/audit/export?format=csv")
        const text = await res.text()
        const header = text.split("\n")[0]
        expect(header).toContain("id")
        expect(header).toContain("event")
        expect(header).toContain("actorEmail")
        expect(header).toContain("hash")
    })

    it("CSV data row contains log values", async () => {
        const res = await callExport("http://localhost/api/audit/export?format=csv")
        const text = await res.text()
        expect(text).toContain("log-1")
        expect(text).toContain("USER_LOGIN")
        expect(text).toContain("alice@test.com")
    })

    it("escapes commas in metadata JSON", async () => {
        mockGetServerSession.mockResolvedValue(makeSession("ADMIN"))
        mockFindMany.mockResolvedValue([{ ...BASE_LOG, metadata: { a: "foo,bar" } }])
        const { GET } = await import("@/app/api/audit/export/route")
        const res = await GET(new Request("http://localhost/api/audit/export"))
        const text = await res.text()
        // metadata cell should be quoted
        expect(text).toContain('"')
    })
})

// ── B. JSON format ─────────────────────────────────────────────────────────────

describe("GET /api/audit/export — JSON", () => {
    beforeEach(() => { vi.resetModules(); mockFindMany.mockReset() })

    it("returns 200 with application/json content-type", async () => {
        const res = await callExport("http://localhost/api/audit/export?format=json")
        expect(res.status).toBe(200)
        expect(res.headers.get("content-type")).toContain("application/json")
    })

    it("JSON body has exportedAt, count, logs fields", async () => {
        const res = await callExport("http://localhost/api/audit/export?format=json")
        const data = await res.json()
        expect(data).toHaveProperty("exportedAt")
        expect(data).toHaveProperty("count", 1)
        expect(Array.isArray(data.logs)).toBe(true)
        expect(data.logs[0].id).toBe("log-1")
    })
})

// ── C. Auth enforcement ────────────────────────────────────────────────────────

describe("GET /api/audit/export — auth", () => {
    beforeEach(() => { vi.resetModules(); mockFindMany.mockReset() })

    it("returns 401 when not authenticated", async () => {
        mockGetServerSession.mockResolvedValue(null)
        const { GET } = await import("@/app/api/audit/export/route")
        const res = await GET(new Request("http://localhost/api/audit/export"))
        expect(res.status).toBe(401)
    })

    it("returns 403 for VIEWER role", async () => {
        const res = await callExport("http://localhost/api/audit/export", "VIEWER")
        expect(res.status).toBe(403)
    })

    it("returns 403 for BILLING_ADMIN role", async () => {
        const res = await callExport("http://localhost/api/audit/export", "BILLING_ADMIN")
        expect(res.status).toBe(403)
    })

    it("allows AUDITOR role", async () => {
        const res = await callExport("http://localhost/api/audit/export", "AUDITOR")
        expect(res.status).toBe(200)
    })
})

// ── D. Row limit ───────────────────────────────────────────────────────────────

describe("GET /api/audit/export — row limit", () => {
    beforeEach(() => { vi.resetModules(); mockFindMany.mockReset() })

    it("passes take: 10000 to Prisma", async () => {
        mockGetServerSession.mockResolvedValue(makeSession("ADMIN"))
        mockFindMany.mockResolvedValue([])
        const { GET } = await import("@/app/api/audit/export/route")
        await GET(new Request("http://localhost/api/audit/export"))
        expect(mockFindMany).toHaveBeenCalledWith(
            expect.objectContaining({ take: 10_000 })
        )
    })
})

// ── E. Date filters ────────────────────────────────────────────────────────────

describe("GET /api/audit/export — date filters", () => {
    beforeEach(() => { vi.resetModules(); mockFindMany.mockReset() })

    it("passes from/to as createdAt range to Prisma", async () => {
        mockGetServerSession.mockResolvedValue(makeSession("ADMIN"))
        mockFindMany.mockResolvedValue([])
        const { GET } = await import("@/app/api/audit/export/route")
        await GET(new Request("http://localhost/api/audit/export?from=2026-01-01&to=2026-03-01"))
        expect(mockFindMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    createdAt: expect.objectContaining({
                        gte: expect.any(Date),
                        lte: expect.any(Date),
                    }),
                }),
            })
        )
    })
})

// ── F. EPIC-06-GAP: HMAC export signing ───────────────────────────────────────

describe("GET /api/audit/export — HMAC signing (EPIC-06-GAP)", () => {
    const SIGNING_KEY = "test-signing-key-32chars-padded!!"

    beforeEach(() => {
        vi.resetModules()
        mockFindMany.mockReset()
        delete process.env.AUDIT_EXPORT_SIGNING_KEY
    })

    afterEach(() => {
        delete process.env.AUDIT_EXPORT_SIGNING_KEY
    })

    it("CSV: no signature header or comment when AUDIT_EXPORT_SIGNING_KEY not set", async () => {
        mockGetServerSession.mockResolvedValue(makeSession("ADMIN"))
        mockFindMany.mockResolvedValue([BASE_LOG])
        const { GET } = await import("@/app/api/audit/export/route")
        const res = await GET(new Request("http://localhost/api/audit/export?format=csv"))
        expect(res.headers.get("x-audit-export-signature")).toBeNull()
        const text = await res.text()
        expect(text).not.toContain("# x-audit-export-signature")
    })

    it("JSON: no signature header or field when AUDIT_EXPORT_SIGNING_KEY not set", async () => {
        mockGetServerSession.mockResolvedValue(makeSession("ADMIN"))
        mockFindMany.mockResolvedValue([BASE_LOG])
        const { GET } = await import("@/app/api/audit/export/route")
        const res = await GET(new Request("http://localhost/api/audit/export?format=json"))
        expect(res.headers.get("x-audit-export-signature")).toBeNull()
        const data = await res.json()
        expect(data).not.toHaveProperty("exportSignature")
    })

    it("CSV: X-Audit-Export-Signature header present when key configured", async () => {
        process.env.AUDIT_EXPORT_SIGNING_KEY = SIGNING_KEY
        mockGetServerSession.mockResolvedValue(makeSession("ADMIN"))
        mockFindMany.mockResolvedValue([BASE_LOG])
        const { GET } = await import("@/app/api/audit/export/route")
        const res = await GET(new Request("http://localhost/api/audit/export?format=csv"))
        const sig = res.headers.get("x-audit-export-signature")
        expect(sig).not.toBeNull()
        expect(sig).toMatch(/^sha256=[a-f0-9]{64}$/)
    })

    it("CSV: embedded signature comment line present in file body", async () => {
        process.env.AUDIT_EXPORT_SIGNING_KEY = SIGNING_KEY
        mockGetServerSession.mockResolvedValue(makeSession("ADMIN"))
        mockFindMany.mockResolvedValue([BASE_LOG])
        const { GET } = await import("@/app/api/audit/export/route")
        const res = await GET(new Request("http://localhost/api/audit/export?format=csv"))
        const text = await res.text()
        const lastLine = text.split("\n").at(-1) ?? ""
        expect(lastLine).toMatch(/^# x-audit-export-signature: sha256=[a-f0-9]{64}$/)
    })

    it("CSV: embedded comment signature matches header signature", async () => {
        process.env.AUDIT_EXPORT_SIGNING_KEY = SIGNING_KEY
        mockGetServerSession.mockResolvedValue(makeSession("ADMIN"))
        mockFindMany.mockResolvedValue([BASE_LOG])
        const { GET } = await import("@/app/api/audit/export/route")
        const res = await GET(new Request("http://localhost/api/audit/export?format=csv"))
        const headerSig = res.headers.get("x-audit-export-signature")
        const text = await res.text()
        const lastLine = text.split("\n").at(-1) ?? ""
        const embeddedSig = lastLine.replace("# x-audit-export-signature: ", "")
        expect(embeddedSig).toBe(headerSig)
    })

    it("JSON: X-Audit-Export-Signature header present when key configured", async () => {
        process.env.AUDIT_EXPORT_SIGNING_KEY = SIGNING_KEY
        mockGetServerSession.mockResolvedValue(makeSession("ADMIN"))
        mockFindMany.mockResolvedValue([BASE_LOG])
        const { GET } = await import("@/app/api/audit/export/route")
        const res = await GET(new Request("http://localhost/api/audit/export?format=json"))
        const sig = res.headers.get("x-audit-export-signature")
        expect(sig).not.toBeNull()
        expect(sig).toMatch(/^sha256=[a-f0-9]{64}$/)
    })

    it("JSON: exportSignature field in envelope when key configured", async () => {
        process.env.AUDIT_EXPORT_SIGNING_KEY = SIGNING_KEY
        mockGetServerSession.mockResolvedValue(makeSession("ADMIN"))
        mockFindMany.mockResolvedValue([BASE_LOG])
        const { GET } = await import("@/app/api/audit/export/route")
        const res = await GET(new Request("http://localhost/api/audit/export?format=json"))
        const data = await res.json()
        expect(data).toHaveProperty("exportSignature")
        expect(data.exportSignature).toMatch(/^sha256=[a-f0-9]{64}$/)
    })

    it("JSON: header signature matches exportSignature field", async () => {
        process.env.AUDIT_EXPORT_SIGNING_KEY = SIGNING_KEY
        mockGetServerSession.mockResolvedValue(makeSession("ADMIN"))
        mockFindMany.mockResolvedValue([BASE_LOG])
        const { GET } = await import("@/app/api/audit/export/route")
        const res = await GET(new Request("http://localhost/api/audit/export?format=json"))
        const headerSig = res.headers.get("x-audit-export-signature")
        const data = await res.json()
        expect(headerSig).toBe(data.exportSignature)
    })

    it("CSV: different keys produce different signatures", async () => {
        process.env.AUDIT_EXPORT_SIGNING_KEY = SIGNING_KEY
        mockGetServerSession.mockResolvedValue(makeSession("ADMIN"))
        mockFindMany.mockResolvedValue([BASE_LOG])
        const { GET } = await import("@/app/api/audit/export/route")
        const res1 = await GET(new Request("http://localhost/api/audit/export?format=csv"))
        const sig1 = res1.headers.get("x-audit-export-signature")

        vi.resetModules()
        process.env.AUDIT_EXPORT_SIGNING_KEY = "different-key-32chars-padded!!!!"
        mockGetServerSession.mockResolvedValue(makeSession("ADMIN"))
        mockFindMany.mockResolvedValue([BASE_LOG])
        const { GET: GET2 } = await import("@/app/api/audit/export/route")
        const res2 = await GET2(new Request("http://localhost/api/audit/export?format=csv"))
        const sig2 = res2.headers.get("x-audit-export-signature")

        expect(sig1).not.toBe(sig2)
    })
})
