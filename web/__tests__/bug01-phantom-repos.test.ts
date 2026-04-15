// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * BUG-01 — Phantom repos reappear in Settings → Repositories after navigation.
 *
 * Root cause: sync POST /api/repos used updateMany(enabled:false) for all repos
 * no longer in the installation, but the settings server component fetched ALL
 * repos (no enabled filter), so disabled phantoms reappeared on re-render.
 *
 * Fix:
 *  1. Sync now deletes repos with no job history; only disables repos that have
 *     job history (preserves audit trail, avoids FK constraint on Job relation).
 *  2. Settings server component filters allRepos to enabled:true only.
 *
 * These tests cover the sync API behaviour to prevent regression.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockGetServerSession = vi.fn()
vi.mock('next-auth', () => ({
    getServerSession: (...args: any[]) => mockGetServerSession(...args),
}))
vi.mock('@/app/api/auth/[...nextauth]/route', () => ({ authOptions: {} }))

// Octokit + auth — must use regular function (not arrow) so `new Octokit()` works
const mockListRepos = vi.fn()
vi.mock('octokit', () => ({
    Octokit: vi.fn(function MockOctokit(this: any) {
        return { rest: { apps: { listReposAccessibleToInstallation: mockListRepos } } }
    }),
}))
vi.mock('@octokit/auth-app', () => ({ createAppAuth: vi.fn() }))
vi.mock('@/lib/encryption', () => ({ decrypt: (v: string) => v }))
vi.mock('@/lib/billing', () => ({ getPlanLimits: () => ({ repos: 9999 }) }))
vi.mock('@/lib/features', () => ({ canAccessTenant: () => true }))

// Prisma mocks
const mockTenantFindUnique = vi.fn()
const mockRepoUpsert = vi.fn()
const mockRepoFindMany = vi.fn()
const mockRepoDeleteMany = vi.fn()
const mockRepoUpdateMany = vi.fn()

