/**
 * GAP-INT-4: Integration status and test-ping endpoints.
 *
 * GET  /api/settings/integrations/status
 *   - Returns { slack, jira, linear, githubIssues } status objects with .configured boolean
 *   - Requires auth; 401 when unauthenticated
 *   - Returns configured:false for unconfigured integrations
 *   - Returns configured:true only when config fields are present
 *
 * POST /api/settings/integrations/test?type=slack|jira|linear
 *   - 400 when type is missing or invalid
 *   - 401 when unauthenticated
 *   - 403 when the relevant integration feature not granted
 *   - 200 + { ok: true } when ping succeeds
 *   - 200 + { ok: false, error: string } when ping fails (never 5xx — non-fatal)
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockFindUnique = vi.fn()
vi.mock("@/lib/prisma", () => ({
    prisma: {
        tenant: { findUnique: (...args: any[]) => mockFindUnique(...args) },
    },
}))

const mockGetServerSession = vi.fn()
vi.mock("next-auth", () => ({ getServerSession: mockGetServerSession }))
vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }))

vi.mock("@/lib/encryption", () => ({
    decrypt: (v: string) => v.replace(/^enc_/, ""),
}))

const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

// ── Helpers ───────────────────────────────────────────────────────────────────

function session() {
    return { user: { id: "u-1", email: "admin@test.com", role: "ADMIN", tenantId: "t-1" } }
}

function tenantWith(workflowConfig: object, plan = "PRO") {
    return { id: "t-1", plan, trialExpiresAt: null, workflowConfig }
}

// ── GET /api/settings/integrations/status ────────────────────────────────────

describe("GET /api/settings/integrations/status", () => {
    beforeEach(() => { vi.resetModules(); vi.clearAllMocks() })

    it("returns 401 when unauthenticated", async () => {
        mockGetServerSession.mockResolvedValue(null)
        const { GET } = await import("@/app/api/settings/integrations/status/route")
        const res = await GET(new Request("http://localhost/api/settings/integrations/status"))
        expect(res.status).toBe(401)
    })

    it("returns all false when no integrations configured", async () => {
        mockGetServerSession.mockResolvedValue(session())
        mockFindUnique.mockResolvedValue(tenantWith({}))

        const { GET } = await import("@/app/api/settings/integrations/status/route")
        const res = await GET(new Request("http://localhost/api/settings/integrations/status"))
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.slack.configured).toBe(false)
        expect(body.jira.configured).toBe(false)
        expect(body.linear.configured).toBe(false)
        expect(body.githubIssues.configured).toBe(false)
    })

    it("returns slack:true when slack.webhookUrl is set", async () => {
        mockGetServerSession.mockResolvedValue(session())
        mockFindUnique.mockResolvedValue(tenantWith({
            slack: { webhookUrl: "enc_https://hooks.slack.com/test" }
        }))

        const { GET } = await import("@/app/api/settings/integrations/status/route")
        const res = await GET(new Request("http://localhost/api/settings/integrations/status"))
        const body = await res.json()
        expect(body.slack.configured).toBe(true)
        expect(body.jira.configured).toBe(false)
    })

    it("returns jira:true when jira.host and apiToken are set", async () => {
        mockGetServerSession.mockResolvedValue(session())
        mockFindUnique.mockResolvedValue(tenantWith({
            jira: { host: "https://jira.example.com", email: "dev@example.com", apiToken: "enc_secret" }
        }))

        const { GET } = await import("@/app/api/settings/integrations/status/route")
        const res = await GET(new Request("http://localhost/api/settings/integrations/status"))
        const body = await res.json()
        expect(body.jira.configured).toBe(true)
        expect(body.slack.configured).toBe(false)
    })

    it("returns linear:true when linear.apiToken is set", async () => {
        mockGetServerSession.mockResolvedValue(session())
        mockFindUnique.mockResolvedValue(tenantWith({
            linear: { apiToken: "enc_lin_api_xxx", teamId: "team-1" }
        }))

        const { GET } = await import("@/app/api/settings/integrations/status/route")
        const res = await GET(new Request("http://localhost/api/settings/integrations/status"))
        const body = await res.json()
        expect(body.linear.configured).toBe(true)
    })

    it("returns githubIssues:true when enabled and repo are set", async () => {
        mockGetServerSession.mockResolvedValue(session())
        mockFindUnique.mockResolvedValue(tenantWith({
            githubIssues: { enabled: true, repo: "acme/api" }
        }))

        const { GET } = await import("@/app/api/settings/integrations/status/route")
        const res = await GET(new Request("http://localhost/api/settings/integrations/status"))
        const body = await res.json()
        expect(body.githubIssues.configured).toBe(true)
    })
})

// ── POST /api/settings/integrations/test ─────────────────────────────────────

describe("POST /api/settings/integrations/test", () => {
    beforeEach(() => { vi.resetModules(); vi.clearAllMocks() })

    it("returns 401 when unauthenticated", async () => {
        mockGetServerSession.mockResolvedValue(null)
        const { POST } = await import("@/app/api/settings/integrations/test/route")
        const res = await POST(new Request("http://localhost/api/settings/integrations/test?type=slack", { method: "POST" }))
        expect(res.status).toBe(401)
    })

    it("returns 400 when type param missing", async () => {
        mockGetServerSession.mockResolvedValue(session())
        mockFindUnique.mockResolvedValue(tenantWith({}))
        const { POST } = await import("@/app/api/settings/integrations/test/route")
        const res = await POST(new Request("http://localhost/api/settings/integrations/test", { method: "POST" }))
        expect(res.status).toBe(400)
        const body = await res.json()
        expect(body.error).toBe("invalid_type")
    })

    it("returns 400 when type param is invalid", async () => {
        mockGetServerSession.mockResolvedValue(session())
        mockFindUnique.mockResolvedValue(tenantWith({}))
        const { POST } = await import("@/app/api/settings/integrations/test/route")
        const res = await POST(new Request("http://localhost/api/settings/integrations/test?type=github", { method: "POST" }))
        expect(res.status).toBe(400)
    })

    it("returns 403 when Slack integration is not granted", async () => {
        mockGetServerSession.mockResolvedValue(session())
        // grantedFeatures must be non-empty to be authoritative; empty falls back to plan rank
        mockFindUnique.mockResolvedValue({
            id: "t-1", plan: "PRO", trialExpiresAt: null,
            workflowConfig: {
                slack: { webhookUrl: "enc_url" },
                grantedFeatures: ["integrations_linear"],  // slack NOT included
            }
        })

        const { POST } = await import("@/app/api/settings/integrations/test/route")
        const res = await POST(new Request("http://localhost/api/settings/integrations/test?type=slack", { method: "POST" }))
        expect(res.status).toBe(403)
        const body = await res.json()
        expect(body.error).toBe("feature_not_granted")
    })

    it("returns 200 + ok:true when Slack ping succeeds", async () => {
        mockGetServerSession.mockResolvedValue(session())
        mockFindUnique.mockResolvedValue({
            id: "t-1", plan: "PRO", trialExpiresAt: null,
            workflowConfig: {
                slack: { webhookUrl: "enc_https://hooks.slack.com/test" },
                grantedFeatures: ["slack_integration"],
            }
        })
        mockFetch.mockResolvedValue({ ok: true, status: 200 })

        const { POST } = await import("@/app/api/settings/integrations/test/route")
        const res = await POST(new Request("http://localhost/api/settings/integrations/test?type=slack", { method: "POST" }))
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.ok).toBe(true)
    })

    it("returns 200 + ok:false when Slack ping fails (non-fatal)", async () => {
        mockGetServerSession.mockResolvedValue(session())
        mockFindUnique.mockResolvedValue({
            id: "t-1", plan: "PRO", trialExpiresAt: null,
            workflowConfig: {
                slack: { webhookUrl: "enc_https://hooks.slack.com/test" },
                grantedFeatures: ["slack_integration"],
            }
        })
        mockFetch.mockRejectedValue(new Error("connection refused"))

        const { POST } = await import("@/app/api/settings/integrations/test/route")
        const res = await POST(new Request("http://localhost/api/settings/integrations/test?type=slack", { method: "POST" }))
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.ok).toBe(false)
        expect(typeof body.error).toBe("string")
    })

    it("returns 200 + ok:false when integration not configured (type=jira, no jira config)", async () => {
        mockGetServerSession.mockResolvedValue(session())
        mockFindUnique.mockResolvedValue({
            id: "t-1", plan: "PRO", trialExpiresAt: null,
            workflowConfig: { grantedFeatures: ["integrations_jira"] }
            // no jira config present
        })

        const { POST } = await import("@/app/api/settings/integrations/test/route")
        const res = await POST(new Request("http://localhost/api/settings/integrations/test?type=jira", { method: "POST" }))
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.ok).toBe(false)
        expect(body.error).toMatch(/not configured/i)
    })

    it("returns 200 + ok:true when Linear ping succeeds", async () => {
        mockGetServerSession.mockResolvedValue(session())
        mockFindUnique.mockResolvedValue({
            id: "t-1", plan: "PRO", trialExpiresAt: null,
            workflowConfig: {
                linear: { apiToken: "enc_lin_api_xxx", teamId: "team-1" },
                grantedFeatures: ["integrations_linear"],
            }
        })
        mockFetch.mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ data: { viewer: { id: "user-1" } } }),
        })

        const { POST } = await import("@/app/api/settings/integrations/test/route")
        const res = await POST(new Request("http://localhost/api/settings/integrations/test?type=linear", { method: "POST" }))
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.ok).toBe(true)
    })
})
