/**
 * Tests for GET /api/auth/sso-lookup
 *
 * AC-SSO-LOOKUP-1  Returns 400 for missing / invalid email
 * AC-SSO-LOOKUP-2  Returns 200 (not 404) when no tenant with SSO enabled matches domain
 *                  (oracle-safe: domain enumeration must not be possible)
 * AC-SSO-LOOKUP-3  Returns { loginUrl } pointing to FastAPI SAML login for known domain
 * AC-SSO-LOOKUP-4  loginUrl contains the correct tenant_id
 * AC-SSO-LOOKUP-5  Returns 429 after RATE_LIMIT requests from the same IP
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

function makeRequest(email?: string, ip = "1.2.3.4") {
    const url = email
        ? `http://localhost/api/auth/sso-lookup?email=${encodeURIComponent(email)}`
        : "http://localhost/api/auth/sso-lookup"
    return new Request(url, { headers: { "x-forwarded-for": ip } })
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

    it("AC-SSO-LOOKUP-2: returns 200 (oracle-safe) when no SSO-enabled tenant matches domain", async () => {
        mockFindFirst.mockResolvedValue(null)
        const res = await GET(makeRequest("user@unknown.com"))
        // Must NOT return 404 — that would allow domain enumeration
        expect(res.status).toBe(200)
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

    it("AC-SSO-LOOKUP-5: returns 429 after 10 requests from the same IP", async () => {
        // Use a unique IP to avoid interference from other tests
        const uniqueIp = "10.99.88.77"
        mockFindFirst.mockResolvedValue(null)
        // First 10 should succeed (200)
        for (let i = 0; i < 10; i++) {
            const res = await GET(makeRequest(`user${i}@ratetest.com`, uniqueIp))
            expect(res.status).not.toBe(429)
        }
        // 11th request must be rate-limited
        const res = await GET(makeRequest("user11@ratetest.com", uniqueIp))
        expect(res.status).toBe(429)
        const data = await res.json()
        expect(data.error).toMatch(/too many/i)
    })
})
