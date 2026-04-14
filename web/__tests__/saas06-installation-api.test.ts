import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tests for app/api/onboarding/installation/route.ts
 *
 * POST /api/onboarding/installation
 * Saves a GitHub App installation ID to the tenant record.
 * Requires an authenticated ADMIN session.
 *
 * These are RED tests — the route does not exist yet.
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockGetServerSession = vi.fn()

vi.mock('next-auth', () => ({
    getServerSession: (...args: any[]) => mockGetServerSession(...args),
}))

vi.mock('@/app/api/auth/[...nextauth]/route', () => ({
    authOptions: {},
}))

const mockTenantFindUnique = vi.fn()
const mockTenantUpdate = vi.fn()

vi.mock('@/lib/prisma', () => ({
    prisma: {
        tenant: {
            findUnique: (...args: any[]) => mockTenantFindUnique(...args),
            update: (...args: any[]) => mockTenantUpdate(...args),
        },
    },
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

function adminSession(tenantId = 'tenant-1') {
    return { user: { id: 'u-admin', email: 'admin@example.com', role: 'ADMIN', tenantId } }
}

function memberSession(tenantId = 'tenant-1') {
    return { user: { id: 'u-member', email: 'member@example.com', role: 'MEMBER', tenantId } }
}

function makeRequest(body?: object) {
    return new Request('http://localhost/api/onboarding/installation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body !== undefined ? JSON.stringify(body) : undefined,
    })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/onboarding/installation', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('returns 401 when there is no session', async () => {
        mockGetServerSession.mockResolvedValue(null)

        const { POST } = await import('../app/api/onboarding/installation/route')
        const res = await POST(makeRequest({ installationId: '12345' }) as any)

        expect(res.status).toBe(401)
    })

    it('returns 403 when the session role is MEMBER (not ADMIN)', async () => {
        mockGetServerSession.mockResolvedValue(memberSession())

        const { POST } = await import('../app/api/onboarding/installation/route')
        const res = await POST(makeRequest({ installationId: '12345' }) as any)

        expect(res.status).toBe(403)
        expect(mockTenantUpdate).not.toHaveBeenCalled()
    })

    it('returns 400 when installationId is missing from the request body', async () => {
        mockGetServerSession.mockResolvedValue(adminSession())

        const { POST } = await import('../app/api/onboarding/installation/route')
        const res = await POST(makeRequest({}) as any)
        const body = await res.json()

        expect(res.status).toBe(400)
        expect(body.error).toBe('installationId required')
    })

    it('returns 400 when the request body is empty', async () => {
        mockGetServerSession.mockResolvedValue(adminSession())

        // POST with an empty body (no installationId key at all)
        const req = new Request('http://localhost/api/onboarding/installation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(null),
        })

        const { POST } = await import('../app/api/onboarding/installation/route')
        const res = await POST(req as any)

        expect(res.status).toBe(400)
    })

    it('returns 404 when the tenant is not found in the database', async () => {
        mockGetServerSession.mockResolvedValue(adminSession('tenant-missing'))
        mockTenantFindUnique.mockResolvedValue(null)

        const { POST } = await import('../app/api/onboarding/installation/route')
        const res = await POST(makeRequest({ installationId: '12345' }) as any)

        expect(res.status).toBe(404)
        expect(mockTenantUpdate).not.toHaveBeenCalled()
    })

    it('returns 200 { ok: true } and calls prisma.tenant.update with the correct installationId for a valid ADMIN request', async () => {
        mockGetServerSession.mockResolvedValue(adminSession('tenant-1'))
        mockTenantFindUnique.mockResolvedValue({ id: 'tenant-1', name: 'Acme' })
        mockTenantUpdate.mockResolvedValue({ id: 'tenant-1' })

        const { POST } = await import('../app/api/onboarding/installation/route')
        const res = await POST(makeRequest({ installationId: '98765' }) as any)
        const body = await res.json()

        expect(res.status).toBe(200)
        expect(body).toEqual({ ok: true })
        expect(mockTenantUpdate).toHaveBeenCalledOnce()

        const updateCall = mockTenantUpdate.mock.calls[0][0]
        expect(updateCall.where.id).toBe('tenant-1')
        expect(updateCall.data.installationId).toBe('98765')
    })

    it('handles a string installationId correctly (GitHub sends numeric IDs; clients may stringify)', async () => {
        mockGetServerSession.mockResolvedValue(adminSession('tenant-1'))
        mockTenantFindUnique.mockResolvedValue({ id: 'tenant-1' })
        mockTenantUpdate.mockResolvedValue({ id: 'tenant-1' })

        // installationId sent as a string representation of a number
        const { POST } = await import('../app/api/onboarding/installation/route')
        const res = await POST(makeRequest({ installationId: '1234567890' }) as any)

        expect(res.status).toBe(200)

        const updateCall = mockTenantUpdate.mock.calls[0][0]
        // The route must store exactly the value it received — a string
        expect(typeof updateCall.data.installationId).toBe('string')
        expect(updateCall.data.installationId).toBe('1234567890')
    })
})
