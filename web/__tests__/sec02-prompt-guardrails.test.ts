/**
 * SEC-02: Prompt Guardrails — Next.js API layer tests.
 *
 * Groups:
 *   A. GET /api/prompts       — auth check
 *   B. POST /api/prompts      — ADMIN-only, audit log, backend proxy
 *   C. POST /api/prompts/reset — ADMIN-only, audit log on reset
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Mocks ─────────────────────────────────────────────────────────────────────

// GTM-02: prisma needed for plan gate in POST /api/prompts
const mockFindUnique = vi.fn()
vi.mock("@/lib/prisma", () => ({
    prisma: {
        tenant: { findUnique: (...args: any[]) => mockFindUnique(...args) },
    },
}))

const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined)
vi.mock("@/lib/audit", () => ({
    writeAuditLog: (...args: any[]) => mockWriteAuditLog(...args),
    AuditEvent: { SETTINGS_CHANGED: "SETTINGS_CHANGED" },
    getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}))

const mockGetServerSession = vi.fn()
vi.mock("next-auth", () => ({ getServerSession: mockGetServerSession }))
vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }))

// Intercept fetch so we never hit a real backend
const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

// ── Session factories ─────────────────────────────────────────────────────────

function adminSession() {
    return { user: { id: "u-admin", email: "admin@test.com", role: "ADMIN", tenantId: "t-1" } }
}

function nonAdminSession(role: string) {
    return { user: { id: "u-1", email: `${role}@test.com`, role, tenantId: "t-1" } }
}

function backendOk(body: object) {
    return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(body),
    } as Response)
}

// ── A. GET /api/prompts ───────────────────────────────────────────────────────

describe("GET /api/prompts", () => {
    beforeEach(() => { vi.resetModules(); vi.resetAllMocks() })

    it("returns 401 when unauthenticated", async () => {
        mockGetServerSession.mockResolvedValue(null)
        const { GET } = await import("@/app/api/prompts/route")
        const res = await GET(new Request("http://localhost/api/prompts"))
        expect(res.status).toBe(401)
    })

    it("proxies backend response for authenticated user", async () => {
        mockGetServerSession.mockResolvedValue(adminSession())
        const prompts = [{ key: "REVIEW_PROMPT", content: "...", is_custom: false }]
        mockFetch.mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(prompts) })

        const { GET } = await import("@/app/api/prompts/route")
        const res = await GET(new Request("http://localhost/api/prompts"))
        expect(res.status).toBe(200)
        const data = await res.json()
        expect(data).toEqual(prompts)
    })
})

// ── B. POST /api/prompts ──────────────────────────────────────────────────────

describe("POST /api/prompts", () => {
    beforeEach(() => {
        vi.resetModules()
        vi.resetAllMocks()
        // GTM-02: default to PRO plan so plan gate is transparent for SEC-02 tests
        mockFindUnique.mockResolvedValue({ plan: "PRO", trialExpiresAt: null })
    })

    it("returns 401 when unauthenticated", async () => {
        mockGetServerSession.mockResolvedValue(null)
        const { POST } = await import("@/app/api/prompts/route")
        const req = new Request("http://localhost/api/prompts", {
            method: "POST",
            body: JSON.stringify({ key: "REVIEW_PROMPT", content: "review code" }),
        })
        const res = await POST(req)
        expect(res.status).toBe(401)
    })

    it("returns 403 for VIEWER role", async () => {
        mockGetServerSession.mockResolvedValue(nonAdminSession("VIEWER"))
        const { POST } = await import("@/app/api/prompts/route")
        const req = new Request("http://localhost/api/prompts", {
            method: "POST",
            body: JSON.stringify({ key: "REVIEW_PROMPT", content: "review code" }),
        })
        const res = await POST(req)
        expect(res.status).toBe(403)
        const body = await res.json()
        expect(body.error).toBe("forbidden")
    })

    it("returns 403 for AUDITOR role", async () => {
        mockGetServerSession.mockResolvedValue(nonAdminSession("AUDITOR"))
        const { POST } = await import("@/app/api/prompts/route")
        const req = new Request("http://localhost/api/prompts", {
            method: "POST",
            body: JSON.stringify({ key: "REVIEW_PROMPT", content: "review code" }),
        })
        const res = await POST(req)
        expect(res.status).toBe(403)
    })

    it("returns 403 for BILLING_ADMIN role", async () => {
        mockGetServerSession.mockResolvedValue(nonAdminSession("BILLING_ADMIN"))
        const { POST } = await import("@/app/api/prompts/route")
        const req = new Request("http://localhost/api/prompts", {
            method: "POST",
            body: JSON.stringify({ key: "REVIEW_PROMPT", content: "review code" }),
        })
        const res = await POST(req)
        expect(res.status).toBe(403)
    })

    it("allows ADMIN to save and proxies to backend", async () => {
        mockGetServerSession.mockResolvedValue(adminSession())
        mockFetch.mockResolvedValue(backendOk({ status: "success", key: "REVIEW_PROMPT" }))

        const { POST } = await import("@/app/api/prompts/route")
        const req = new Request("http://localhost/api/prompts", {
            method: "POST",
            body: JSON.stringify({ key: "REVIEW_PROMPT", content: "review code and documentation" }),
        })
        const res = await POST(req)
        expect(res.status).toBe(200)
    })

    it("AC-6: writes audit log on successful save", async () => {
        mockGetServerSession.mockResolvedValue(adminSession())
        mockFetch.mockResolvedValue(backendOk({ status: "success", key: "REVIEW_PROMPT" }))

        const { POST } = await import("@/app/api/prompts/route")
        const req = new Request("http://localhost/api/prompts", {
            method: "POST",
            body: JSON.stringify({ key: "REVIEW_PROMPT", content: "review code and documentation" }),
        })
        await POST(req)

        expect(mockWriteAuditLog).toHaveBeenCalledOnce()
        const auditCall = mockWriteAuditLog.mock.calls[0][0]
        expect(auditCall.event).toBe("SETTINGS_CHANGED")
        expect(auditCall.resourceType).toBe("prompt_config")
        expect(auditCall.resourceId).toBe("REVIEW_PROMPT")
        expect(auditCall.metadata.is_reset).toBe(false)
    })

    it("AC-6: does not write audit log when backend returns error", async () => {
        mockGetServerSession.mockResolvedValue(adminSession())
        mockFetch.mockResolvedValue({
            ok: false,
            status: 400,
            json: () => Promise.resolve({ error: "forbidden_content", reason: "Not allowed." }),
        } as Response)

        const { POST } = await import("@/app/api/prompts/route")
        const req = new Request("http://localhost/api/prompts", {
            method: "POST",
            body: JSON.stringify({ key: "REVIEW_PROMPT", content: "jailbreak prompt" }),
        })
        await POST(req)

        expect(mockWriteAuditLog).not.toHaveBeenCalled()
    })

    it("AC-6: audit log metadata includes content_length", async () => {
        mockGetServerSession.mockResolvedValue(adminSession())
        const content = "review code and documentation changes carefully"
        mockFetch.mockResolvedValue(backendOk({ status: "success", key: "REVIEW_PROMPT" }))

        const { POST } = await import("@/app/api/prompts/route")
        const req = new Request("http://localhost/api/prompts", {
            method: "POST",
            body: JSON.stringify({ key: "REVIEW_PROMPT", content }),
        })
        await POST(req)

        const auditCall = mockWriteAuditLog.mock.calls[0][0]
        expect(auditCall.metadata.content_length).toBe(content.length)
    })
})

// ── C. POST /api/prompts/reset ────────────────────────────────────────────────

describe("POST /api/prompts/reset", () => {
    beforeEach(() => { vi.resetModules(); vi.resetAllMocks() })

    it("returns 401 when unauthenticated", async () => {
        mockGetServerSession.mockResolvedValue(null)
        const { POST } = await import("@/app/api/prompts/reset/route")
        const res = await POST(new Request("http://localhost/api/prompts/reset?key=REVIEW_PROMPT", { method: "POST" }))
        expect(res.status).toBe(401)
    })

    it("returns 403 for VIEWER role", async () => {
        mockGetServerSession.mockResolvedValue(nonAdminSession("VIEWER"))
        const { POST } = await import("@/app/api/prompts/reset/route")
        const res = await POST(new Request("http://localhost/api/prompts/reset?key=REVIEW_PROMPT", { method: "POST" }))
        expect(res.status).toBe(403)
        const body = await res.json()
        expect(body.error).toBe("forbidden")
    })

    it("returns 400 when key param is missing", async () => {
        mockGetServerSession.mockResolvedValue(adminSession())
        mockFindUnique.mockResolvedValue({ plan: "PRO", trialExpiresAt: null, workflowConfig: null })
        const { POST } = await import("@/app/api/prompts/reset/route")
        const res = await POST(new Request("http://localhost/api/prompts/reset", { method: "POST" }))
        expect(res.status).toBe(400)
    })

    it("allows ADMIN to reset a prompt", async () => {
        mockGetServerSession.mockResolvedValue(adminSession())
        mockFindUnique.mockResolvedValue({ plan: "PRO", trialExpiresAt: null, workflowConfig: null })
        mockFetch.mockResolvedValue(backendOk({ status: "success" }))

        const { POST } = await import("@/app/api/prompts/reset/route")
        const res = await POST(new Request("http://localhost/api/prompts/reset?key=REVIEW_PROMPT", { method: "POST" }))
        expect(res.status).toBe(200)
    })

    it("AC-6: writes audit log with is_reset:true on successful reset", async () => {
        mockGetServerSession.mockResolvedValue(adminSession())
        mockFindUnique.mockResolvedValue({ plan: "PRO", trialExpiresAt: null, workflowConfig: null })
        mockFetch.mockResolvedValue(backendOk({ status: "success" }))

        const { POST } = await import("@/app/api/prompts/reset/route")
        await POST(new Request("http://localhost/api/prompts/reset?key=REVIEW_PROMPT", { method: "POST" }))

        expect(mockWriteAuditLog).toHaveBeenCalledOnce()
        const auditCall = mockWriteAuditLog.mock.calls[0][0]
        expect(auditCall.event).toBe("SETTINGS_CHANGED")
        expect(auditCall.resourceId).toBe("REVIEW_PROMPT")
        expect(auditCall.metadata.is_reset).toBe(true)
    })

    it("AC-6: does not write audit log when backend reset fails", async () => {
        mockGetServerSession.mockResolvedValue(adminSession())
        mockFetch.mockResolvedValue({
            ok: false,
            status: 404,
            json: () => Promise.resolve({ error: "not_found" }),
        } as Response)

        const { POST } = await import("@/app/api/prompts/reset/route")
        await POST(new Request("http://localhost/api/prompts/reset?key=REVIEW_PROMPT", { method: "POST" }))

        expect(mockWriteAuditLog).not.toHaveBeenCalled()
    })
})
