// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { NextRequest } from "next/server"

// Mock prisma so no real DB is needed
vi.mock("@/lib/prisma", () => ({
    prisma: {
        auditLog: {
            findMany: vi.fn().mockResolvedValue([]),
            count: vi.fn().mockResolvedValue(0),
            deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
    },
}))

// Mock audit logger if the route uses it
vi.mock("@/lib/audit", () => ({
    logAuditEvent: vi.fn().mockResolvedValue(undefined),
}))

function makeRequest(authHeader?: string): NextRequest {
    const headers: Record<string, string> = {}
    if (authHeader !== undefined) {
        headers["authorization"] = authHeader
    }
    return new NextRequest("http://localhost/api/admin/audit/retain", {
        method: "POST",
        headers,
    })
}

describe("POST /api/admin/audit/retain — auth guard (SEC-NEW-H2)", () => {
    const savedEnv = { ...process.env }

    beforeEach(() => {
        vi.resetModules()
        // Reset to a known state: no secret, no opt-in flag
        delete process.env.CRON_SECRET
        delete process.env.ALLOW_UNAUTHENTICATED_CRON
        vi.stubEnv("NODE_ENV", "test")
    })

    afterEach(() => {
        // Restore original env
        Object.keys(process.env).forEach((k) => {
            if (!(k in savedEnv)) delete process.env[k]
        })
        Object.assign(process.env, savedEnv)
    })

    it("case 1: no CRON_SECRET, no ALLOW_UNAUTHENTICATED_CRON → 500", async () => {
        const { POST } = await import("@/app/api/admin/audit/retain/route")
        const res = await POST(makeRequest())
        expect(res.status).toBe(500)
    })

    it("case 2: no CRON_SECRET, ALLOW_UNAUTHENTICATED_CRON=true → 200", async () => {
        process.env.ALLOW_UNAUTHENTICATED_CRON = "true"
        const { POST } = await import("@/app/api/admin/audit/retain/route")
        const res = await POST(makeRequest())
        expect(res.status).toBe(200)
    })

    it("case 3: CRON_SECRET set, wrong token → 401", async () => {
        process.env.CRON_SECRET = "secret123"
        const { POST } = await import("@/app/api/admin/audit/retain/route")
        const res = await POST(makeRequest("Bearer wrongtoken"))
        expect(res.status).toBe(401)
    })

    it("case 4: CRON_SECRET set, correct Bearer token → 200", async () => {
        process.env.CRON_SECRET = "secret123"
        const { POST } = await import("@/app/api/admin/audit/retain/route")
        const res = await POST(makeRequest("Bearer secret123"))
        expect(res.status).toBe(200)
    })

    it("case 5: CRON_SECRET set, no auth header → 401", async () => {
        process.env.CRON_SECRET = "secret123"
        const { POST } = await import("@/app/api/admin/audit/retain/route")
        const res = await POST(makeRequest())
        expect(res.status).toBe(401)
    })
})
