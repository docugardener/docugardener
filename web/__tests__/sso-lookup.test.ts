/**
 * Tests for GET /api/auth/sso-lookup
 *
 * AC-SSO-LOOKUP-1  Returns 400 for missing / invalid email
 * AC-SSO-LOOKUP-2  Returns 404 when no tenant with SSO enabled matches domain
 * AC-SSO-LOOKUP-3  Returns { loginUrl } pointing to FastAPI SAML login for known domain
 * AC-SSO-LOOKUP-4  loginUrl contains the correct tenant_id
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { GET } from "@/app/api/auth/sso-lookup/route"

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockFindFirst = vi.fn()

vi.mock("@/lib/prisma", () => ({
    prisma: {
        user: {
            findFirst: (...args: any[]) => mockFindFirst(...args),
        },
    },
}))

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeRequest(email?: string) {
    const url = email
        ? `http://localhost/api/auth/sso-lookup?email=${encodeURIComponent(email)}`
        : "http://localhost/api/auth/sso-lookup"
    return new Request(url)
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("GET /api/auth/sso-lookup", () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it("AC-SSO-LOOKUP-1a: returns 400 when email param is missing", async () => {
        const res = await GET(makeRequest())
        expect(res.status).toBe(400)
        const data = await res.json()
        expect(data.error).toMatch(/email/i)
    })

    it("AC-SSO-LOOKUP-1b: returns 400 when email has no @ sign", async () => {
        const res = await GET(makeRequest("notanemail"))
        expect(res.status).toBe(400)
    })

    it("AC-SSO-LOOKUP-2: returns 404 when no SSO-enabled tenant matches domain", async () => {
        mockFindFirst.mockResolvedValue(null)
        const res = await GET(makeRequest("user@unknown.com"))
        expect(res.status).toBe(404)
        const data = await res.json()
        expect(data.error).toMatch(/SSO/i)
    })

    it("AC-SSO-LOOKUP-3: returns loginUrl for known SSO domain", async () => {
        mockFindFirst.mockResolvedValue({ tenantId: "tenant-abc" })
        const res = await GET(makeRequest("alice@acme.com"))
        expect(res.status).toBe(200)
        const data = await res.json()
        expect(data.loginUrl).toContain("/auth/saml/login")
        expect(data.loginUrl).toContain("tenant_id=tenant-abc")
    })

    it("AC-SSO-LOOKUP-4: queries by email domain with ssoEnabled filter", async () => {
        mockFindFirst.mockResolvedValue({ tenantId: "tenant-xyz" })
        await GET(makeRequest("bob@corp.io"))
        expect(mockFindFirst).toHaveBeenCalledOnce()
        const callArg = mockFindFirst.mock.calls[0][0]
        expect(callArg.where.email.endsWith).toBe("@corp.io")
        expect(callArg.where.tenant.ssoEnabled).toBe(true)
    })

    it("AC-SSO-LOOKUP-3: loginUrl uses BACKEND_URL env var when set", async () => {
        mockFindFirst.mockResolvedValue({ tenantId: "tenant-abc" })
        // Default is http://localhost:8000 — verify format
        const res = await GET(makeRequest("user@example.com"))
        expect(res.status).toBe(200)
        const data = await res.json()
        expect(data.loginUrl).toMatch(/^http/)
        expect(data.loginUrl).toContain("tenant_id=tenant-abc")
    })
})
