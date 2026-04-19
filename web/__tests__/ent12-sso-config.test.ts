/**
 * Tests for GET/POST /api/settings/sso
 *
 * Covers:
 *   A. Auth — 401 unauthenticated, 403 non-ADMIN, 402 wrong plan
 *   B. GET — returns config (certificate redacted to hasCertificate boolean),
 *            includes sessionIdleTimeoutMinutes
 *   C. POST — saves config, certificate encrypted before storing,
 *             empty cert not updated, sessionIdleTimeoutMinutes clamped
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockFindUnique = vi.fn()
const mockUpdate = vi.fn()
const mockFindMany = vi.fn()
const mockCreate = vi.fn()
vi.mock("@/lib/prisma", () => ({
    prisma: {
        tenant: { findUnique: mockFindUnique, update: mockUpdate },
        auditLog: { findMany: mockFindMany, create: mockCreate },
    },
}))

const mockGetServerSession = vi.fn()
vi.mock("next-auth", () => ({ getServerSession: mockGetServerSession }))
vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }))
vi.mock("@/lib/audit", () => ({
    writeAuditLog: vi.fn().mockResolvedValue(undefined),
    AuditEvent: { SSO_CONFIG_CHANGED: "SSO_CONFIG_CHANGED" },
}))

const mockEncrypt = vi.fn((text: string) => `encrypted:${text}`)
vi.mock("@/lib/encryption", () => ({ encrypt: mockEncrypt }))

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeAdminSession(tenantId = "t-1") {
    return { user: { id: "u-admin", email: "admin@test.com", role: "ADMIN", tenantId } }
}

const TEAM_TENANT = {
    id: "t-1",
    plan: "TEAM",
    ssoEnabled: true,
    ssoProvider: "okta",
    samlIdpEntityId: "https://idp.example.com",
    samlIdpSsoUrl: "https://idp.example.com/sso",
    samlIdpCertificate: "iv:tag:encrypted_cert_data",
    samlAttrEmail: "email",
    samlAttrRole: "groups",
    samlRoleMapAdmin: "docugardener-admin",
    sessionIdleTimeoutMinutes: 60,
}

// ── A. Auth ────────────────────────────────────────────────────────────────────

describe("GET /api/settings/sso — auth", () => {
    beforeEach(() => { vi.resetModules(); vi.resetAllMocks() })

    it("returns 401 when not authenticated", async () => {
        mockGetServerSession.mockResolvedValue(null)
        const { GET } = await import("@/app/api/settings/sso/route")
        const res = await GET(new Request("http://localhost/api/settings/sso"))
        expect(res.status).toBe(401)
    })

    it("returns 403 for AUDITOR role", async () => {
        mockGetServerSession.mockResolvedValue({
            user: { id: "u-1", email: "a@test.com", role: "AUDITOR", tenantId: "t-1" },
        })
        mockFindUnique.mockResolvedValue(TEAM_TENANT)
        const { GET } = await import("@/app/api/settings/sso/route")
        const res = await GET(new Request("http://localhost/api/settings/sso"))
        expect(res.status).toBe(403)
    })

    it("returns 402 for FREE plan tenant", async () => {
        mockGetServerSession.mockResolvedValue(makeAdminSession())
        mockFindUnique.mockResolvedValue({ ...TEAM_TENANT, plan: "FREE" })
        const { GET } = await import("@/app/api/settings/sso/route")
        const res = await GET(new Request("http://localhost/api/settings/sso"))
        expect(res.status).toBe(402)
    })
})

// ── B. GET ─────────────────────────────────────────────────────────────────────

describe("GET /api/settings/sso — returns config", () => {
    beforeEach(() => { vi.resetModules(); vi.resetAllMocks() })

    it("returns sso config with hasCertificate=true, no raw cert", async () => {
        mockGetServerSession.mockResolvedValue(makeAdminSession())
        mockFindUnique.mockResolvedValue(TEAM_TENANT)
        const { GET } = await import("@/app/api/settings/sso/route")
        const res = await GET(new Request("http://localhost/api/settings/sso"))
        expect(res.status).toBe(200)
        const data = await res.json()
        expect(data.ssoEnabled).toBe(true)
        expect(data.ssoProvider).toBe("okta")
        expect(data.hasCertificate).toBe(true)
        // Must NOT expose raw certificate
        expect(data).not.toHaveProperty("samlIdpCertificate")
    })

    it("returns sessionIdleTimeoutMinutes from DB", async () => {
        mockGetServerSession.mockResolvedValue(makeAdminSession())
        mockFindUnique.mockResolvedValue({ ...TEAM_TENANT, sessionIdleTimeoutMinutes: 120 })
        const { GET } = await import("@/app/api/settings/sso/route")
        const res = await GET(new Request("http://localhost/api/settings/sso"))
        const data = await res.json()
        expect(data.sessionIdleTimeoutMinutes).toBe(120)
    })

    it("returns null for sessionIdleTimeoutMinutes when unset", async () => {
        mockGetServerSession.mockResolvedValue(makeAdminSession())
        mockFindUnique.mockResolvedValue({ ...TEAM_TENANT, sessionIdleTimeoutMinutes: null })
        const { GET } = await import("@/app/api/settings/sso/route")
        const res = await GET(new Request("http://localhost/api/settings/sso"))
        const data = await res.json()
        expect(data.sessionIdleTimeoutMinutes).toBeNull()
    })

    it("returns hasCertificate=false when no cert saved", async () => {
        mockGetServerSession.mockResolvedValue(makeAdminSession())
        mockFindUnique.mockResolvedValue({ ...TEAM_TENANT, samlIdpCertificate: null })
        const { GET } = await import("@/app/api/settings/sso/route")
        const res = await GET(new Request("http://localhost/api/settings/sso"))
        const data = await res.json()
        expect(data.hasCertificate).toBe(false)
    })
})

// ── C. POST ────────────────────────────────────────────────────────────────────

describe("POST /api/settings/sso — saves config", () => {
    beforeEach(() => { vi.resetModules(); vi.resetAllMocks() })

    it("updates sso config and returns ok", async () => {
        mockGetServerSession.mockResolvedValue(makeAdminSession())
        mockFindUnique.mockResolvedValue(TEAM_TENANT)
        mockUpdate.mockResolvedValue({ id: "t-1" })
        mockFindMany.mockResolvedValue([])
        mockCreate.mockResolvedValue({})

        const { POST } = await import("@/app/api/settings/sso/route")
        const res = await POST(new Request("http://localhost/api/settings/sso", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                ssoEnabled: false,
                ssoProvider: "azure_ad",
                samlIdpEntityId: "https://new-idp.com",
                samlIdpSsoUrl: "https://new-idp.com/sso",
            }),
        }))
        expect(res.status).toBe(200)
        const data = await res.json()
        expect(data.ok).toBe(true)
        expect(mockUpdate).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ ssoEnabled: false, ssoProvider: "azure_ad" }),
            })
        )
    })

    it("does not update certificate when empty string is sent", async () => {
        mockGetServerSession.mockResolvedValue(makeAdminSession())
        mockFindUnique.mockResolvedValue(TEAM_TENANT)
        mockUpdate.mockResolvedValue({ id: "t-1" })
        mockFindMany.mockResolvedValue([])
        mockCreate.mockResolvedValue({})

        const { POST } = await import("@/app/api/settings/sso/route")
        await POST(new Request("http://localhost/api/settings/sso", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ssoEnabled: true, samlIdpCertificate: "" }),
        }))
        // samlIdpCertificate should NOT be in the update data when empty
        const updateCall = mockUpdate.mock.calls[0][0]
        expect(updateCall.data).not.toHaveProperty("samlIdpCertificate")
    })

    it("encrypts certificate before saving when a non-empty PEM is provided", async () => {
        mockGetServerSession.mockResolvedValue(makeAdminSession())
        mockFindUnique.mockResolvedValue(TEAM_TENANT)
        mockUpdate.mockResolvedValue({ id: "t-1" })
        mockFindMany.mockResolvedValue([])
        mockCreate.mockResolvedValue({})
        mockEncrypt.mockReturnValue("iv:tag:encrypted_pem")

        const { POST } = await import("@/app/api/settings/sso/route")
        await POST(new Request("http://localhost/api/settings/sso", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                ssoEnabled: true,
                samlIdpCertificate: "-----BEGIN CERTIFICATE-----\nNEW\n-----END CERTIFICATE-----",
            }),
        }))
        // encrypt() must have been called with the plaintext PEM
        expect(mockEncrypt).toHaveBeenCalledWith(
            expect.stringContaining("BEGIN CERTIFICATE")
        )
        // The stored value should be the encrypted result, not the raw PEM
        const updateCall = mockUpdate.mock.calls[0][0]
        expect(updateCall.data.samlIdpCertificate).toBe("iv:tag:encrypted_pem")
    })

    it("saves sessionIdleTimeoutMinutes when provided", async () => {
        mockGetServerSession.mockResolvedValue(makeAdminSession())
        mockFindUnique.mockResolvedValue(TEAM_TENANT)
        mockUpdate.mockResolvedValue({ id: "t-1" })
        mockFindMany.mockResolvedValue([])
        mockCreate.mockResolvedValue({})

        const { POST } = await import("@/app/api/settings/sso/route")
        await POST(new Request("http://localhost/api/settings/sso", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ssoEnabled: true, sessionIdleTimeoutMinutes: 120 }),
        }))
        const updateCall = mockUpdate.mock.calls[0][0]
        expect(updateCall.data.sessionIdleTimeoutMinutes).toBe(120)
    })

    it("clamps sessionIdleTimeoutMinutes to max 10080 (7 days)", async () => {
        mockGetServerSession.mockResolvedValue(makeAdminSession())
        mockFindUnique.mockResolvedValue(TEAM_TENANT)
        mockUpdate.mockResolvedValue({ id: "t-1" })
        mockFindMany.mockResolvedValue([])
        mockCreate.mockResolvedValue({})

        const { POST } = await import("@/app/api/settings/sso/route")
        await POST(new Request("http://localhost/api/settings/sso", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ssoEnabled: true, sessionIdleTimeoutMinutes: 99999 }),
        }))
        const updateCall = mockUpdate.mock.calls[0][0]
        expect(updateCall.data.sessionIdleTimeoutMinutes).toBe(10080)
    })

    it("saves null for sessionIdleTimeoutMinutes when not a number", async () => {
        mockGetServerSession.mockResolvedValue(makeAdminSession())
        mockFindUnique.mockResolvedValue(TEAM_TENANT)
        mockUpdate.mockResolvedValue({ id: "t-1" })
        mockFindMany.mockResolvedValue([])
        mockCreate.mockResolvedValue({})

        const { POST } = await import("@/app/api/settings/sso/route")
        await POST(new Request("http://localhost/api/settings/sso", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ssoEnabled: true, sessionIdleTimeoutMinutes: null }),
        }))
        const updateCall = mockUpdate.mock.calls[0][0]
        expect(updateCall.data.sessionIdleTimeoutMinutes).toBeNull()
    })

    it("saves samlDefaultRole when AUDITOR is provided", async () => {
        mockGetServerSession.mockResolvedValue(makeAdminSession())
        mockFindUnique.mockResolvedValue(TEAM_TENANT)
        mockUpdate.mockResolvedValue({ id: "t-1" })
        mockFindMany.mockResolvedValue([])
        mockCreate.mockResolvedValue({})

        const { POST } = await import("@/app/api/settings/sso/route")
        await POST(new Request("http://localhost/api/settings/sso", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ssoEnabled: true, samlDefaultRole: "AUDITOR" }),
        }))
        const updateCall = mockUpdate.mock.calls[0][0]
        expect(updateCall.data.samlDefaultRole).toBe("AUDITOR")
    })

    it("saves samlDefaultRole when BILLING_ADMIN is provided", async () => {
        mockGetServerSession.mockResolvedValue(makeAdminSession())
        mockFindUnique.mockResolvedValue(TEAM_TENANT)
        mockUpdate.mockResolvedValue({ id: "t-1" })
        mockFindMany.mockResolvedValue([])
        mockCreate.mockResolvedValue({})

        const { POST } = await import("@/app/api/settings/sso/route")
        await POST(new Request("http://localhost/api/settings/sso", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ssoEnabled: true, samlDefaultRole: "BILLING_ADMIN" }),
        }))
        const updateCall = mockUpdate.mock.calls[0][0]
        expect(updateCall.data.samlDefaultRole).toBe("BILLING_ADMIN")
    })

    it("saves null for samlDefaultRole when ADMIN is provided (admin not allowed as default)", async () => {
        mockGetServerSession.mockResolvedValue(makeAdminSession())
        mockFindUnique.mockResolvedValue(TEAM_TENANT)
        mockUpdate.mockResolvedValue({ id: "t-1" })
        mockFindMany.mockResolvedValue([])
        mockCreate.mockResolvedValue({})

        const { POST } = await import("@/app/api/settings/sso/route")
        await POST(new Request("http://localhost/api/settings/sso", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ssoEnabled: true, samlDefaultRole: "ADMIN" }),
        }))
        const updateCall = mockUpdate.mock.calls[0][0]
        // ADMIN is not in ALLOWED_DEFAULT_ROLES → stored as null, backend falls back to VIEWER
        expect(updateCall.data.samlDefaultRole).toBeNull()
    })

    it("saves null for samlDefaultRole when field is missing from body", async () => {
        mockGetServerSession.mockResolvedValue(makeAdminSession())
        mockFindUnique.mockResolvedValue(TEAM_TENANT)
        mockUpdate.mockResolvedValue({ id: "t-1" })
        mockFindMany.mockResolvedValue([])
        mockCreate.mockResolvedValue({})

        const { POST } = await import("@/app/api/settings/sso/route")
        await POST(new Request("http://localhost/api/settings/sso", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ssoEnabled: true }),
        }))
        const updateCall = mockUpdate.mock.calls[0][0]
        expect(updateCall.data.samlDefaultRole).toBeNull()
    })
})

// ── D. GET — samlDefaultRole ───────────────────────────────────────────────────

describe("GET /api/settings/sso — samlDefaultRole", () => {
    beforeEach(() => { vi.resetModules(); vi.resetAllMocks() })

    it("returns samlDefaultRole from DB when set", async () => {
        mockGetServerSession.mockResolvedValue(makeAdminSession())
        mockFindUnique.mockResolvedValue({ ...TEAM_TENANT, samlDefaultRole: "AUDITOR" })
        const { GET } = await import("@/app/api/settings/sso/route")
        const res = await GET(new Request("http://localhost/api/settings/sso"))
        const data = await res.json()
        expect(data.samlDefaultRole).toBe("AUDITOR")
    })

    it("returns VIEWER as default when samlDefaultRole is null in DB", async () => {
        mockGetServerSession.mockResolvedValue(makeAdminSession())
        mockFindUnique.mockResolvedValue({ ...TEAM_TENANT, samlDefaultRole: null })
        const { GET } = await import("@/app/api/settings/sso/route")
        const res = await GET(new Request("http://localhost/api/settings/sso"))
        const data = await res.json()
        expect(data.samlDefaultRole).toBe("VIEWER")
    })
})
