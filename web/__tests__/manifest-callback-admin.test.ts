// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Tests for GitHub App manifest callback — first-user-ADMIN promotion.
 *
 * The callback handler must set role="ADMIN" when linking the installing user
 * to their new tenant. The user who sets up the GitHub App is always the
 * tenant initiator and must receive ADMIN access.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockUserUpdate = vi.fn()
const mockTenantUpsert = vi.fn()
const mockFetch = vi.fn()
const mockEncrypt = vi.fn((v: string) => `enc:${v}`)
const mockGetServerSession = vi.fn()

vi.mock("@/lib/prisma", () => ({
    prisma: {
        user: { update: mockUserUpdate },
        tenant: { upsert: mockTenantUpsert },
    },
}))

vi.mock("@/lib/encryption", () => ({ encrypt: mockEncrypt }))

vi.mock("next-auth", () => ({ getServerSession: mockGetServerSession }))

vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }))

global.fetch = mockFetch

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRequest(code = "test-code") {
    return {
        nextUrl: { searchParams: new URLSearchParams({ code }) },
    } as any
}

function makeGitHubAppData() {
    return {
        id: 12345,
        slug: "my-app",
        pem: "PRIVATE_KEY",
        webhook_secret: "WEBHOOK_SECRET",
        owner: { id: 99, login: "my-org" },
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("manifest callback — first-user-ADMIN promotion", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        process.env.NEXTAUTH_URL = "https://docugardener.dev"

        mockGetServerSession.mockResolvedValue({
            user: { email: "owner@example.com" },
        })

        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => makeGitHubAppData(),
        })

        mockTenantUpsert.mockResolvedValue({ id: "tenant-001" })
        mockUserUpdate.mockResolvedValue({})
    })

    it("sets role=ADMIN when linking user to new tenant", async () => {
        const { POST } = await import("@/app/api/github/manifest/callback/route")
        await POST(makeRequest())

        expect(mockUserUpdate).toHaveBeenCalledWith({
            where: { email: "owner@example.com" },
            data: { tenantId: "tenant-001", role: "ADMIN" },
        })
    })

    it("includes tenantId in the user update", async () => {
        mockTenantUpsert.mockResolvedValue({ id: "tenant-xyz" })
        const { POST } = await import("@/app/api/github/manifest/callback/route")
        await POST(makeRequest())

        const updateCall = mockUserUpdate.mock.calls[0][0]
        expect(updateCall.data.tenantId).toBe("tenant-xyz")
        expect(updateCall.data.role).toBe("ADMIN")
    })

    it("redirects to GitHub App installation URL on success", async () => {
        const { POST } = await import("@/app/api/github/manifest/callback/route")
        const res = await POST(makeRequest())

        // NextResponse.redirect returns a Response with Location header
        const location = res.headers?.get?.("location") ?? (res as any).url ?? ""
        expect(location).toContain("github.com/apps/my-app/installations/new")
    })

    it("redirects to onboarding if no session", async () => {
        mockGetServerSession.mockResolvedValue(null)
        const { POST } = await import("@/app/api/github/manifest/callback/route")
        const res = await POST(makeRequest())

        const location = res.headers?.get?.("location") ?? (res as any).url ?? ""
        expect(location).toContain("/onboarding")
        expect(mockUserUpdate).not.toHaveBeenCalled()
    })

    it("redirects to onboarding if GitHub API fails", async () => {
        mockFetch.mockResolvedValue({ ok: false, text: async () => "error" })
        const { POST } = await import("@/app/api/github/manifest/callback/route")
        const res = await POST(makeRequest())

        const location = res.headers?.get?.("location") ?? (res as any).url ?? ""
        expect(location).toContain("/onboarding")
        expect(mockUserUpdate).not.toHaveBeenCalled()
    })
})
