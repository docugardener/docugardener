// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock next-auth
vi.mock("next-auth", () => ({ default: vi.fn(), getServerSession: vi.fn() }))
vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }))

const mockGetServerSession = vi.fn()
vi.mock("next-auth", () => ({ getServerSession: mockGetServerSession }))

describe("github-app-prefill route (ENV-DUP-01)", () => {
    beforeEach(() => {
        vi.resetAllMocks()
        vi.stubEnv("ENCRYPTION_KEY", "test-key-32chars-exactly-here!!")
        vi.stubEnv("BACKEND_URL", "http://localhost:8000")
    })

    it("returns 401 when unauthenticated", async () => {
        mockGetServerSession.mockResolvedValue(null)
        const { GET } = await import("@/app/api/onboarding/github-app-prefill/route")
        const res = await GET()
        expect(res.status).toBe(401)
    })

    it("returns empty profile when ENCRYPTION_KEY is missing", async () => {
        mockGetServerSession.mockResolvedValue({ user: { id: "u1" } })
        vi.stubEnv("ENCRYPTION_KEY", "")
        const { GET } = await import("@/app/api/onboarding/github-app-prefill/route")
        const res = await GET()
        const data = await res.json()
        expect(data).toEqual({ appId: "", webhookSecret: "", privateKey: "" })
    })

    it("proxies profile from backend when authenticated", async () => {
        mockGetServerSession.mockResolvedValue({ user: { id: "u1" } })
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ appId: "123", webhookSecret: "sec", privateKey: "PEM" }),
        }) as unknown as typeof fetch

        const { GET } = await import("@/app/api/onboarding/github-app-prefill/route")
        const res = await GET()
        const data = await res.json()

        expect(data.appId).toBe("123")
        expect(data.webhookSecret).toBe("sec")
        expect(data.privateKey).toBe("PEM")
        expect(global.fetch).toHaveBeenCalledWith(
            "http://localhost:8000/environment/github-app-profile",
            expect.objectContaining({
                headers: { "x-internal-token": "test-key-32chars-exactly-here!!" },
            })
        )
    })

    it("returns empty profile when backend call fails", async () => {
        mockGetServerSession.mockResolvedValue({ user: { id: "u1" } })
        global.fetch = vi.fn().mockRejectedValue(new Error("connection refused")) as unknown as typeof fetch

        const { GET } = await import("@/app/api/onboarding/github-app-prefill/route")
        const res = await GET()
        const data = await res.json()
        expect(data).toEqual({ appId: "", webhookSecret: "", privateKey: "" })
    })
})
