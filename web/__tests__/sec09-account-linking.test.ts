/**
 * SEC-09: Account Linking Audit — tests.
 *
 * Verifies that:
 * - AuditEvent.ACCOUNT_LINKED exists in the enum
 * - linkAccount event in authOptions writes an ACCOUNT_LINKED audit log
 * - linkAccount includes provider and providerAccountId in metadata
 * - linkAccount is a no-op when user has no tenantId (no tenant yet)
 * - signIn event still writes USER_LOGIN (no regression)
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { AuditEvent } from "@/lib/audit"

// ── Module mocks ───────────────────────────────────────────────────────────────

const mockWriteAuditLog = vi.fn()
vi.mock("@/lib/audit", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/audit")>()
    return { ...actual, writeAuditLog: (...args: any[]) => mockWriteAuditLog(...args) }
})

const mockUserFindUnique = vi.fn()
vi.mock("@/lib/prisma", () => ({
    prisma: {
        user: { findUnique: (...a: any[]) => mockUserFindUnique(...a) },
    },
}))

vi.mock("next-auth/providers/github", () => ({ default: vi.fn(() => ({ id: "github", type: "oauth" })) }))
vi.mock("next-auth/providers/credentials", () => ({ default: vi.fn(() => ({ id: "credentials", type: "credentials" })) }))
vi.mock("next-auth/providers/email", () => ({ default: vi.fn(() => ({ id: "email", type: "email" })) }))
vi.mock("@next-auth/prisma-adapter", () => ({ PrismaAdapter: vi.fn(() => ({})) }))
vi.mock("@/lib/email", () => ({ sendMagicLink: vi.fn() }))

// ── Helpers ────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeUser(overrides: Record<string, any> = {}): any {
    return { id: "u-1", email: "alice@acme.com", name: "Alice", image: null, ...overrides }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeAccount(overrides: Record<string, any> = {}): any {
    return {
        provider: "github",
        providerAccountId: "gh-12345",
        type: "oauth",
        ...overrides,
    }
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("SEC-09: AuditEvent.ACCOUNT_LINKED exists in enum", () => {
    it("ACCOUNT_LINKED is defined", () => {
        expect(AuditEvent.ACCOUNT_LINKED).toBe("ACCOUNT_LINKED")
    })
})

describe("SEC-09: authOptions.events.linkAccount writes ACCOUNT_LINKED audit log", () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it("writes ACCOUNT_LINKED when user has a tenantId", async () => {
        mockUserFindUnique.mockResolvedValue({ tenantId: "t-1", email: "alice@acme.com" })

        const { authOptions } = await import("@/app/api/auth/[...nextauth]/route")
        await authOptions.events!.linkAccount!({
            user: makeUser(),
            account: makeAccount(),
            profile: {} as any,
        })

        expect(mockWriteAuditLog).toHaveBeenCalledOnce()
        const call = mockWriteAuditLog.mock.calls[0][0]
        expect(call.event).toBe(AuditEvent.ACCOUNT_LINKED)
        expect(call.tenantId).toBe("t-1")
        expect(call.actorId).toBe("u-1")
        expect(call.actorEmail).toBe("alice@acme.com")
        expect(call.resourceType).toBe("account")
        expect(call.resourceId).toBe("gh-12345")
        expect(call.metadata).toMatchObject({
            provider: "github",
            providerAccountId: "gh-12345",
        })
    })

    it("includes provider name in metadata", async () => {
        mockUserFindUnique.mockResolvedValue({ tenantId: "t-1", email: "alice@acme.com" })

        const { authOptions } = await import("@/app/api/auth/[...nextauth]/route")
        await authOptions.events!.linkAccount!({
            user: makeUser(),
            account: makeAccount({ provider: "email", providerAccountId: "alice@acme.com", type: "email" }),
            profile: {} as any,
        })

        const call = mockWriteAuditLog.mock.calls[0][0]
        expect(call.metadata.provider).toBe("email")
    })

    it("is a no-op when user has no tenantId", async () => {
        mockUserFindUnique.mockResolvedValue({ tenantId: null, email: "new@acme.com" })

        const { authOptions } = await import("@/app/api/auth/[...nextauth]/route")
        await authOptions.events!.linkAccount!({
            user: makeUser({ id: "u-new" }),
            account: makeAccount(),
            profile: {} as any,
        })

        expect(mockWriteAuditLog).not.toHaveBeenCalled()
    })

    it("is a no-op when user is not found in DB", async () => {
        mockUserFindUnique.mockResolvedValue(null)

        const { authOptions } = await import("@/app/api/auth/[...nextauth]/route")
        await authOptions.events!.linkAccount!({
            user: makeUser(),
            account: makeAccount(),
            profile: {} as any,
        })

        expect(mockWriteAuditLog).not.toHaveBeenCalled()
    })
})

describe("SEC-09: signIn event still writes USER_LOGIN (regression)", () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it("USER_LOGIN is written on signIn", async () => {
        mockUserFindUnique.mockResolvedValue({ tenantId: "t-1", email: "alice@acme.com" })

        const { authOptions } = await import("@/app/api/auth/[...nextauth]/route")
        await authOptions.events!.signIn!({
            user: makeUser(),
            account: makeAccount(),
            profile: {} as any,
            isNewUser: false,
        })

        expect(mockWriteAuditLog).toHaveBeenCalledOnce()
        const call = mockWriteAuditLog.mock.calls[0][0]
        expect(call.event).toBe(AuditEvent.USER_LOGIN)
    })
})
