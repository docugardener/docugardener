// SPDX-License-Identifier: AGPL-3.0-or-later
/** UX-VSCODE-ONBOARD-01 — POST /api/vscode/token (code → plugin API key). */
import { describe, it, expect, vi, beforeEach } from "vitest"

const mockFindUnique = vi.fn()
const mockUpdate = vi.fn()
vi.mock("@/lib/prisma", () => ({
    prisma: {
        tenant: {
            findUnique: (...a: any[]) => mockFindUnique(...a),
            update: (...a: any[]) => mockUpdate(...a),
        },
    },
}))

import { POST } from "@/app/api/vscode/token/route"
import { putAuthCode, _clearAuthCodes } from "@/lib/vscode-auth-codes"

function req(body: unknown) {
    return new Request("http://localhost/api/vscode/token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    })
}

describe("POST /api/vscode/token", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        _clearAuthCodes()
        mockUpdate.mockResolvedValue({})
    })

    it("401 on an invalid/expired code", async () => {
        const res = await POST(req({ code: "nope" }))
        expect(res.status).toBe(401)
    })

    it("returns the tenant's existing key (idempotent, no rotation)", async () => {
        putAuthCode("c1", "t1")
        mockFindUnique.mockResolvedValue({ id: "t1", workflowConfig: { pluginApiKey: "dg_existing" } })
        const res = await POST(req({ code: "c1" }))
        expect(res.status).toBe(200)
        expect((await res.json()).pluginApiKey).toBe("dg_existing")
        expect(mockUpdate).not.toHaveBeenCalled()
    })

    it("generates a dg_<48hex> key when the tenant has none", async () => {
        putAuthCode("c2", "t2")
        mockFindUnique.mockResolvedValue({ id: "t2", workflowConfig: {} })
        const res = await POST(req({ code: "c2" }))
        const data = await res.json()
        expect(data.pluginApiKey).toMatch(/^dg_[0-9a-f]{48}$/)
        expect(mockUpdate).toHaveBeenCalledOnce()
    })

    it("code is single-use — second exchange is 401", async () => {
        putAuthCode("c3", "t3")
        mockFindUnique.mockResolvedValue({ id: "t3", workflowConfig: { pluginApiKey: "dg_x" } })
        await POST(req({ code: "c3" }))
        const res2 = await POST(req({ code: "c3" }))
        expect(res2.status).toBe(401)
    })
})
