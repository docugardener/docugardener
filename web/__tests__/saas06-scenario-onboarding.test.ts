import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * DG-SAAS-06 — Onboarding API flow integration scenario tests
 *
 * Tests the full onboarding API flow as a user would experience it, covering:
 *   - POST /api/onboarding/installation  (saves GitHub App installation ID)
 *   - GET  /api/onboarding/status        (reports onboarding completion steps)
 *
 * All external dependencies (prisma, next-auth) are mocked so these tests run
 * without a database or live session.
 */

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockGetServerSession = vi.fn()

vi.mock('next-auth', () => ({
    getServerSession: (...args: any[]) => mockGetServerSession(...args),
}))

vi.mock('@/app/api/auth/[...nextauth]/route', () => ({
    authOptions: {},
}))

const mockTenantFindUnique = vi.fn()
const mockTenantUpdate     = vi.fn()
const mockJobCount         = vi.fn()

vi.mock('@/lib/prisma', () => ({
    prisma: {
        tenant: {
            findUnique: (...args: any[]) => mockTenantFindUnique(...args),
            update:     (...args: any[]) => mockTenantUpdate(...args),
        },
        job: {
            count: (...args: any[]) => mockJobCount(...args),
        },
    },
}))

// ── Session factories ──────────────────────────────────────────────────────────

function adminSession(tenantId = 'tenant-1') {
    return { user: { id: 'u-admin', email: 'admin@example.com', role: 'ADMIN', tenantId } }
}

function memberSession(tenantId = 'tenant-1') {
    return { user: { id: 'u-member', email: 'member@example.com', role: 'MEMBER', tenantId } }
}

// ── Request factories ──────────────────────────────────────────────────────────

function postInstallation(body?: object) {
    return new Request('http://localhost/api/onboarding/installation', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    body !== undefined ? JSON.stringify(body) : undefined,
    })
}

function getStatus() {
    return new Request('http://localhost/api/onboarding/status', { method: 'GET' })
}

// ── Shared tenant fixture ──────────────────────────────────────────────────────

const TENANT = { id: 'tenant-1', name: 'Acme Corp', installationId: null, llmConfig: null }

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('Scenario: New user completes wizard onboarding', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('Step 1 — ADMIN saves installationId → 200 { ok: true }', async () => {
        mockGetServerSession.mockResolvedValue(adminSession())
        mockTenantFindUnique.mockResolvedValue(TENANT)
        mockTenantUpdate.mockResolvedValue({ ...TENANT, installationId: '12345' })

        const { POST } = await import('../app/api/onboarding/installation/route')
        const res  = await POST(postInstallation({ installationId: '12345' }) as any)
        const body = await res.json()

        expect(res.status).toBe(200)
        expect(body).toEqual({ ok: true })
    })

    it('Step 2 — GET /status with tenant present → githubConnected true, hasFirstJob false', async () => {
        mockGetServerSession.mockResolvedValue(adminSession())
        mockJobCount.mockResolvedValue(0)
        mockTenantFindUnique.mockResolvedValue({ id: 'tenant-1', llmConfig: null })

        const { GET } = await import('../app/api/onboarding/status/route')
        const res  = await GET()
        const body = await res.json()

        expect(res.status).toBe(200)
        expect(body.githubConnected).toBe(true)
        expect(body.hasFirstJob).toBe(false)
        expect(body.hasLlmConfig).toBe(false)
    })

    it('Step 3 — GET /status after first job is created → hasFirstJob true', async () => {
        mockGetServerSession.mockResolvedValue(adminSession())
        mockJobCount.mockResolvedValue(1)
        mockTenantFindUnique.mockResolvedValue({ id: 'tenant-1', llmConfig: null })

        const { GET } = await import('../app/api/onboarding/status/route')
        const res  = await GET()
        const body = await res.json()

        expect(body.hasFirstJob).toBe(true)
        expect(body.githubConnected).toBe(true)
    })
})

