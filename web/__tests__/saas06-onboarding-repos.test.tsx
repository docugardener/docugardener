import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

/**
 * Tests for app/onboarding/repos/page.tsx
 *
 * Step 2 of the DG-SAAS-06 onboarding flow — repo selection.
 * The page:
 *   1. Calls POST /api/repos to trigger a GitHub sync
 *   2. Then calls GET /api/repos to list available repos
 *   3. Renders each repo as a checkbox
 *   4. "Enable selected →" navigates to /dashboard (disabling unchecked repos first)
 *   5. "Skip →" navigates to /dashboard immediately
 *
 * These are RED tests — the page does not exist yet.
 */

// ── Dependency mocks ──────────────────────────────────────────────────────────

const mockPush = vi.fn()
const mockUseSearchParams = vi.fn(() => ({ get: () => null }))

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: mockPush }),
    useSearchParams: () => mockUseSearchParams(),
}))

vi.mock('next-auth/react', () => ({
    useSession: () => ({
        data: { user: { tenantId: 'tenant-1', role: 'ADMIN' } },
        status: 'authenticated',
    }),
}))

vi.mock('next/link', () => ({
    default: ({ href, children, className }: any) => (
        <a href={href} className={className}>{children}</a>
    ),
}))

vi.mock('framer-motion', () => ({
    motion: {
        div: ({ children, className, ...rest }: any) => <div className={className}>{children}</div>,
    },
    AnimatePresence: ({ children }: any) => <>{children}</>,
}))

// OnboardingProgress is rendered inside the page — stub it to avoid
// pulling in its own (also non-existent) implementation during these tests.
vi.mock('../components/onboarding/OnboardingProgress', () => ({
    OnboardingProgress: ({ currentStep }: { currentStep: number }) => (
        <div data-testid="onboarding-progress" data-step={currentStep} />
    ),
}))

// ── Repo fixture ──────────────────────────────────────────────────────────────

type Repo = { id: string; name: string; enabled: boolean; githubRepoId: string }

function makeRepos(): Repo[] {
    return [
        { id: 'r-1', name: 'acme/docs', enabled: true, githubRepoId: '111' },
        { id: 'r-2', name: 'acme/api', enabled: true, githubRepoId: '222' },
        { id: 'r-3', name: 'acme/web', enabled: false, githubRepoId: '333' },
    ]
}

// ── fetch helpers ─────────────────────────────────────────────────────────────

