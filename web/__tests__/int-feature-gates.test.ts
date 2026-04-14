/**
 * GAP-INT-1: Settings API must gate each integration independently.
 *
 * POST /api/settings — workflow_config block:
 *   - Saving Slack config requires slack_integration
 *   - Saving Jira config requires integrations_jira
 *   - Saving Linear config requires integrations_linear
 *   - Saving GitHub Issues config requires no PRO feature (FREE)
 *   - Saving non-integration fields (aiAuthorMode, etc.) is always allowed
 *   - A request saving Slack + Jira together needs BOTH keys individually granted
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

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

vi.mock("@/lib/audit", () => ({
    writeAuditLog: vi.fn().mockResolvedValue(undefined),
    AuditEvent: { SETTINGS_CHANGED: "SETTINGS_CHANGED" },
    getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}))

const mockGetServerSession = vi.fn()
vi.mock("next-auth", () => ({ getServerSession: mockGetServerSession }))
vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }))

vi.mock("@/lib/encryption", () => ({
    encrypt: (v: string) => `enc_${v}`,
    decrypt: (v: string) => v.replace(/^enc_/, ""),
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

function adminSession() {
    return { user: { id: "u-1", email: "admin@test.com", role: "ADMIN", tenantId: "t-1" } }
}

function tenantWith(grantedFeatures: string[]) {
    return {
        id: "t-1",
        plan: "PRO",
        trialExpiresAt: null,
        workflowConfig: { grantedFeatures },
    }
}

function makeReq(workflowConfig: object) {
    return new Request("http://localhost/api/settings", {
        method: "POST",
        body: JSON.stringify({ workflowConfig }),
    })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/settings — per-integration feature gates (GAP-INT-1)", () => {
    beforeEach(() => {
        vi.resetModules()
        vi.clearAllMocks()
        mockGetServerSession.mockResolvedValue(adminSession())
        mockUpdate.mockResolvedValue({ id: "t-1", plan: "PRO", workflowConfig: {} })
    })

    it("allows saving Slack config when slack_integration is granted", async () => {
        mockFindUnique.mockResolvedValue(tenantWith(["slack_integration"]))
        const { POST } = await import("@/app/api/settings/route")
        const res = await POST(makeReq({ slack: { webhookUrl: "https://hooks.slack.com/test" } }))
        expect(res.status).toBe(200)
    })

    it("blocks saving Slack config when slack_integration is NOT granted", async () => {
        mockFindUnique.mockResolvedValue(tenantWith(["integrations_jira"]))  // slack not in list
        const { POST } = await import("@/app/api/settings/route")
        const res = await POST(makeReq({ slack: { webhookUrl: "https://hooks.slack.com/test" } }))
        expect(res.status).toBe(403)
        const body = await res.json()
        expect(body.error).toBe("upgrade_required")
        expect(body.feature).toBe("slack_integration")
    })

    it("allows saving Jira config when integrations_jira is granted", async () => {
        mockFindUnique.mockResolvedValue(tenantWith(["integrations_jira"]))
        const { POST } = await import("@/app/api/settings/route")
        const res = await POST(makeReq({
            jira: { host: "https://jira.example.com", email: "dev@example.com", apiToken: "secret" }
        }))
        expect(res.status).toBe(200)
    })

    it("blocks saving Jira config when integrations_jira is NOT granted", async () => {
        mockFindUnique.mockResolvedValue(tenantWith(["slack_integration"]))  // jira not in list
        const { POST } = await import("@/app/api/settings/route")
        const res = await POST(makeReq({ jira: { host: "https://jira.example.com" } }))
        expect(res.status).toBe(403)
        const body = await res.json()
        expect(body.error).toBe("upgrade_required")
        expect(body.feature).toBe("integrations_jira")
    })

    it("allows saving Linear config when integrations_linear is granted", async () => {
        mockFindUnique.mockResolvedValue(tenantWith(["integrations_linear"]))
        const { POST } = await import("@/app/api/settings/route")
        const res = await POST(makeReq({ linear: { apiToken: "lin_api_xxx", teamId: "team-1" } }))
        expect(res.status).toBe(200)
    })

    it("blocks saving Linear config when integrations_linear is NOT granted", async () => {
        // grantedFeatures must be non-empty to be authoritative; empty falls back to plan rank
        mockFindUnique.mockResolvedValue(tenantWith(["slack_integration"]))  // linear not included
        const { POST } = await import("@/app/api/settings/route")
        const res = await POST(makeReq({ linear: { apiToken: "lin_api_xxx" } }))
        expect(res.status).toBe(403)
        const body = await res.json()
        expect(body.error).toBe("upgrade_required")
        expect(body.feature).toBe("integrations_linear")
    })

    it("allows saving GitHub Issues config regardless of granted_features (FREE feature)", async () => {
        mockFindUnique.mockResolvedValue(tenantWith([]))  // nothing granted
        const { POST } = await import("@/app/api/settings/route")
        const res = await POST(makeReq({ githubIssues: { enabled: true, repo: "acme/api" } }))
        expect(res.status).toBe(200)
    })

    it("blocks Slack in a combined Slack+Jira save when only Jira is granted", async () => {
        mockFindUnique.mockResolvedValue(tenantWith(["integrations_jira"]))
        const { POST } = await import("@/app/api/settings/route")
        const res = await POST(makeReq({
            slack: { webhookUrl: "https://hooks.slack.com/test" },
            jira: { host: "https://jira.example.com" },
        }))
        expect(res.status).toBe(403)
        const body = await res.json()
        expect(body.feature).toBe("slack_integration")
    })

    it("allows saving non-integration fields (aiAuthorMode) with no grants", async () => {
        mockFindUnique.mockResolvedValue(tenantWith([]))
        const { POST } = await import("@/app/api/settings/route")
        const res = await POST(makeReq({ aiAuthorMode: "on" }))
        expect(res.status).toBe(200)
    })
})