describe('Scenario: Installation ID saved, then status reflects it', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('prisma.tenant.update is called with the correct installationId', async () => {
        mockGetServerSession.mockResolvedValue(adminSession('tenant-1'))
        mockTenantFindUnique.mockResolvedValue({ id: 'tenant-1' })
        mockTenantUpdate.mockResolvedValue({ id: 'tenant-1', installationId: '12345' })

        const { POST } = await import('../app/api/onboarding/installation/route')
        await POST(postInstallation({ installationId: '12345' }) as any)

        expect(mockTenantUpdate).toHaveBeenCalledOnce()
        const call = mockTenantUpdate.mock.calls[0][0]
        expect(call.where.id).toBe('tenant-1')
        expect(call.data.installationId).toBe('12345')
    })

    it('GET /status always returns githubConnected=true for an authenticated tenant', async () => {
        // githubConnected is always true when a session with tenantId is present —
        // reaching the route implies the user authenticated via GitHub OAuth.
        mockGetServerSession.mockResolvedValue(adminSession('tenant-1'))
        mockJobCount.mockResolvedValue(0)
        mockTenantFindUnique.mockResolvedValue({ id: 'tenant-1', llmConfig: null })

        const { GET } = await import('../app/api/onboarding/status/route')
        const body = await (await GET()).json()

        expect(body.githubConnected).toBe(true)
    })

    it('hasLlmConfig becomes true once llmConfig is set on the tenant', async () => {
        mockGetServerSession.mockResolvedValue(adminSession('tenant-1'))
        mockJobCount.mockResolvedValue(0)
        mockTenantFindUnique.mockResolvedValue({
            id: 'tenant-1',
            llmConfig: { provider: 'openai', apiKey: 'sk-test' },
        })

        const { GET } = await import('../app/api/onboarding/status/route')
        const body = await (await GET()).json()

        expect(body.hasLlmConfig).toBe(true)
    })
})

describe('Scenario: Non-ADMIN cannot save installation ID', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('MEMBER role → 403 Forbidden', async () => {
        mockGetServerSession.mockResolvedValue(memberSession())

        const { POST } = await import('../app/api/onboarding/installation/route')
        const res = await POST(postInstallation({ installationId: '99999' }) as any)

        expect(res.status).toBe(403)
        expect(mockTenantUpdate).not.toHaveBeenCalled()
    })

    it('MEMBER role → response body contains error message', async () => {
        mockGetServerSession.mockResolvedValue(memberSession())

        const { POST } = await import('../app/api/onboarding/installation/route')
        const res  = await POST(postInstallation({ installationId: '99999' }) as any)
        const body = await res.json()

        expect(body.error).toMatch(/admin/i)
    })
})

describe('Scenario: Missing installationId returns 400', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('empty body object → 400 with error "installationId required"', async () => {
        mockGetServerSession.mockResolvedValue(adminSession())

        const { POST } = await import('../app/api/onboarding/installation/route')
        const res  = await POST(postInstallation({}) as any)
        const body = await res.json()

        expect(res.status).toBe(400)
        expect(body.error).toBe('installationId required')
    })

    it('null installationId value → 400', async () => {
        mockGetServerSession.mockResolvedValue(adminSession())

        const { POST } = await import('../app/api/onboarding/installation/route')
        const res = await POST(postInstallation({ installationId: null }) as any)

        expect(res.status).toBe(400)
        expect(mockTenantUpdate).not.toHaveBeenCalled()
    })

    it('empty string installationId → 400 (falsy check)', async () => {
        mockGetServerSession.mockResolvedValue(adminSession())

        const { POST } = await import('../app/api/onboarding/installation/route')
        const res = await POST(postInstallation({ installationId: '' }) as any)

        expect(res.status).toBe(400)
    })
})

describe('Scenario: Unauthenticated user gets 401 on all onboarding routes', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockGetServerSession.mockResolvedValue(null)
    })

    it('POST /api/onboarding/installation → 401 Unauthorized', async () => {
        const { POST } = await import('../app/api/onboarding/installation/route')
        const res = await POST(postInstallation({ installationId: '12345' }) as any)

        expect(res.status).toBe(401)
        expect(mockTenantUpdate).not.toHaveBeenCalled()
    })

    it('GET /api/onboarding/status → 401 Unauthorized', async () => {
        const { GET } = await import('../app/api/onboarding/status/route')
        const res = await GET()

        expect(res.status).toBe(401)
    })

    it('session with user but no tenantId → GET /status returns 401', async () => {
        mockGetServerSession.mockResolvedValue({ user: { id: 'u-1', email: 'x@example.com' } })

        const { GET } = await import('../app/api/onboarding/status/route')
        const res = await GET()

        expect(res.status).toBe(401)
    })
})