vi.mock('@/lib/prisma', () => ({
    prisma: {
        tenant: { findUnique: (...a: any[]) => mockTenantFindUnique(...a) },
        repository: {
            upsert: (...a: any[]) => mockRepoUpsert(...a),
            findMany: (...a: any[]) => mockRepoFindMany(...a),
            deleteMany: (...a: any[]) => mockRepoDeleteMany(...a),
            updateMany: (...a: any[]) => mockRepoUpdateMany(...a),
        },
    },
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

const TENANT = {
    id: 'tenant-1',
    plan: 'TEAM',
    appId: '1234',
    privateKey: 'encrypted-pem',
    installationId: '5678',
}

function adminSession(tenantId = 'tenant-1') {
    return { user: { id: 'u1', email: 'admin@test.local', role: 'ADMIN', tenantId } }
}

function makePostRequest() {
    return new Request('http://localhost/api/repos', { method: 'POST' })
}

function githubRepo(id: number, name: string, isPrivate = false) {
    return { id, name, full_name: `org/${name}`, private: isPrivate }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/repos — BUG-01 phantom repo cleanup', () => {
    beforeEach(() => {
        vi.resetModules()
        vi.clearAllMocks()
        mockGetServerSession.mockResolvedValue(adminSession())
        mockTenantFindUnique.mockResolvedValue(TENANT)
        mockRepoUpsert.mockImplementation(({ create }: any) =>
            Promise.resolve({ id: `repo-${create.githubRepoId}`, ...create, enabled: true })
        )
    })

    it('deletes phantom repos that have no job history', async () => {
        // GitHub installation now only has repo 100
        mockListRepos.mockResolvedValue({ data: { repositories: [githubRepo(100, 'current-repo')] } })

        // DB has repo 100 (current) + repo 999 (phantom, no jobs)
        mockRepoFindMany.mockResolvedValue([
            { id: 'phantom-id', _count: { jobs: 0 } },
        ])
        mockRepoDeleteMany.mockResolvedValue({ count: 1 })
        mockRepoUpdateMany.mockResolvedValue({ count: 0 })

        const { POST } = await import('../app/api/repos/route')
        const res = await POST(makePostRequest() as any)

        expect(res.status).toBe(200)

        // deleteMany must be called with the phantom repo's id
        expect(mockRepoDeleteMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: expect.objectContaining({ id: { in: ['phantom-id'] } }) })
        )
        // updateMany should NOT be called (no repos with jobs to disable)
        expect(mockRepoUpdateMany).not.toHaveBeenCalled()
    })

    it('disables (does not delete) phantom repos that have job history', async () => {
        mockListRepos.mockResolvedValue({ data: { repositories: [githubRepo(100, 'current-repo')] } })

        // DB phantom repo has 3 jobs — must be preserved
        mockRepoFindMany.mockResolvedValue([
            { id: 'old-repo-id', _count: { jobs: 3 } },
        ])
        mockRepoDeleteMany.mockResolvedValue({ count: 0 })
        mockRepoUpdateMany.mockResolvedValue({ count: 1 })

        const { POST } = await import('../app/api/repos/route')
        const res = await POST(makePostRequest() as any)

        expect(res.status).toBe(200)
        // deleteMany called with empty list (nothing to delete)
        expect(mockRepoDeleteMany).not.toHaveBeenCalled()
        // updateMany must disable the repo with jobs
        expect(mockRepoUpdateMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({ id: { in: ['old-repo-id'] } }),
                data: expect.objectContaining({ enabled: false }),
            })
        )
    })

    it('handles mixed case: deletes jobless phantoms and disables phantoms with jobs', async () => {
        mockListRepos.mockResolvedValue({ data: { repositories: [githubRepo(100, 'current-repo')] } })

        mockRepoFindMany.mockResolvedValue([
            { id: 'jobless-phantom', _count: { jobs: 0 } },
            { id: 'history-phantom', _count: { jobs: 7 } },
        ])
        mockRepoDeleteMany.mockResolvedValue({ count: 1 })
        mockRepoUpdateMany.mockResolvedValue({ count: 1 })

        const { POST } = await import('../app/api/repos/route')
        const res = await POST(makePostRequest() as any)

        expect(res.status).toBe(200)
        expect(mockRepoDeleteMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: expect.objectContaining({ id: { in: ['jobless-phantom'] } }) })
        )
        expect(mockRepoUpdateMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({ id: { in: ['history-phantom'] } }),
                data: expect.objectContaining({ enabled: false }),
            })
        )
    })

    it('does not call deleteMany or updateMany when all repos are still in installation', async () => {
        mockListRepos.mockResolvedValue({ data: { repositories: [githubRepo(100, 'repo-a'), githubRepo(200, 'repo-b')] } })

        // No removed repos
        mockRepoFindMany.mockResolvedValue([])

        const { POST } = await import('../app/api/repos/route')
        const res = await POST(makePostRequest() as any)

        expect(res.status).toBe(200)
        expect(mockRepoDeleteMany).not.toHaveBeenCalled()
        expect(mockRepoUpdateMany).not.toHaveBeenCalled()
    })

    it('returns the synced repos list in the response', async () => {
        const ghRepos = [githubRepo(100, 'api'), githubRepo(200, 'frontend')]
        mockListRepos.mockResolvedValue({ data: { repositories: ghRepos } })
        mockRepoFindMany.mockResolvedValue([])

        const { POST } = await import('../app/api/repos/route')
        const res = await POST(makePostRequest() as any)
        const body = await res.json()

        expect(body.count).toBe(2)
        expect(body.repositories).toHaveLength(2)
    })

    it('returns 401 when unauthenticated', async () => {
        mockGetServerSession.mockResolvedValue(null)

        const { POST } = await import('../app/api/repos/route')
        const res = await POST(makePostRequest() as any)

        expect(res.status).toBe(401)
        expect(mockRepoDeleteMany).not.toHaveBeenCalled()
    })

    it('returns 400 when GitHub App is not configured', async () => {
        mockTenantFindUnique.mockResolvedValue({ ...TENANT, appId: null })

        const { POST } = await import('../app/api/repos/route')
        const res = await POST(makePostRequest() as any)

        expect(res.status).toBe(400)
    })
})
