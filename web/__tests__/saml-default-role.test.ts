// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * BUG-SSO-05: samlDefaultRole API + UI tests.
 *
 * Covers:
 *   A. GET /api/settings/sso — returns samlDefaultRole field
 *   B. POST /api/settings/sso — saves AUDITOR / BILLING_ADMIN / VIEWER
 *   C. POST /api/settings/sso — rejects ADMIN as default role (silently sets null)
 *   D. POST /api/settings/sso — unknown role treated as null → VIEWER fallback
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockFindUnique = vi.fn()
const mockUpdate = vi.fn()
vi.mock("@/lib/prisma", () => ({
    prisma: {
        tenant: { findUnique: mockFindUnique, update: mockUpdate },
        auditLog: { findMany: vi.fn(), create: vi.fn() },
    },
}))

const mockGetServerSession = vi.fn()
vi.mock("next-auth", () => ({ getServerSession: mockGetServerSession }))
vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }))
vi.mock("@/lib/audit", () => ({
    writeAuditLog: vi.fn().mockResolvedValue(undefined),
    AuditEvent: { SSO_CONFIG_CHANGED: "SSO_CONFIG_CHANGED" },
}))
vi.mock("@/lib/encryption", () => ({
    encrypt: vi.fn((text: string) => `encrypted:${text}`),
    decrypt: vi.fn((text: string) => text.replace("encrypted:", "")),
}))

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeAdminSession(tenantId = "t-sso") {
    return { user: { id: "u-admin", email: "admin@test.com", role: "ADMIN", tenantId } }
}

const TEAM_TENANT = {
    id: "t-sso",
    plan: "TEAM",
    ssoEnabled: true,
    ssoProvider: "okta",
    samlIdpEntityId: "https://idp.example.com",
    samlIdpSsoUrl: "https://idp.example.com/sso",
    samlIdpCertificate: "iv:tag:cert",
    samlAttrEmail: "email",
    samlAttrRole: "groups",
    samlRoleMapAdmin: "dg-admin",
    samlDefaultRole: "VIEWER",
    sessionIdleTimeoutMinutes: null,
    workflowConfig: {},
}

function makeRequest(method: string, body?: object) {
    return new Request("http://localhost/api/settings/sso", {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
    })
}

// ── A. GET returns samlDefaultRole ────────────────────────────────────────────

describe("A. GET — samlDefaultRole field", () => {
    beforeEach(() => { vi.resetModules(); vi.resetAllMocks() })

    it("returns samlDefaultRole when set to VIEWER", async () => {
        mockGetServerSession.mockResolvedValue(makeAdminSession())
        mockFindUnique.mockResolvedValue({ ...TEAM_TENANT, samlDefaultRole: "VIEWER" })
        const { GET } = await import("@/app/api/settings/sso/route")
        const res = await GET(makeRequest("GET"))
        const data = await res.json()
        expect(data.samlDefaultRole).toBe("VIEWER")
    })

    it("returns samlDefaultRole when set to AUDITOR", async () => {
        mockGetServerSession.mockResolvedValue(makeAdminSession())
        mockFindUnique.mockResolvedValue({ ...TEAM_TENANT, samlDefaultRole: "AUDITOR" })
        const { GET } = await import("@/app/api/settings/sso/route")
        const res = await GET(makeRequest("GET"))
        const data = await res.json()
        expect(data.samlDefaultRole).toBe("AUDITOR")
    })

    it("defaults to VIEWER when samlDefaultRole is null in DB", async () => {
        mockGetServerSession.mockResolvedValue(makeAdminSession())
        mockFindUnique.mockResolvedValue({ ...TEAM_TENANT, samlDefaultRole: null })
        const { GET } = await import("@/app/api/settings/sso/route")
        const res = await GET(makeRequest("GET"))
        const data = await res.json()
        expect(data.samlDefaultRole).toBe("VIEWER")
    })
})

// ── B. POST saves valid roles ─────────────────────────────────────────────────

