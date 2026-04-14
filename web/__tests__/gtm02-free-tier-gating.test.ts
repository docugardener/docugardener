/**
 * GTM-02: Free-Tier Feature Gating — Next.js API layer tests.
 *
 * Groups:
 *   A. GET /api/stats/ignores     — FREE blocked, PRO+ allowed
 *   B. POST /api/prompts          — FREE blocked, FREE+trial allowed, PRO+ allowed
 *   C. POST /api/settings         — FREE blocked for Slack/Jira integration
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockFindUnique = vi.fn()
const mockFindMany = vi.fn()
const mockUpdate = vi.fn()
vi.mock("@/lib/prisma", () => ({
    prisma: {
        tenant: {
            findUnique: (...args: any[]) => mockFindUnique(...args),
            update: (...args: any[]) => mockUpdate(...args),
        },
        job: {
            findMany: (...args: any[]) => mockFindMany(...args),
        },
    },
}))

const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined)
vi.mock("@/lib/audit", () => ({
    writeAuditLog: (...args: any[]) => mockWriteAuditLog(...args),
    AuditEvent: {
        SETTINGS_CHANGED: "SETTINGS_CHANGED",
        TRIAL_STARTED: "TRIAL_STARTED",
    },
    getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}))

vi.mock("@/lib/encryption", () => ({
    encrypt: (v: string) => `enc:${v}`,
    decrypt: (v: string) => v.replace(/^enc:/, ""),
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

// ── A. GET /api/stats/ignores ─────────────────────────────────────────────────

describe("GET /api/stats/ignores — plan gate", () => {
    beforeEach(() => { vi.resetModules(); vi.resetAllMocks() })

    it("AC-2: FREE tenant receives 403 upgrade_required", async () => {
        mockGetServerSession.mockResolvedValue(adminSession())
        mockFindUnique.mockResolvedValue({ plan: "FREE" })

        const { GET } = await import("@/app/api/stats/ignores/route")
        const res = await GET()
        expect(res.status).toBe(403)
        const body = await res.json()
        expect(body.error).toBe("upgrade_required")
        expect(body.feature).toBe("analytics")
    })

    it("AC-2: PRO tenant receives analytics data (200)", async () => {
        mockGetServerSession.mockResolvedValue(adminSession())
        mockFindUnique.mockResolvedValue({ plan: "PRO" })
        mockFindMany.mockResolvedValue([])

        const { GET } = await import("@/app/api/stats/ignores/route")
        const res = await GET()
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body).toHaveProperty("kpis")
        expect(body).toHaveProperty("trend")
    })
})

// ── B. POST /api/prompts — plan + trial gate ──────────────────────────────────

describe("POST /api/prompts — plan gate", () => {
    beforeEach(() => { vi.resetModules(); vi.resetAllMocks() })

    const makeRequest = (body = { key: "drift_alert", content: "Analyze code changes." }) =>
        new Request("http://localhost/api/prompts", {
            method: "POST",
            body: JSON.stringify(body),
            headers: { "Content-Type": "application/json" },
        })

    it("AC-3: FREE tenant without trial receives 403 upgrade_required", async () => {
        mockGetServerSession.mockResolvedValue(adminSession())
        mockFindUnique.mockResolvedValue({ plan: "FREE", trialExpiresAt: null })

        const { POST } = await import("@/app/api/prompts/route")
        const res = await POST(makeRequest())
        expect(res.status).toBe(403)
        const body = await res.json()
        expect(body.error).toBe("upgrade_required")
    })

    it("AC-3: FREE tenant with active trial is allowed through", async () => {
        mockGetServerSession.mockResolvedValue(adminSession())
        const future = new Date(Date.now() + 7 * 86_400_000)
        mockFindUnique.mockResolvedValue({ plan: "FREE", trialExpiresAt: future })

        // Mock the backend fetch
        const mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ key: "drift_alert", content: "Analyze code changes." }),
        })
        vi.stubGlobal("fetch", mockFetch)

        const { POST } = await import("@/app/api/prompts/route")
        const res = await POST(makeRequest())
        expect(res.status).toBe(200)
    })

    it("AC-3: PRO tenant without trial is allowed through", async () => {
        mockGetServerSession.mockResolvedValue(adminSession())
        mockFindUnique.mockResolvedValue({ plan: "PRO", trialExpiresAt: null })

        const mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ key: "drift_alert", content: "Analyze code changes." }),
        })
        vi.stubGlobal("fetch", mockFetch)

        const { POST } = await import("@/app/api/prompts/route")
        const res = await POST(makeRequest())
        expect(res.status).toBe(200)
    })

    it("non-ADMIN role gets 403 before plan check", async () => {
        mockGetServerSession.mockResolvedValue(viewerSession())
        mockFindUnique.mockResolvedValue({ plan: "PRO", trialExpiresAt: null })

        const { POST } = await import("@/app/api/prompts/route")
        const res = await POST(makeRequest())
        expect(res.status).toBe(403)
        const body = await res.json()
        expect(body.reason).toMatch(/ADMIN/i)
        // plan gate should NOT have been hit — findUnique should not be called
        // (ADMIN check comes first)
    })
})

// ── C. POST /api/settings — Slack/Jira integration gate ──────────────────────

describe("POST /api/settings — Slack/Jira integration plan gate", () => {
    beforeEach(() => { vi.resetModules(); vi.resetAllMocks() })

    const makeRequest = (body: object) =>
        new Request("http://localhost/api/settings", {
            method: "POST",
            body: JSON.stringify(body),
            headers: { "Content-Type": "application/json" },
        })

    it("AC-1: FREE tenant cannot save Slack webhookUrl — 403 upgrade_required", async () => {
        mockGetServerSession.mockResolvedValue(adminSession())
        mockFindUnique.mockResolvedValue({ plan: "FREE", llmConfig: {}, workflowConfig: { slack: {}, jira: {} } })

        const { POST } = await import("@/app/api/settings/route")
        const res = await POST(makeRequest({
            workflowConfig: { slack: { webhookUrl: "https://hooks.slack.com/test" } },
        }))
        expect(res.status).toBe(403)
        const body = await res.json()
        expect(body.error).toBe("upgrade_required")
        expect(body.feature).toBe("slack_integration")
    })

    it("AC-1: FREE tenant cannot save Jira host — 403 upgrade_required", async () => {
        mockGetServerSession.mockResolvedValue(adminSession())
        mockFindUnique.mockResolvedValue({ plan: "FREE", llmConfig: {}, workflowConfig: { slack: {}, jira: {} } })

        const { POST } = await import("@/app/api/settings/route")
        const res = await POST(makeRequest({
            workflowConfig: { jira: { host: "https://jira.example.com", apiToken: "tok" } },
        }))
        expect(res.status).toBe(403)
        const body = await res.json()
        expect(body.error).toBe("upgrade_required")
    })

    it("AC-1: PRO tenant can save Slack webhookUrl — 200 success", async () => {
        mockGetServerSession.mockResolvedValue(adminSession())
        // findUnique called twice: once for workflowConfig gate, once within the block
        mockFindUnique.mockResolvedValue({ plan: "PRO", llmConfig: {}, workflowConfig: { slack: {}, jira: {} } })
        mockUpdate.mockResolvedValue({})

        const { POST } = await import("@/app/api/settings/route")
        const res = await POST(makeRequest({
            workflowConfig: { slack: { webhookUrl: "https://hooks.slack.com/test" } },
        }))
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.success).toBe(true)
    })
})