function stubHappyPath(repos: Repo[] = makeRepos()) {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
        const method = opts?.method?.toUpperCase() ?? 'GET'

        // POST /api/repos — sync trigger
        if (method === 'POST' && url.includes('/api/repos')) {
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ synced: 3, warnings: [] }),
            })
        }

        // GET /api/repos — list
        if (method === 'GET' && url.includes('/api/repos')) {
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve(repos),
            })
        }

        // PATCH /api/repos/{id}
        if (method === 'PATCH') {
            return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
        }

        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    }))
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('app/onboarding/repos — repo selection page', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.unstubAllGlobals()
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('shows a loading spinner while API calls are pending', async () => {
        // fetch never resolves — loading state persists
        vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))

        const { default: ReposPage } = await import('../app/onboarding/repos/page')
        render(<ReposPage />)

        expect(screen.getByRole('status')).toBeInTheDocument()
    })

    it('shows repo list as checkboxes after successful sync', async () => {
        stubHappyPath()

        const { default: ReposPage } = await import('../app/onboarding/repos/page')
        render(<ReposPage />)

        await waitFor(() => {
            expect(screen.getByText('acme/docs')).toBeInTheDocument()
            expect(screen.getByText('acme/api')).toBeInTheDocument()
            expect(screen.getByText('acme/web')).toBeInTheDocument()
        })

        const checkboxes = screen.getAllByRole('checkbox')
        expect(checkboxes).toHaveLength(3)
    })

    it('"Enable selected →" button is disabled when no repos are checked', async () => {
        // Return repos all unchecked so the button starts disabled
        const repos = makeRepos().map(r => ({ ...r, enabled: false }))
        stubHappyPath(repos)

        const { default: ReposPage } = await import('../app/onboarding/repos/page')
        render(<ReposPage />)

        await waitFor(() => {
            expect(screen.getByText('acme/docs')).toBeInTheDocument()
        })

        const enableBtn = screen.getByRole('button', { name: /enable selected/i })
        expect(enableBtn).toBeDisabled()
    })

    it('"Enable selected →" button becomes enabled when at least one repo is checked', async () => {
        const repos = makeRepos().map(r => ({ ...r, enabled: false }))
        stubHappyPath(repos)

        const { default: ReposPage } = await import('../app/onboarding/repos/page')
        render(<ReposPage />)

        await waitFor(() => {
            expect(screen.getByText('acme/docs')).toBeInTheDocument()
        })

        const checkboxes = screen.getAllByRole('checkbox')
        fireEvent.click(checkboxes[0]) // check first repo

        const enableBtn = screen.getByRole('button', { name: /enable selected/i })
        expect(enableBtn).not.toBeDisabled()
    })

    it('clicking "Skip →" navigates to /dashboard without calling PATCH', async () => {
        stubHappyPath()

        const { default: ReposPage } = await import('../app/onboarding/repos/page')
        render(<ReposPage />)

        await waitFor(() => {
            expect(screen.getByText('acme/docs')).toBeInTheDocument()
        })

        fireEvent.click(screen.getByRole('button', { name: /skip/i }))

        expect(mockPush).toHaveBeenCalledWith('/dashboard')

        // No PATCH calls should have been made
        const fetchMock = vi.mocked(globalThis.fetch as any)
        const patchCalls = fetchMock.mock.calls.filter(
            (c: any[]) => (c[1]?.method?.toUpperCase() ?? '') === 'PATCH'
        )
        expect(patchCalls).toHaveLength(0)
    })

    it('enables 2 repos, disables 1 unchecked repo via PATCH, then navigates to /dashboard', async () => {
        // All repos start as enabled; user unchecks the third one (acme/web)
        // Expected: PATCH /api/repos/r-3 with { enabled: false }, then push /dashboard
        const repos = makeRepos().map(r => ({ ...r, enabled: true }))
        stubHappyPath(repos)

        const { default: ReposPage } = await import('../app/onboarding/repos/page')
        render(<ReposPage />)

        await waitFor(() => {
            expect(screen.getByText('acme/web')).toBeInTheDocument()
        })

        // Find the checkbox for acme/web and uncheck it
        const acmeWebCheckbox = screen.getByRole('checkbox', { name: /acme\/web/i })
        fireEvent.click(acmeWebCheckbox) // uncheck

        fireEvent.click(screen.getByRole('button', { name: /enable selected/i }))

        await waitFor(() => {
            expect(mockPush).toHaveBeenCalledWith('/dashboard')
        })

        const fetchMock = vi.mocked(globalThis.fetch as any)
        const patchCalls = fetchMock.mock.calls.filter(
            (c: any[]) => (c[1]?.method?.toUpperCase() ?? '') === 'PATCH'
        )
        expect(patchCalls).toHaveLength(1)
        expect(patchCalls[0][0]).toContain('/api/repos/r-3')
        const patchBody = JSON.parse(patchCalls[0][1].body)
        expect(patchBody).toEqual({ enabled: false })
    })

    it('shows a warning message when the sync response contains warnings', async () => {
        vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
            const method = opts?.method?.toUpperCase() ?? 'GET'

            if (method === 'POST' && url.includes('/api/repos')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        synced: 1,
                        warnings: ['Repository acme/private requires additional GitHub permissions'],
                    }),
                })
            }
            if (method === 'GET' && url.includes('/api/repos')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve([makeRepos()[0]]),
                })
            }
            return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
        }))

        const { default: ReposPage } = await import('../app/onboarding/repos/page')
        render(<ReposPage />)

        await waitFor(() => {
            expect(
                screen.getByText(/additional GitHub permissions/i)
            ).toBeInTheDocument()
        })
    })

    it('shows an error state when POST /api/repos returns 400', async () => {
        vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
            const method = opts?.method?.toUpperCase() ?? 'GET'

            if (method === 'POST' && url.includes('/api/repos')) {
                return Promise.resolve({
                    ok: false,
                    status: 400,
                    json: () => Promise.resolve({ error: 'Sync failed' }),
                })
            }
            return Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
        }))

        const { default: ReposPage } = await import('../app/onboarding/repos/page')
        render(<ReposPage />)

        await waitFor(() => {
            expect(screen.getByText(/sync failed|could not sync|error/i)).toBeInTheDocument()
        })

        // "Skip →" must still be available so the user is not stuck
        expect(screen.getByRole('button', { name: /skip/i })).toBeInTheDocument()
    })

    it('renders OnboardingProgress at step 2', async () => {
        stubHappyPath()

        const { default: ReposPage } = await import('../app/onboarding/repos/page')
        render(<ReposPage />)

        // The stub renders synchronously so we can assert immediately
        const progress = screen.getByTestId('onboarding-progress')
        expect(progress).toBeInTheDocument()
        expect(progress).toHaveAttribute('data-step', '2')
    })
})
