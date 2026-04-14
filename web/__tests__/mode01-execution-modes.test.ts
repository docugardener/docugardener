/**
 * MODE-01: First-Class Execution Modes tests
 *
 *   AC-MODE01-1  deriveExecutionMode returns "platform" for null/undefined/platform_default
 *   AC-MODE01-2  deriveExecutionMode returns "byok_cloud" for gemini/openai providers
 *   AC-MODE01-3  deriveExecutionMode returns "byok_local" for ollama provider
 *   AC-MODE01-4  GET /api/settings/environment-profile — 401 when unauthenticated
 *   AC-MODE01-5  GET /api/settings/environment-profile — 403 when non-ADMIN
 *   AC-MODE01-6  GET /api/settings/environment-profile — 403 upgrade_required for non-TEAM plan
 *   AC-MODE01-7  GET /api/settings/environment-profile — 200 with correct mode for TEAM ADMIN
 *   AC-MODE01-8  profile never includes raw API key secrets
 *   AC-MODE01-9  profile capabilities.noDataEgressGuarantee is true for byok_local
 *   AC-MODE01-10 profile capabilities.noDataEgressGuarantee is false for platform mode
 *   AC-MODE01-11 profile integrations reflect active connections
 *   AC-MODE01-12 profile security fields reflect tenant config
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { deriveExecutionMode } from "@/components/settings/ExecutionModeCard"

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockGetServerSession = vi.fn()
vi.mock("next-auth", () => ({ getServerSession: mockGetServerSession }))
vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }))

const mockTenantFindUnique = vi.fn()
vi.mock("@/lib/prisma", () => ({
    prisma: {
        tenant: { findUnique: (...a: any[]) => mockTenantFindUnique(...a) },
    },
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSession(role = "ADMIN") {
    return { user: { role, tenantId: "t-1" } }
}

function makeTenant(overrides: Record<string, any> = {}) {
    return {
        id: "t-1",
        name: "Acme Corp",
        plan: "TEAM",
        llmConfig: { provider: "platform_default" },
        workflowConfig: {},
        ssoEnabled: false,
        scimEnabled: false,
        createdAt: new Date("2026-01-01"),
        ...overrides,
    }
}

// ── AC-MODE01-1/2/3: deriveExecutionMode ─────────────────────────────────────

describe("AC-MODE01-1: deriveExecutionMode — platform for null/undefined/platform_default", () => {
    it("returns platform for undefined", () => {
        expect(deriveExecutionMode(undefined)).toBe("platform")
    })
    it("returns platform for empty string", () => {
        expect(deriveExecutionMode("")).toBe("platform")
    })
    it("returns platform for platform_default", () => {
        expect(deriveExecutionMode("platform_default")).toBe("platform")
    })
})

describe("AC-MODE01-2: deriveExecutionMode — byok_cloud for gemini/openai", () => {
    it("returns byok_cloud for gemini", () => {
        expect(deriveExecutionMode("gemini")).toBe("byok_cloud")
    })
    it("returns byok_cloud for openai", () => {
        expect(deriveExecutionMode("openai")).toBe("byok_cloud")
    })
})

describe("AC-MODE01-3: deriveExecutionMode — byok_local for ollama", () => {
    it("returns byok_local for ollama", () => {
        expect(deriveExecutionMode("ollama")).toBe("byok_local")
    })
})

// AC-MODE01-3b: PKG-02 — BYOK is now FREE; FREE plan correctly reflects configured mode
// ExecutionModeCard no longer forces "platform" when plan === "FREE".
// Holistic scoring + custom prompt tone remain PRO+ regardless of mode (plan-aware capability override).
describe("AC-MODE01-3b: FREE plan uses deriveExecutionMode (BYOK available on all plans)", () => {
    it("FREE plan with no provider → platform", () => {
        expect(deriveExecutionMode(undefined)).toBe("platform")
    })
    it("FREE plan with gemini provider → byok_cloud (BYOK is FREE)", () => {
        expect(deriveExecutionMode("gemini")).toBe("byok_cloud")
    })
    it("FREE plan with ollama provider → byok_local (BYOK is FREE)", () => {
        expect(deriveExecutionMode("ollama")).toBe("byok_local")
    })
    it("PRO plan with gemini provider → byok_cloud", () => {
        expect(deriveExecutionMode("gemini")).toBe("byok_cloud")
    })
})

// ── AC-MODE01-4/5/6/7: environment-profile API ───────────────────────────────

describe("AC-MODE01-4: /api/settings/environment-profile returns 401 when unauthenticated", () => {
    beforeEach(() => { vi.resetModules(); mockGetServerSession.mockResolvedValue(null) })

    it("returns 401", async () => {
        const { GET } = await import("@/app/api/settings/environment-profile/route")
        const res = await GET()
        expect(res.status).toBe(401)
    })
})

describe("AC-MODE01-5: /api/settings/environment-profile returns 403 for non-ADMIN", () => {
    beforeEach(() => { vi.resetModules() })

    it("returns 403 for VIEWER role", async () => {
        mockGetServerSession.mockResolvedValue(makeSession("VIEWER"))
        const { GET } = await import("@/app/api/settings/environment-profile/route")
        const res = await GET()
        expect(res.status).toBe(403)
    })

    it("returns 403 for AUDITOR role", async () => {
        mockGetServerSession.mockResolvedValue(makeSession("AUDITOR"))
        const { GET } = await import("@/app/api/settings/environment-profile/route")
        const res = await GET()
        expect(res.status).toBe(403)
    })
})

describe("AC-MODE01-6: /api/settings/environment-profile returns 403 for non-TEAM plan", () => {
    beforeEach(() => { vi.resetModules() })

    it("returns upgrade_required for FREE plan", async () => {
        mockGetServerSession.mockResolvedValue(makeSession("ADMIN"))
        mockTenantFindUnique.mockResolvedValue(makeTenant({ plan: "FREE" }))
        const { GET } = await import("@/app/api/settings/environment-profile/route")
        const res = await GET()
        expect(res.status).toBe(403)
        const body = await res.json()
        expect(body.error).toBe("upgrade_required")
        expect(body.feature).toBe("environment_profile")
    })

    it("returns upgrade_required for PRO plan", async () => {
        mockGetServerSession.mockResolvedValue(makeSession("ADMIN"))
        mockTenantFindUnique.mockResolvedValue(makeTenant({ plan: "PRO" }))
        const { GET } = await import("@/app/api/settings/environment-profile/route")
        const res = await GET()
        expect(res.status).toBe(403)
    })
})

describe("AC-MODE01-7: /api/settings/environment-profile — 200 for TEAM ADMIN", () => {
    beforeEach(() => { vi.resetModules() })

    it("returns 200 with correct structure", async () => {
        mockGetServerSession.mockResolvedValue(makeSession("ADMIN"))
        mockTenantFindUnique.mockResolvedValue(makeTenant({
            llmConfig: { provider: "gemini", apiKey: "secret-key", modelName: "gemini-pro" },
        }))
        const { GET } = await import("@/app/api/settings/environment-profile/route")
        const res = await GET()
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body).toHaveProperty("exportedAt")
        expect(body).toHaveProperty("tenant")
        expect(body).toHaveProperty("executionMode")
        expect(body).toHaveProperty("capabilities")
        expect(body).toHaveProperty("integrations")
        expect(body).toHaveProperty("security")
        expect(body.executionMode.mode).toBe("byok_cloud")
    })

    it("Content-Disposition is attachment with .json filename", async () => {
        mockGetServerSession.mockResolvedValue(makeSession("ADMIN"))
        mockTenantFindUnique.mockResolvedValue(makeTenant())
        const { GET } = await import("@/app/api/settings/environment-profile/route")
        const res = await GET()
        const disposition = res.headers.get("Content-Disposition") ?? ""
        expect(disposition).toContain("attachment")
        expect(disposition).toMatch(/\.json"/)
    })
})

// ── AC-MODE01-8: no secrets in profile ───────────────────────────────────────

describe("AC-MODE01-8: profile never exposes raw API key secrets", () => {
    beforeEach(() => { vi.resetModules() })

    it("apiKey is not present in response — only hasCustomApiKey flag", async () => {
        mockGetServerSession.mockResolvedValue(makeSession("ADMIN"))
        mockTenantFindUnique.mockResolvedValue(makeTenant({
            llmConfig: { provider: "gemini", apiKey: "super-secret-key" },
            workflowConfig: { pluginApiKey: "dg_abcdef", slack: { webhookUrl: "https://hooks.slack.com/xxx" } },
        }))
        const { GET } = await import("@/app/api/settings/environment-profile/route")
        const res = await GET()
        const body = await res.json()
        const text = JSON.stringify(body)
        expect(text).not.toContain("super-secret-key")
        expect(text).not.toContain("dg_abcdef")
        expect(text).not.toContain("hooks.slack.com")
        expect(body.executionMode.hasCustomApiKey).toBe(true)
    })
})

// ── AC-MODE01-9/10: noDataEgressGuarantee ────────────────────────────────────

describe("AC-MODE01-9: capabilities.noDataEgressGuarantee true for byok_local", () => {
    beforeEach(() => { vi.resetModules() })

    it("is true for ollama provider", async () => {
        mockGetServerSession.mockResolvedValue(makeSession("ADMIN"))
        mockTenantFindUnique.mockResolvedValue(makeTenant({
            llmConfig: { provider: "ollama", baseUrl: "http://localhost:11434" },
        }))
        const { GET } = await import("@/app/api/settings/environment-profile/route")
        const res = await GET()
        const body = await res.json()
        expect(body.capabilities.noDataEgressGuarantee).toBe(true)
    })
})

describe("AC-MODE01-10: capabilities.noDataEgressGuarantee false for platform mode", () => {
    beforeEach(() => { vi.resetModules() })

    it("is false for platform_default", async () => {
        mockGetServerSession.mockResolvedValue(makeSession("ADMIN"))
        mockTenantFindUnique.mockResolvedValue(makeTenant({
            llmConfig: { provider: "platform_default" },
        }))
        const { GET } = await import("@/app/api/settings/environment-profile/route")
        const res = await GET()
        const body = await res.json()
        expect(body.capabilities.noDataEgressGuarantee).toBe(false)
    })
})

// ── AC-MODE01-11: integrations ────────────────────────────────────────────────

describe("AC-MODE01-11: profile integrations reflect active connections", () => {
    beforeEach(() => { vi.resetModules() })

    it("slack is true when webhookUrl is set", async () => {
        mockGetServerSession.mockResolvedValue(makeSession("ADMIN"))
        mockTenantFindUnique.mockResolvedValue(makeTenant({
            workflowConfig: {
                slack: { webhookUrl: "enc:xxx" },
                githubIssues: { enabled: true, repo: "org/repo" },
            },
        }))
        const { GET } = await import("@/app/api/settings/environment-profile/route")
        const res = await GET()
        const body = await res.json()
        expect(body.integrations.slack).toBe(true)
        expect(body.integrations.githubIssues).toBe(true)
        expect(body.integrations.jira).toBe(false)
        expect(body.integrations.linear).toBe(false)
    })
})

// ── AC-MODE01-12: security fields ─────────────────────────────────────────────

describe("AC-MODE01-12: profile security fields reflect tenant config", () => {
    beforeEach(() => { vi.resetModules() })

    it("ssoEnabled and scimEnabled are reflected", async () => {
        mockGetServerSession.mockResolvedValue(makeSession("ADMIN"))
        mockTenantFindUnique.mockResolvedValue(makeTenant({
            ssoEnabled: true,
            scimEnabled: true,
            workflowConfig: { aiAuthorMode: true, autoMergeAiDocs: false },
        }))
        const { GET } = await import("@/app/api/settings/environment-profile/route")
        const res = await GET()
        const body = await res.json()
        expect(body.security.ssoEnabled).toBe(true)
        expect(body.security.scimEnabled).toBe(true)
        expect(body.security.aiAuthorMode).toBe(true)
        expect(body.security.autoMergeAiDocs).toBe(false)
    })
})

// ── SEC-10: Sovereign Execution Mode Detection ────────────────────────────────

describe("SEC-10: deriveExecutionMode — sovereign overrides all other providers", () => {
    it("returns sovereign when deploymentMode=sovereign (any llmProvider)", () => {
        expect(deriveExecutionMode(undefined, "sovereign")).toBe("sovereign")
        expect(deriveExecutionMode("platform_default", "sovereign")).toBe("sovereign")
        expect(deriveExecutionMode("gemini", "sovereign")).toBe("sovereign")
        expect(deriveExecutionMode("ollama", "sovereign")).toBe("sovereign")
    })

    it("does not return sovereign when deploymentMode is absent", () => {
        expect(deriveExecutionMode(undefined, undefined)).toBe("platform")
        expect(deriveExecutionMode("gemini", undefined)).toBe("byok_cloud")
    })

    it("does not return sovereign for unrecognised deploymentMode values", () => {
        expect(deriveExecutionMode("ollama", "staging")).toBe("byok_local")
        expect(deriveExecutionMode("gemini", "production")).toBe("byok_cloud")
    })
})

describe("SEC-10: /api/settings/environment-profile — sovereign mode from DEPLOYMENT_MODE env", () => {
    beforeEach(() => { vi.resetModules() })

    it("mode is sovereign and noDataEgressGuarantee is true when DEPLOYMENT_MODE=sovereign", async () => {
        vi.stubEnv("DEPLOYMENT_MODE", "sovereign")
        mockGetServerSession.mockResolvedValue(makeSession("ADMIN"))
        mockTenantFindUnique.mockResolvedValue(makeTenant({
            llmConfig: { provider: "platform_default" },
        }))
        const { GET } = await import("@/app/api/settings/environment-profile/route")
        const res = await GET()
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.executionMode.mode).toBe("sovereign")
        expect(body.capabilities.noDataEgressGuarantee).toBe(true)
        vi.unstubAllEnvs()
    })

    it("mode is platform (not sovereign) when DEPLOYMENT_MODE is absent", async () => {
        vi.stubEnv("DEPLOYMENT_MODE", "")
        mockGetServerSession.mockResolvedValue(makeSession("ADMIN"))
        mockTenantFindUnique.mockResolvedValue(makeTenant({
            llmConfig: { provider: "platform_default" },
        }))
        const { GET } = await import("@/app/api/settings/environment-profile/route")
        const res = await GET()
        const body = await res.json()
        expect(body.executionMode.mode).toBe("platform")
        expect(body.capabilities.noDataEgressGuarantee).toBe(false)
        vi.unstubAllEnvs()
    })

    it("sovereign takes precedence over byok_local (ollama)", async () => {
        vi.stubEnv("DEPLOYMENT_MODE", "sovereign")
        mockGetServerSession.mockResolvedValue(makeSession("ADMIN"))
        mockTenantFindUnique.mockResolvedValue(makeTenant({
            llmConfig: { provider: "ollama", baseUrl: "http://localhost:11434" },
        }))
        const { GET } = await import("@/app/api/settings/environment-profile/route")
        const res = await GET()
        const body = await res.json()
        expect(body.executionMode.mode).toBe("sovereign")
        vi.unstubAllEnvs()
    })
})
