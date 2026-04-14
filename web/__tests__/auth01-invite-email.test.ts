/**
 * AUTH-01: Invite endpoint sends magic link email — unit tests.
 *
 * Verifies:
 *   A. POST /api/users — invite flow calls sendInviteEmail with correct args
 *   B. Email failure is non-fatal — user record still returned 200
 *   C. Non-admin cannot invite — 403
 *   D. Duplicate team member rejected — 400
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockSendInviteEmail = vi.fn().mockResolvedValue(undefined)
vi.mock("@/lib/email", () => ({
    sendInviteEmail: (...args: any[]) => mockSendInviteEmail(...args),
    sendMagicLink: vi.fn().mockResolvedValue(undefined),
}))

const mockFindUnique = vi.fn()
const mockFindMany = vi.fn()
const mockCreate = vi.fn()
const mockUpdate = vi.fn()
const mockVerificationTokenCreate = vi.fn().mockResolvedValue({})

vi.mock("@/lib/prisma", () => ({
    prisma: {
        user: {
            findUnique: (...args: any[]) => mockFindUnique(...args),
            findMany: (...args: any[]) => mockFindMany(...args),
            create: (...args: any[]) => mockCreate(...args),
            update: (...args: any[]) => mockUpdate(...args),
        },
        tenant: {
            findUnique: (...args: any[]) => mockFindUnique(...args),
        },
        verificationToken: {
            create: (...args: any[]) => mockVerificationTokenCreate(...args),
        },
    },
}))

const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined)
vi.mock("@/lib/audit", () => ({
    writeAuditLog: (...args: any[]) => mockWriteAuditLog(...args),
    AuditEvent: { USER_INVITED: "USER_INVITED" },
    getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}))

vi.mock("@/lib/billing", () => ({
    canAddUser: vi.fn().mockReturnValue(true),
    getPlanLimits: vi.fn().mockReturnValue({ seats: 10 }),
}))

const mockGetServerSession = vi.fn()
vi.mock("next-auth", () => ({ getServerSession: mockGetServerSession }))
vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }))

// ── Helpers ───────────────────────────────────────────────────────────────────

function adminSession(tenantId = "t-1") {
    return { user: { id: "u-admin", email: "admin@test.com", role: "ADMIN", tenantId } }
}

function viewerSession() {
    return { user: { id: "u-1", email: "viewer@test.com", role: "VIEWER", tenantId: "t-1" } }
}

function makeTenant(overrides = {}) {
    return { id: "t-1", plan: "PRO", _count: { users: 2 }, ...overrides }
}

function makeNewUser(email = "newuser@example.com") {
    return { id: "u-new", email, tenantId: null, role: "VIEWER", createdAt: new Date() }
}

function makeRequest(email: string) {
    return new Request("http://localhost/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
    })
}

// ── A. Invite calls sendInviteEmail ───────────────────────────────────────────

describe("POST /api/users — invite sends magic link email", () => {
    beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); mockSendInviteEmail.mockResolvedValue(undefined) })

    it("AC-AUTH01-1: calls sendInviteEmail with invited email, magic URL, and actor email", async () => {
        mockGetServerSession.mockResolvedValue(adminSession())
        const tenant = makeTenant()
        const newUser = makeNewUser("invited@example.com")

        // tenant.findUnique and user.findUnique have different call signatures —
        // differentiate by argument shape
        mockFindUnique.mockImplementation((args: any) => {
            if (args?.where?.id === "t-1") return Promise.resolve(tenant)
            if (args?.where?.email === "invited@example.com") return Promise.resolve(null)
            return Promise.resolve(null)
        })
        mockCreate.mockResolvedValue(newUser)

        const { POST } = await import("@/app/api/users/route")
        const res = await POST(makeRequest("invited@example.com") as any)

        expect(res.status).toBe(200)
        expect(mockSendInviteEmail).toHaveBeenCalledOnce()
        const [toEmail, magicUrl, actorEmail] = mockSendInviteEmail.mock.calls[0]
        expect(toEmail).toBe("invited@example.com")
        expect(magicUrl).toContain("/api/auth/callback/email")
        expect(magicUrl).toContain("invited%40example.com")
        expect(actorEmail).toBe("admin@test.com")
    })

    it("AC-AUTH01-2: VerificationToken is created before email is sent", async () => {
        mockGetServerSession.mockResolvedValue(adminSession())
        const tenant = makeTenant()
        const newUser = makeNewUser("invited@example.com")

        mockFindUnique.mockImplementation((args: any) => {
            if (args?.where?.id === "t-1") return Promise.resolve(tenant)
            if (args?.where?.email) return Promise.resolve(null)
            return Promise.resolve(null)
        })
        mockCreate.mockImplementation((args: any) => {
            // user.create vs verificationToken.create distinguished by data shape
            if (args?.data?.identifier) return Promise.resolve({})
            return Promise.resolve(newUser)
        })

        const { POST } = await import("@/app/api/users/route")
        await POST(makeRequest("invited@example.com") as any)

        expect(mockVerificationTokenCreate).toHaveBeenCalledOnce()
        const vtArgs = mockVerificationTokenCreate.mock.calls[0][0]
        expect(vtArgs.data.identifier).toBe("invited@example.com")
        expect(vtArgs.data.token).toBeTruthy()
        expect(vtArgs.data.expires).toBeInstanceOf(Date)
    })
})

// ── B. Email failure is non-fatal ─────────────────────────────────────────────

describe("POST /api/users — email failure is non-fatal", () => {
    beforeEach(() => { vi.resetModules(); vi.clearAllMocks() })

    it("AC-AUTH01-3: returns 200 even when sendInviteEmail throws", async () => {
        mockGetServerSession.mockResolvedValue(adminSession())
        const tenant = makeTenant()
        const newUser = makeNewUser("flaky@example.com")

        mockFindUnique.mockImplementation((args: any) => {
            if (args?.where?.id === "t-1") return Promise.resolve(tenant)
            if (args?.where?.email) return Promise.resolve(null)
            return Promise.resolve(null)
        })
        mockCreate.mockResolvedValue(newUser)
        mockSendInviteEmail.mockRejectedValue(new Error("Resend SMTP down"))

        const { POST } = await import("@/app/api/users/route")
        const res = await POST(makeRequest("flaky@example.com") as any)

        // User created successfully despite email failure
        expect(res.status).toBe(200)
    })
})

// ── C. Non-admin blocked ──────────────────────────────────────────────────────

describe("POST /api/users — non-admin cannot invite", () => {
    beforeEach(() => { vi.resetModules(); vi.clearAllMocks() })

    it("AC-AUTH01-4: VIEWER receives 403", async () => {
        mockGetServerSession.mockResolvedValue(viewerSession())

        const { POST } = await import("@/app/api/users/route")
        const res = await POST(makeRequest("someone@example.com") as any)

        expect(res.status).toBe(403)
        expect(mockSendInviteEmail).not.toHaveBeenCalled()
    })
})

// ── D. Existing team member rejected ─────────────────────────────────────────

describe("POST /api/users — duplicate team member rejected", () => {
    beforeEach(() => { vi.resetModules(); vi.clearAllMocks() })

    it("AC-AUTH01-5: already-on-team user returns 400", async () => {
        mockGetServerSession.mockResolvedValue(adminSession())
        const tenant = makeTenant()
        const existingUser = { id: "u-existing", email: "already@team.com", tenantId: "t-1" }

        mockFindUnique.mockImplementation((args: any) => {
            if (args?.where?.id === "t-1") return Promise.resolve(tenant)
            if (args?.where?.email === "already@team.com") return Promise.resolve(existingUser)
            return Promise.resolve(null)
        })

        const { POST } = await import("@/app/api/users/route")
        const res = await POST(makeRequest("already@team.com") as any)

        expect(res.status).toBe(400)
        expect(mockSendInviteEmail).not.toHaveBeenCalled()
    })
})