describe("B. POST — saves valid samlDefaultRole", () => {
    beforeEach(() => { vi.resetModules(); vi.resetAllMocks() })

    it("saves AUDITOR as default role", async () => {
        mockGetServerSession.mockResolvedValue(makeAdminSession())
        mockFindUnique.mockResolvedValue(TEAM_TENANT)
        mockUpdate.mockResolvedValue(TEAM_TENANT)
        const { POST } = await import("@/app/api/settings/sso/route")
        await POST(makeRequest("POST", {
            ssoEnabled: true, ssoProvider: "okta",
            samlDefaultRole: "AUDITOR",
        }))
        const updateCall = mockUpdate.mock.calls[0][0]
        expect(updateCall.data.samlDefaultRole).toBe("AUDITOR")
    })

    it("saves BILLING_ADMIN as default role", async () => {
        mockGetServerSession.mockResolvedValue(makeAdminSession())
        mockFindUnique.mockResolvedValue(TEAM_TENANT)
        mockUpdate.mockResolvedValue(TEAM_TENANT)
        const { POST } = await import("@/app/api/settings/sso/route")
        await POST(makeRequest("POST", {
            ssoEnabled: true, ssoProvider: "okta",
            samlDefaultRole: "BILLING_ADMIN",
        }))
        const updateCall = mockUpdate.mock.calls[0][0]
        expect(updateCall.data.samlDefaultRole).toBe("BILLING_ADMIN")
    })

    it("saves VIEWER as default role", async () => {
        mockGetServerSession.mockResolvedValue(makeAdminSession())
        mockFindUnique.mockResolvedValue(TEAM_TENANT)
        mockUpdate.mockResolvedValue(TEAM_TENANT)
        const { POST } = await import("@/app/api/settings/sso/route")
        await POST(makeRequest("POST", {
            ssoEnabled: true, ssoProvider: "okta",
            samlDefaultRole: "VIEWER",
        }))
        const updateCall = mockUpdate.mock.calls[0][0]
        expect(updateCall.data.samlDefaultRole).toBe("VIEWER")
    })
})

// ── C. ADMIN default role silently set to null ────────────────────────────────

describe("C. POST — ADMIN as default role is rejected", () => {
    beforeEach(() => { vi.resetModules(); vi.resetAllMocks() })

    it("stores null when samlDefaultRole=ADMIN (backend safety)", async () => {
        mockGetServerSession.mockResolvedValue(makeAdminSession())
        mockFindUnique.mockResolvedValue(TEAM_TENANT)
        mockUpdate.mockResolvedValue(TEAM_TENANT)
        const { POST } = await import("@/app/api/settings/sso/route")
        await POST(makeRequest("POST", {
            ssoEnabled: true, ssoProvider: "okta",
            samlDefaultRole: "ADMIN",
        }))
        const updateCall = mockUpdate.mock.calls[0][0]
        // ADMIN is not in ALLOWED_DEFAULT_ROLES → stored as null
        expect(updateCall.data.samlDefaultRole).toBeNull()
    })
})

// ── D. Unknown role → null ────────────────────────────────────────────────────

describe("D. POST — unknown role stored as null", () => {
    beforeEach(() => { vi.resetModules(); vi.resetAllMocks() })

    it("stores null for unrecognized role string", async () => {
        mockGetServerSession.mockResolvedValue(makeAdminSession())
        mockFindUnique.mockResolvedValue(TEAM_TENANT)
        mockUpdate.mockResolvedValue(TEAM_TENANT)
        const { POST } = await import("@/app/api/settings/sso/route")
        await POST(makeRequest("POST", {
            ssoEnabled: true, ssoProvider: "okta",
            samlDefaultRole: "SUPERUSER",
        }))
        const updateCall = mockUpdate.mock.calls[0][0]
        expect(updateCall.data.samlDefaultRole).toBeNull()
    })

    it("stores null when samlDefaultRole is omitted", async () => {
        mockGetServerSession.mockResolvedValue(makeAdminSession())
        mockFindUnique.mockResolvedValue(TEAM_TENANT)
        mockUpdate.mockResolvedValue(TEAM_TENANT)
        const { POST } = await import("@/app/api/settings/sso/route")
        await POST(makeRequest("POST", { ssoEnabled: true, ssoProvider: "okta" }))
        const updateCall = mockUpdate.mock.calls[0][0]
        expect(updateCall.data.samlDefaultRole).toBeNull()
    })
})
