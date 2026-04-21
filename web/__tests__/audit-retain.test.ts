/**
 * Tests for POST /api/admin/audit/retain
 *
 * Covers:
 *   A. Auth — rejects wrong/missing secret in production
 *   B. Dry-run mode — returns counts without writing
 *   C. Deletion — calls prisma.auditLog.deleteMany with correct date cutoff
 *   D. Archive — writes JSON file before deletion
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import fs from "fs"

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockFindMany = vi.fn()
const mockCount = vi.fn()
const mockDeleteMany = vi.fn()
vi.mock("@/lib/prisma", () => ({
    prisma: {
        auditLog: {
            findMany: mockFindMany,
            count: mockCount,
            deleteMany: mockDeleteMany,
        },
    },
}))

vi.mock("fs", () => ({
    default: {
        existsSync: vi.fn().mockReturnValue(true),
        mkdirSync: vi.fn(),
        writeFileSync: vi.fn(),
    },
    existsSync: vi.fn().mockReturnValue(true),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
}))

// ── Helpers ────────────────────────────────────────────────────────────────────

const SAMPLE_LOGS = [
    { id: "log-1", tenantId: "t-1", actorEmail: "a@b.com", actorIp: null,
      event: "USER_LOGIN", resourceType: null, resourceId: null, metadata: null,
      hash: "abc", createdAt: new Date("2025-01-01") },
]

function makeRequest(body?: object, secret = "test-secret") {
    return new Request("http://localhost/api/admin/audit/retain", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${secret}`,
            "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
    })
}

// ── A. Auth ────────────────────────────────────────────────────────────────────

describe("POST /api/admin/audit/retain — auth", () => {
    beforeEach(() => { vi.resetModules(); vi.resetAllMocks() })

    it("returns 401 for wrong secret in production", async () => {
        vi.stubEnv("NODE_ENV", "production")
        vi.stubEnv("CRON_SECRET", "test-secret")
        mockFindMany.mockResolvedValue([])
        mockCount.mockResolvedValue(0)
        mockDeleteMany.mockResolvedValue({ count: 0 })
        const { POST } = await import("@/app/api/admin/audit/retain/route")
        const res = await POST(makeRequest(undefined, "wrong-secret"))
        expect(res.status).toBe(401)
        vi.unstubAllEnvs()
    })

    it("returns 200 when CRON_SECRET unset and ALLOW_UNAUTHENTICATED_CRON=true", async () => {
        vi.stubEnv("CRON_SECRET", "")
        vi.stubEnv("ALLOW_UNAUTHENTICATED_CRON", "true")
        mockFindMany.mockResolvedValue([])
        mockCount.mockResolvedValue(0)
        mockDeleteMany.mockResolvedValue({ count: 0 })
        const req = new Request("http://localhost/api/admin/audit/retain", {
            method: "POST",
            body: "{}",
            headers: { "Content-Type": "application/json" },
        })
        const { POST } = await import("@/app/api/admin/audit/retain/route")
        const res = await POST(req)
        expect(res.status).toBe(200)
        vi.unstubAllEnvs()
    })
})

// ── B. Dry-run ─────────────────────────────────────────────────────────────────

describe("POST /api/admin/audit/retain — dry run", () => {
    beforeEach(() => { vi.resetModules(); vi.resetAllMocks(); vi.stubEnv("CRON_SECRET", ""); vi.stubEnv("ALLOW_UNAUTHENTICATED_CRON", "true") })

    it("does not call deleteMany when dryRun=true", async () => {
        mockFindMany.mockResolvedValue(SAMPLE_LOGS)
        mockCount.mockResolvedValue(2)
        const { POST } = await import("@/app/api/admin/audit/retain/route")
        const res = await POST(makeRequest({ dryRun: true }, ""))
        expect(res.status).toBe(200)
        const data = await res.json()
        expect(data.dryRun).toBe(true)
        expect(data.wouldArchive).toBe(1)
        expect(data.wouldDelete).toBe(2)
        expect(mockDeleteMany).not.toHaveBeenCalled()
    })
})

// ── C. Deletion ────────────────────────────────────────────────────────────────

describe("POST /api/admin/audit/retain — deletion", () => {
    beforeEach(() => { vi.resetModules(); vi.resetAllMocks(); vi.stubEnv("CRON_SECRET", ""); vi.stubEnv("ALLOW_UNAUTHENTICATED_CRON", "true") })

    it("calls deleteMany with lt: deleteCutoff date", async () => {
        mockFindMany.mockResolvedValue([])
        mockCount.mockResolvedValue(3)
        mockDeleteMany.mockResolvedValue({ count: 3 })
        const { POST } = await import("@/app/api/admin/audit/retain/route")
        const res = await POST(makeRequest({}, ""))
        expect(res.status).toBe(200)
        expect(mockDeleteMany).toHaveBeenCalledWith({
            where: { createdAt: { lt: expect.any(Date) } },
        })
        const data = await res.json()
        expect(data.deleted).toBe(3)
    })

    it("returns archived and deleted counts", async () => {
        mockFindMany.mockResolvedValue(SAMPLE_LOGS)
        mockCount.mockResolvedValue(0)
        mockDeleteMany.mockResolvedValue({ count: 0 })
        const { POST } = await import("@/app/api/admin/audit/retain/route")
        const res = await POST(makeRequest({}, ""))
        const data = await res.json()
        expect(data).toHaveProperty("archived")
        expect(data).toHaveProperty("deleted")
        expect(data).toHaveProperty("hotCutoff")
        expect(data).toHaveProperty("deleteCutoff")
    })
})

// ── D. Archive ─────────────────────────────────────────────────────────────────

describe("POST /api/admin/audit/retain — archive", () => {
    beforeEach(() => { vi.resetModules(); vi.resetAllMocks(); vi.stubEnv("CRON_SECRET", ""); vi.stubEnv("ALLOW_UNAUTHENTICATED_CRON", "true") })

    it("calls fs.writeFileSync with JSON when archive candidates exist", async () => {
        mockFindMany.mockResolvedValue(SAMPLE_LOGS)
        mockCount.mockResolvedValue(0)
        mockDeleteMany.mockResolvedValue({ count: 0 })
        const { POST } = await import("@/app/api/admin/audit/retain/route")
        await POST(makeRequest({}, ""))
        expect(fs.writeFileSync).toHaveBeenCalledWith(
            expect.stringContaining("audit-archive"),
            expect.stringContaining("log-1"),
            "utf-8"
        )
    })

    it("does not call fs.writeFileSync when no archive candidates", async () => {
        mockFindMany.mockResolvedValue([])
        mockCount.mockResolvedValue(0)
        mockDeleteMany.mockResolvedValue({ count: 0 })
        const { POST } = await import("@/app/api/admin/audit/retain/route")
        await POST(makeRequest({}, ""))
        expect(fs.writeFileSync).not.toHaveBeenCalled()
    })
})
