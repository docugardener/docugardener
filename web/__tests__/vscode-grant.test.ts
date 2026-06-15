// SPDX-License-Identifier: AGPL-3.0-or-later
/** UX-VSCODE-ONBOARD-01 — POST /api/vscode/grant. */
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }))
vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }))

import { getServerSession } from "next-auth"
import { POST } from "@/app/api/vscode/grant/route"

const mockSession = vi.mocked(getServerSession)
const VALID_REDIRECT = "vscode://docugardener.docugardener/auth-callback"

function req(body: unknown) {
    return new Request("http://localhost/api/vscode/grant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    })
}

describe("POST /api/vscode/grant", () => {
    beforeEach(() => vi.clearAllMocks())

    it("401 when not signed in", async () => {
        mockSession.mockResolvedValue(null)
        const res = await POST(req({ redirect_uri: VALID_REDIRECT, state: "s1" }))
        expect(res.status).toBe(401)
    })

    it("400 on a disallowed redirect_uri", async () => {
        mockSession.mockResolvedValue({ user: { tenantId: "t1" } } as any)
        const res = await POST(req({ redirect_uri: "https://evil.example.com/cb", state: "s1" }))
        expect(res.status).toBe(400)
    })

    it("400 on missing state", async () => {
        mockSession.mockResolvedValue({ user: { tenantId: "t1" } } as any)
        const res = await POST(req({ redirect_uri: VALID_REDIRECT, state: "" }))
        expect(res.status).toBe(400)
    })

    it("returns a redirectUrl carrying code + state for a valid request", async () => {
        mockSession.mockResolvedValue({ user: { tenantId: "t1" } } as any)
        const res = await POST(req({ redirect_uri: VALID_REDIRECT, state: "s1" }))
        expect(res.status).toBe(200)
        const data = await res.json()
        expect(data.redirectUrl).toMatch(
            /^vscode:\/\/docugardener\.docugardener\/auth-callback\?code=.+&state=s1$/,
        )
    })
})
