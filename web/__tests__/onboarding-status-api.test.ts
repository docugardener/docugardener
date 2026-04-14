import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

/**
 * Tests for GET /api/onboarding/status
 *
 * The route handler is a standard Next.js Route Handler (App Router).
 * We test it by importing the GET export directly and mocking its
 * dependencies: getServerSession + prisma.
 */

const mockGetServerSession = vi.fn()
const mockPrismaJobCount = vi.fn()
const mockPrismaTenantFindUnique = vi.fn()

vi.mock('next-auth', () => ({
    getServerSession: (...args: any[]) => mockGetServerSession(...args),
}))

vi.mock('@/app/api/auth/[...nextauth]/route', () => ({
    authOptions: {},
}))

vi.mock('@/lib/prisma', () => ({
    prisma: {
        job: { count: (...args: any[]) => mockPrismaJobCount(...args) },
        tenant: { findUnique: (...args: any[]) => mockPrismaTenantFindUnique(...args) },
    },
}))

describe('GET /api/onboarding/status', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('returns 401 when session is null', async () => {
        mockGetServerSession.mockResolvedValue(null)

        const { GET } = await import('../app/api/onboarding/status/route')
        const response = await GET()

        expect(response.status).toBe(401)
    })

    it('returns 401 when session has no tenantId', async () => {
        mockGetServerSession.mockResolvedValue({ user: { email: 'test@example.com' } })

        const { GET } = await import('../app/api/onboarding/status/route')
        const response = await GET()

        expect(response.status).toBe(401)
    })

    it('returns githubConnected=true, hasFirstJob=false, hasLlmConfig=false for a fresh tenant', async () => {
        mockGetServerSession.mockResolvedValue({
            user: { email: 'test@example.com', tenantId: 'tenant-abc' },
        })
        mockPrismaJobCount.mockResolvedValue(0)
        mockPrismaTenantFindUnique.mockResolvedValue({ llmConfig: null })

        const { GET } = await import('../app/api/onboarding/status/route')
        const response = await GET()
        const body = await response.json()

        expect(response.status).toBe(200)
        expect(body).toEqual({
            githubConnected: true,
            hasFirstJob: false,
            hasLlmConfig: false,
        })
    })

    it('returns hasFirstJob=true when tenant has at least one job', async () => {
        mockGetServerSession.mockResolvedValue({
            user: { email: 'test@example.com', tenantId: 'tenant-abc' },
        })
        mockPrismaJobCount.mockResolvedValue(3)
        mockPrismaTenantFindUnique.mockResolvedValue({ llmConfig: null })

        const { GET } = await import('../app/api/onboarding/status/route')
        const response = await GET()
        const body = await response.json()

        expect(body.hasFirstJob).toBe(true)
    })

    it('returns hasLlmConfig=true when tenant.llmConfig is set', async () => {
        mockGetServerSession.mockResolvedValue({
            user: { email: 'test@example.com', tenantId: 'tenant-abc' },
        })
        mockPrismaJobCount.mockResolvedValue(0)
        mockPrismaTenantFindUnique.mockResolvedValue({
            llmConfig: { provider: 'gemini', apiKey: 'encrypted-key' },
        })

        const { GET } = await import('../app/api/onboarding/status/route')
        const response = await GET()
        const body = await response.json()

        expect(body.hasLlmConfig).toBe(true)
    })

    it('returns all steps complete for a fully configured tenant', async () => {
        mockGetServerSession.mockResolvedValue({
            user: { email: 'test@example.com', tenantId: 'tenant-abc' },
        })
        mockPrismaJobCount.mockResolvedValue(5)
        mockPrismaTenantFindUnique.mockResolvedValue({
            llmConfig: { provider: 'gemini', apiKey: 'encrypted-key' },
        })

        const { GET } = await import('../app/api/onboarding/status/route')
        const response = await GET()
        const body = await response.json()

        expect(body).toEqual({
            githubConnected: true,
            hasFirstJob: true,
            hasLlmConfig: true,
        })
    })

    it('returns 500 when the database throws', async () => {
        mockGetServerSession.mockResolvedValue({
            user: { email: 'test@example.com', tenantId: 'tenant-abc' },
        })
        mockPrismaJobCount.mockRejectedValue(new Error('DB connection failed'))

        const { GET } = await import('../app/api/onboarding/status/route')
        const response = await GET()

        expect(response.status).toBe(500)
    })
})
