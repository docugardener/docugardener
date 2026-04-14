/**
 * Plugin API key endpoint tests.
 *
 * AC-PLUGINKEY-1  POST /api/plugin-key returns 401 when not authenticated
 * AC-PLUGINKEY-2  POST /api/plugin-key returns 403 for non-ADMIN role
 * AC-PLUGINKEY-3  POST /api/plugin-key generates a dg_<48hex> key and persists it
 * AC-PLUGINKEY-4  POST /api/plugin-key rotates an existing key (old key replaced)
 * AC-PLUGINKEY-5  DELETE /api/plugin-key returns 401 when not authenticated
 * AC-PLUGINKEY-6  DELETE /api/plugin-key returns 403 for non-ADMIN role
 * AC-PLUGINKEY-7  DELETE /api/plugin-key removes the key and returns success
 * AC-PLUGINKEY-8  GET /api/plugin-key returns masked key when set
 * AC-PLUGINKEY-9  GET /api/plugin-key returns isSet=false when no key configured
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { POST, DELETE, GET } from "@/app/api/plugin-key/route"

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

import { getServerSession } from "next-auth"

const mockGetServerSession = vi.mocked(getServerSession)

// ── Helpers ───────────────────────────────────────────────────────────────────

function adminSession() {
    return { user: { tenantId: "tenant-123", role: "ADMIN", id: "user-1", email: "admin@test.com" } }
}

function viewerSession() {
    return { user: { tenantId: "tenant-123", role: "VIEWER", id: "user-2", email: "viewer@test.com" } }
}

function makeTenant(pluginApiKey?: string) {
    return {
        id: "tenant-123",
        workflowConfig: pluginApiKey ? { pluginApiKey } : {},
    }
}

// Route handlers in Next.js App Router take no arguments — they read
// session/headers internally. Pass as `any` to satisfy the test call sites.
const mockRequest = new Request("http://localhost/api/plugin-key") as any

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/plugin-key", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockUpdate.mockResolvedValue({})
    })

    it("AC-PLUGINKEY-1: returns 401 when not authenticated", async () => {
        mockGetServerSession.mockResolvedValue(null)
        const res = await (POST as any)(mockRequest)
        expect(res.status).toBe(401)
    })

    it("AC-PLUGINKEY-2: returns 403 for non-ADMIN role", async () => {
        mockGetServerSession.mockResolvedValue(viewerSession() as any)
        mockFindUnique.mockResolvedValue(makeTenant())
        const res = await (POST as any)(mockRequest)
        expect(res.status).toBe(403)
    })

    it("AC-PLUGINKEY-3: generates a dg_<48hex> key", async () => {
        mockGetServerSession.mockResolvedValue(adminSession() as any)
        mockFindUnique.mockResolvedValue(makeTenant())
        const res = await (POST as any)(mockRequest)
        expect(res.status).toBe(200)
        const data = await res.json()
        expect(data.pluginApiKey).toMatch(/^dg_[0-9a-f]{48}$/)
        expect(data.isSet).toBe(true)
    })

    it("AC-PLUGINKEY-4: persists the new key in workflowConfig", async () => {
        mockGetServerSession.mockResolvedValue(adminSession() as any)
        mockFindUnique.mockResolvedValue(makeTenant())
        await (POST as any)(mockRequest)
        expect(mockUpdate).toHaveBeenCalledOnce()
        const updateCall = mockUpdate.mock.calls[0][0]
        expect(updateCall.data.workflowConfig.pluginApiKey).toMatch(/^dg_[0-9a-f]{48}$/)
    })

    it("AC-PLUGINKEY-4: rotates existing key (old value replaced)", async () => {
        const oldKey = "dg_" + "a".repeat(48)
        mockGetServerSession.mockResolvedValue(adminSession() as any)
        mockFindUnique.mockResolvedValue(makeTenant(oldKey))
        const res = await (POST as any)(mockRequest)
        const data = await res.json()
        expect(data.pluginApiKey).not.toBe(oldKey)
        expect(data.pluginApiKey).toMatch(/^dg_[0-9a-f]{48}$/)
    })
})

describe("DELETE /api/plugin-key", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockUpdate.mockResolvedValue({})
    })

    it("AC-PLUGINKEY-5: returns 401 when not authenticated", async () => {
        mockGetServerSession.mockResolvedValue(null)
        const res = await (DELETE as any)(mockRequest)
        expect(res.status).toBe(401)
    })

    it("AC-PLUGINKEY-6: returns 403 for non-ADMIN role", async () => {
        mockGetServerSession.mockResolvedValue(viewerSession() as any)
        mockFindUnique.mockResolvedValue(makeTenant("dg_" + "a".repeat(48)))
        const res = await (DELETE as any)(mockRequest)
        expect(res.status).toBe(403)
    })

    it("AC-PLUGINKEY-7: removes key and returns success", async () => {
        const existingKey = "dg_" + "a".repeat(48)
        mockGetServerSession.mockResolvedValue(adminSession() as any)
        mockFindUnique.mockResolvedValue(makeTenant(existingKey))
        const res = await (DELETE as any)(mockRequest)
        expect(res.status).toBe(200)
        const data = await res.json()
        expect(data.pluginApiKey).toBeNull()
        expect(data.isSet).toBe(false)
        // Verify key removed from persisted config
        const updateCall = mockUpdate.mock.calls[0][0]
        expect(updateCall.data.workflowConfig.pluginApiKey).toBeUndefined()
    })
})

describe("GET /api/plugin-key", () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it("AC-PLUGINKEY-8: returns masked key when set", async () => {
        const key = "dg_" + "abcdef12".repeat(6) // 48 hex chars
        mockGetServerSession.mockResolvedValue(adminSession() as any)
        mockFindUnique.mockResolvedValue(makeTenant(key))
        const res = await GET()
        expect(res.status).toBe(200)
        const data = await res.json()
        expect(data.isSet).toBe(true)
        expect(data.pluginApiKey).toContain("...")
        expect(data.pluginApiKey).not.toBe(key) // must be masked, not full key
    })

    it("AC-PLUGINKEY-9: returns isSet=false when no key configured", async () => {
        mockGetServerSession.mockResolvedValue(adminSession() as any)
        mockFindUnique.mockResolvedValue(makeTenant())
        const res = await GET()
        expect(res.status).toBe(200)
        const data = await res.json()
        expect(data.isSet).toBe(false)
        expect(data.pluginApiKey).toBeNull()
    })
})
