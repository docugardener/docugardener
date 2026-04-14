/**
 * ENT-11: Tests for the audit logging system.
 *
 * Groups:
 *   A. writeAuditLog()  — hash chaining, DB write, error resilience
 *   B. getClientIp()    — IP extraction from headers
 *   C. GET /api/audit   — RBAC, pagination, filtering
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHash } from 'crypto'

// ── Shared mocks ──────────────────────────────────────────────────────────────

const mockFindFirst = vi.fn()
const mockCreate = vi.fn()
const mockFindMany = vi.fn()

const mockTenantFindUnique = vi.fn()
vi.mock('@/lib/prisma', () => ({
    prisma: {
        auditLog: {
            findFirst: (...args: any[]) => mockFindFirst(...args),
            create: (...args: any[]) => mockCreate(...args),
            findMany: (...args: any[]) => mockFindMany(...args),
        },
        user: {
            findUnique: vi.fn(),
        },
        // GTM-03: plan gate added to GET /api/audit
        tenant: {
            findUnique: (...args: any[]) => mockTenantFindUnique(...args),
        },
    },
}))

vi.mock('@/app/api/auth/[...nextauth]/route', () => ({
    authOptions: {},
}))

const mockGetServerSession = vi.fn()
vi.mock('next-auth', () => ({
    getServerSession: (...args: any[]) => mockGetServerSession(...args),
}))

// ── A. writeAuditLog ──────────────────────────────────────────────────────────

describe('writeAuditLog', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockCreate.mockResolvedValue({})
    })

    it('writes a log entry to the DB', async () => {
        mockFindFirst.mockResolvedValue(null) // No previous entry
        const { writeAuditLog, AuditEvent } = await import('@/lib/audit')

        await writeAuditLog({
            tenantId: 't-1',
            actorId: 'u-1',
            actorEmail: 'alice@example.com',
            event: AuditEvent.USER_LOGIN,
        })

        expect(mockCreate).toHaveBeenCalledOnce()
        const created = mockCreate.mock.calls[0][0].data
        expect(created.tenantId).toBe('t-1')
        expect(created.event).toBe('USER_LOGIN')
        expect(created.actorEmail).toBe('alice@example.com')
    })

    it('computes a non-empty hash', async () => {
        mockFindFirst.mockResolvedValue(null)
        const { writeAuditLog, AuditEvent } = await import('@/lib/audit')

        await writeAuditLog({
            tenantId: 't-1',
            event: AuditEvent.SETTINGS_CHANGED,
        })

        const hash = mockCreate.mock.calls[0][0].data.hash
        expect(typeof hash).toBe('string')
        expect(hash.length).toBe(64) // SHA-256 hex
    })

    it('chains hash onto previous row hash', async () => {
        const prevHash = 'a'.repeat(64)
        mockFindFirst.mockResolvedValue({ hash: prevHash })
        const { writeAuditLog, AuditEvent } = await import('@/lib/audit')

        await writeAuditLog({
            tenantId: 't-1',
            event: AuditEvent.REPO_TOGGLED,
        })

        const writtenHash: string = mockCreate.mock.calls[0][0].data.hash

        // Recompute what the hash should be
        const payload = JSON.stringify({
            tenantId: 't-1',
            actorId: null,
            actorEmail: null,
            actorIp: null,
            event: 'REPO_TOGGLED',
            resourceType: null,
            resourceId: null,
            metadata: null,
        })
        const expected = createHash('sha256').update(payload + prevHash).digest('hex')
        expect(writtenHash).toBe(expected)
    })

    it('uses empty string as prev hash when no prior row exists', async () => {
        mockFindFirst.mockResolvedValue(null)
        const { writeAuditLog, AuditEvent } = await import('@/lib/audit')

        await writeAuditLog({ tenantId: 't-1', event: AuditEvent.USER_LOGIN })

        const writtenHash: string = mockCreate.mock.calls[0][0].data.hash
        const payload = JSON.stringify({
            tenantId: 't-1', actorId: null, actorEmail: null, actorIp: null,
            event: 'USER_LOGIN', resourceType: null, resourceId: null, metadata: null,
        })
        const expected = createHash('sha256').update(payload + '').digest('hex')
        expect(writtenHash).toBe(expected)
    })

    it('stores metadata when provided', async () => {
        mockFindFirst.mockResolvedValue(null)
        const { writeAuditLog, AuditEvent } = await import('@/lib/audit')

        await writeAuditLog({
            tenantId: 't-1',
            event: AuditEvent.TRIAGE_DECISION,
            metadata: { status: 'ACCEPTED', reason: 'looks good' },
        })

        const created = mockCreate.mock.calls[0][0].data
        expect(created.metadata).toEqual({ status: 'ACCEPTED', reason: 'looks good' })
    })

    it('does not throw when DB write fails', async () => {
        mockFindFirst.mockResolvedValue(null)
        mockCreate.mockRejectedValue(new Error('DB connection lost'))
        const { writeAuditLog, AuditEvent } = await import('@/lib/audit')

        // Must not throw — audit failures are non-fatal
        await expect(
            writeAuditLog({ tenantId: 't-1', event: AuditEvent.USER_LOGIN })
        ).resolves.toBeUndefined()
    })

    it('does not throw when findFirst fails', async () => {
        mockFindFirst.mockRejectedValue(new Error('timeout'))
        const { writeAuditLog, AuditEvent } = await import('@/lib/audit')

        await expect(
            writeAuditLog({ tenantId: 't-1', event: AuditEvent.USER_LOGIN })
        ).resolves.toBeUndefined()
    })
})

// ── B. getClientIp ────────────────────────────────────────────────────────────

describe('getClientIp', () => {
    it('returns first IP from X-Forwarded-For header', async () => {
        const { getClientIp } = await import('@/lib/audit')
        const req = new Request('http://localhost/', {
            headers: { 'x-forwarded-for': '1.2.3.4, 10.0.0.1' },
        })
        expect(getClientIp(req)).toBe('1.2.3.4')
    })

    it('returns X-Real-IP when X-Forwarded-For is absent', async () => {
        const { getClientIp } = await import('@/lib/audit')
        const req = new Request('http://localhost/', {
            headers: { 'x-real-ip': '5.6.7.8' },
        })
        expect(getClientIp(req)).toBe('5.6.7.8')
    })

    it('returns null when no IP headers present', async () => {
        const { getClientIp } = await import('@/lib/audit')
        const req = new Request('http://localhost/')
        expect(getClientIp(req)).toBeNull()
    })

    it('trims whitespace from forwarded IPs', async () => {
        const { getClientIp } = await import('@/lib/audit')
        const req = new Request('http://localhost/', {
            headers: { 'x-forwarded-for': '  9.9.9.9  , 10.0.0.1' },
        })
        expect(getClientIp(req)).toBe('9.9.9.9')
    })
})

// ── C. GET /api/audit ─────────────────────────────────────────────────────────

describe('GET /api/audit', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        // GTM-03: default to PRO so plan gate is transparent for ENT-11 tests
        mockTenantFindUnique.mockResolvedValue({ plan: "PRO" })
    })

    function makeSession(role: string, tenantId = 't-1') {
        return { user: { id: 'u-1', email: 'a@b.com', role, tenantId } }
    }

    function makeRequest(params: Record<string, string> = {}) {
        const url = new URL('http://localhost/api/audit')
        for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
        return new Request(url.toString())
    }

    it('returns 401 when not authenticated', async () => {
        mockGetServerSession.mockResolvedValue(null)
        const { GET } = await import('@/app/api/audit/route')
        const res = await GET(makeRequest())
        expect(res.status).toBe(401)
    })

    it('returns 403 for VIEWER role', async () => {
        mockGetServerSession.mockResolvedValue(makeSession('VIEWER'))
        const { GET } = await import('@/app/api/audit/route')
        const res = await GET(makeRequest())
        expect(res.status).toBe(403)
    })

    it('returns 403 for BILLING_ADMIN role', async () => {
        mockGetServerSession.mockResolvedValue(makeSession('BILLING_ADMIN'))
        const { GET } = await import('@/app/api/audit/route')
        const res = await GET(makeRequest())
        expect(res.status).toBe(403)
    })

    it('allows ADMIN role', async () => {
        mockGetServerSession.mockResolvedValue(makeSession('ADMIN'))
        mockFindMany.mockResolvedValue([])
        const { GET } = await import('@/app/api/audit/route')
        const res = await GET(makeRequest())
        expect(res.status).toBe(200)
    })

    it('allows AUDITOR role', async () => {
        mockGetServerSession.mockResolvedValue(makeSession('AUDITOR'))
        mockFindMany.mockResolvedValue([])
        const { GET } = await import('@/app/api/audit/route')
        const res = await GET(makeRequest())
        expect(res.status).toBe(200)
    })

    it('returns logs array in response', async () => {
        mockGetServerSession.mockResolvedValue(makeSession('ADMIN'))
        const fakeLog = {
            id: 'log-1', actorEmail: 'a@b.com', actorIp: '1.2.3.4',
            event: 'USER_LOGIN', resourceType: 'user', resourceId: 'u-1',
            metadata: null, hash: 'abc', createdAt: new Date('2026-03-08T00:00:00Z'),
        }
        mockFindMany.mockResolvedValue([fakeLog])
        const { GET } = await import('@/app/api/audit/route')
        const res = await GET(makeRequest())
        const body = await res.json()
        expect(body.logs).toHaveLength(1)
        expect(body.logs[0].event).toBe('USER_LOGIN')
    })

    it('respects limit query param', async () => {
        mockGetServerSession.mockResolvedValue(makeSession('ADMIN'))
        mockFindMany.mockResolvedValue([])
        const { GET } = await import('@/app/api/audit/route')
        await GET(makeRequest({ limit: '10' }))
        expect(mockFindMany).toHaveBeenCalledWith(
            expect.objectContaining({ take: 10 })
        )
    })

    it('caps limit at 200', async () => {
        mockGetServerSession.mockResolvedValue(makeSession('ADMIN'))
        mockFindMany.mockResolvedValue([])
        const { GET } = await import('@/app/api/audit/route')
        await GET(makeRequest({ limit: '999' }))
        expect(mockFindMany).toHaveBeenCalledWith(
            expect.objectContaining({ take: 200 })
        )
    })

    it('filters by tenantId only (not other tenants)', async () => {
        mockGetServerSession.mockResolvedValue(makeSession('ADMIN', 'my-tenant'))
        mockFindMany.mockResolvedValue([])
        const { GET } = await import('@/app/api/audit/route')
        await GET(makeRequest())
        const whereArg = mockFindMany.mock.calls[0][0].where
        expect(whereArg.tenantId).toBe('my-tenant')
    })

    it('applies event filter when provided', async () => {
        mockGetServerSession.mockResolvedValue(makeSession('ADMIN'))
        mockFindMany.mockResolvedValue([])
        const { GET } = await import('@/app/api/audit/route')
        await GET(makeRequest({ event: 'SETTINGS_CHANGED' }))
        const whereArg = mockFindMany.mock.calls[0][0].where
        expect(whereArg.event).toBe('SETTINGS_CHANGED')
    })

    it('sets nextCursor when result equals limit', async () => {
        mockGetServerSession.mockResolvedValue(makeSession('ADMIN'))
        const logs = Array.from({ length: 50 }, (_, i) => ({
            id: `log-${i}`, actorEmail: null, actorIp: null,
            event: 'USER_LOGIN', resourceType: null, resourceId: null,
            metadata: null, hash: 'h', createdAt: new Date(`2026-03-0${(i % 9) + 1}T00:00:00Z`),
        }))
        mockFindMany.mockResolvedValue(logs)
        const { GET } = await import('@/app/api/audit/route')
        const res = await GET(makeRequest())
        const body = await res.json()
        expect(body.nextCursor).not.toBeNull()
    })

    it('sets nextCursor to null when result is smaller than limit', async () => {
        mockGetServerSession.mockResolvedValue(makeSession('ADMIN'))
        mockFindMany.mockResolvedValue([{
            id: 'log-1', actorEmail: null, actorIp: null,
            event: 'USER_LOGIN', resourceType: null, resourceId: null,
            metadata: null, hash: 'h', createdAt: new Date(),
        }])
        const { GET } = await import('@/app/api/audit/route')
        const res = await GET(makeRequest())
        const body = await res.json()
        expect(body.nextCursor).toBeNull()
    })
})
