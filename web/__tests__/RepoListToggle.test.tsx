/**
 * Repo Enable/Disable Toggle — RepoList.tsx
 *
 * Tests the "Pause" / "Resume" per-repo toggle button introduced
 * for the Repo Enable/Disable feature. The button calls
 * PATCH /api/repos/[id] with { enabled: !current } and reflects
 * the updated state in the UI.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { RepoList } from '../components/repo-list'

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('@/components/repos/RepoConfigModal', () => ({
    RepoConfigModal: ({ repo }: any) => <button data-testid={`config-${repo.id}`}>Config</button>,
}))

vi.mock('@/components/ui/card', () => ({
    Card: ({ children, className }: any) => <div className={className}>{children}</div>,
    CardContent: ({ children }: any) => <div>{children}</div>,
    CardHeader: ({ children }: any) => <div>{children}</div>,
    CardTitle: ({ children }: any) => <h3>{children}</h3>,
    CardDescription: ({ children }: any) => <p>{children}</p>,
}))

vi.mock('@/components/ui/badge', () => ({
    Badge: ({ children, className }: any) => <span className={className}>{children}</span>,
}))

vi.mock('@/components/ui/button', () => ({
    Button: ({ children, onClick, disabled, title, className }: any) => (
        <button onClick={onClick} disabled={disabled} title={title} className={className}>
            {children}
        </button>
    ),
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

const ENABLED_REPO = {
    id: 'repo-1',
    name: 'acme/api',
    enabled: true,
    config: { threshold: 70 },
    updatedAt: '2026-01-15T10:00:00.000Z',
}

const DISABLED_REPO = {
    id: 'repo-2',
    name: 'acme/frontend',
    enabled: false,
    config: { threshold: 70 },
    updatedAt: '2026-01-14T10:00:00.000Z',
}

function mockFetch(repos: any[], patchResult?: any) {
    vi.stubGlobal('fetch', vi.fn((url: string, opts?: any) => {
        if (!opts || opts.method === 'GET' || !opts.method) {
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve(repos),
            })
        }
        if (opts.method === 'PATCH') {
            const body = JSON.parse(opts.body)
            const id = url.split('/').pop()
            const repo = repos.find(r => r.id === id)
            const updated = patchResult ?? { ...repo, ...body }
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve(updated),
            })
        }
        // POST (sync)
        return Promise.resolve({ ok: true, json: () => Promise.resolve(repos) })
    }))
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('RepoList toggle button', () => {

    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('shows "Pause" button for an enabled repo', async () => {
        mockFetch([ENABLED_REPO])
        render(<RepoList />)

        await waitFor(() => screen.getByText('acme/api'))

        expect(screen.getByTitle('Pause analysis for this repo')).toBeInTheDocument()
        expect(screen.queryByTitle('Resume analysis')).not.toBeInTheDocument()
    })

    it('shows "Resume" button for a disabled repo', async () => {
        mockFetch([DISABLED_REPO])
        render(<RepoList />)

        await waitFor(() => screen.getByText('acme/frontend'))

        expect(screen.getByTitle('Resume analysis')).toBeInTheDocument()
        expect(screen.queryByTitle('Pause analysis for this repo')).not.toBeInTheDocument()
    })

    it('shows "Paused" badge for a disabled repo', async () => {
        mockFetch([DISABLED_REPO])
        render(<RepoList />)

        await waitFor(() => screen.getByText('Paused'))
    })

    it('calls PATCH with enabled:false when Pause is clicked', async () => {
        mockFetch([ENABLED_REPO], { ...ENABLED_REPO, enabled: false })
        render(<RepoList />)

        await waitFor(() => screen.getByTitle('Pause analysis for this repo'))
        fireEvent.click(screen.getByTitle('Pause analysis for this repo'))

        await waitFor(() => {
            const fetchMock = vi.mocked(fetch)
            const patchCall = fetchMock.mock.calls.find(
                ([url, opts]: any) => opts?.method === 'PATCH'
            )
            expect(patchCall).toBeTruthy()
            expect(JSON.parse((patchCall![1] as any).body as string)).toEqual({ enabled: false })
        })
    })

    it('calls PATCH with enabled:true when Resume is clicked', async () => {
        mockFetch([DISABLED_REPO], { ...DISABLED_REPO, enabled: true })
        render(<RepoList />)

        await waitFor(() => screen.getByTitle('Resume analysis'))
        fireEvent.click(screen.getByTitle('Resume analysis'))

        await waitFor(() => {
            const fetchMock = vi.mocked(fetch)
            const patchCall = fetchMock.mock.calls.find(
                ([url, opts]: any) => opts?.method === 'PATCH'
            )
            expect(patchCall).toBeTruthy()
            expect(JSON.parse((patchCall![1] as any).body as string)).toEqual({ enabled: true })
        })
    })

    it('changes button label after successful toggle', async () => {
        mockFetch([ENABLED_REPO], { ...ENABLED_REPO, enabled: false })
        render(<RepoList />)

        await waitFor(() => screen.getByTitle('Pause analysis for this repo'))
        fireEvent.click(screen.getByTitle('Pause analysis for this repo'))

        // After toggle, the button should switch to "Resume"
        await waitFor(() =>
            expect(screen.getByTitle('Resume analysis')).toBeInTheDocument()
        )
    })

    it('shows both repos with correct buttons when list has mixed states', async () => {
        mockFetch([ENABLED_REPO, DISABLED_REPO])
        render(<RepoList />)

        await waitFor(() => screen.getByText('acme/api'))
        await waitFor(() => screen.getByText('acme/frontend'))

        expect(screen.getByTitle('Pause analysis for this repo')).toBeInTheDocument()
        expect(screen.getByTitle('Resume analysis')).toBeInTheDocument()
    })
})
