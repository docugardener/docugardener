import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { GettingStartedBanner } from '../components/onboarding/GettingStartedBanner'

// ── Dependency mocks ──────────────────────────────────────────────────────────

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

// ── localStorage helpers ──────────────────────────────────────────────────────

const TENANT_ID = 'tenant-test-123'
const DISMISSED_KEY = `dg_onboarding_dismissed_${TENANT_ID}`

function mockFetchStatus(overrides: Partial<{
    githubConnected: boolean
    hasFirstJob: boolean
    hasLlmConfig: boolean
}> = {}) {
    const status = {
        githubConnected: true,
        hasFirstJob: false,
        hasLlmConfig: false,
        ...overrides,
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(status),
    }))
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GettingStartedBanner', () => {
    beforeEach(() => {
        localStorage.clear()
        vi.unstubAllGlobals()
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('renders nothing before the API response arrives (status is null)', () => {
        // fetch never resolves during this test
        vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
        const { container } = render(<GettingStartedBanner tenantId={TENANT_ID} />)
        expect(container.firstChild).toBeNull()
    })

    it('renders nothing when localStorage dismissed key is set', async () => {
        localStorage.setItem(DISMISSED_KEY, 'true')
        mockFetchStatus()
        const { container } = render(<GettingStartedBanner tenantId={TENANT_ID} />)
        // Even after any potential async update it should stay hidden
        await waitFor(() => {
            expect(container.firstChild).toBeNull()
        })
    })

    it('renders nothing when all 3 steps are complete', async () => {
        mockFetchStatus({ githubConnected: true, hasFirstJob: true, hasLlmConfig: true })
        const { container } = render(<GettingStartedBanner tenantId={TENANT_ID} />)
        await waitFor(() => {
            expect(container.firstChild).toBeNull()
        })
    })

    it('renders the banner when steps are incomplete', async () => {
        mockFetchStatus({ githubConnected: true, hasFirstJob: false, hasLlmConfig: false })
        render(<GettingStartedBanner tenantId={TENANT_ID} />)
        await waitFor(() => {
            expect(screen.getByText('Getting Started')).toBeInTheDocument()
        })
    })

    it('shows all 3 step labels', async () => {
        mockFetchStatus()
        render(<GettingStartedBanner tenantId={TENANT_ID} />)
        await waitFor(() => {
            expect(screen.getByText('Connect GitHub App')).toBeInTheDocument()
            expect(screen.getByText('Open your first Pull Request')).toBeInTheDocument()
            expect(screen.getByText('Add your own LLM key')).toBeInTheDocument()
        })
    })

    it('shows correct completion count in the header', async () => {
        // Only step 1 is done
        mockFetchStatus({ githubConnected: true, hasFirstJob: false, hasLlmConfig: false })
        render(<GettingStartedBanner tenantId={TENANT_ID} />)
        await waitFor(() => {
            expect(screen.getByText('1/3 complete')).toBeInTheDocument()
        })
    })

    it('shows 2/3 complete when two steps are done', async () => {
        mockFetchStatus({ githubConnected: true, hasFirstJob: true, hasLlmConfig: false })
        render(<GettingStartedBanner tenantId={TENANT_ID} />)
        await waitFor(() => {
            expect(screen.getByText('2/3 complete')).toBeInTheDocument()
        })
    })

    it('renders the Settings link on step 3 when hasLlmConfig is false', async () => {
        mockFetchStatus({ githubConnected: true, hasFirstJob: false, hasLlmConfig: false })
        render(<GettingStartedBanner tenantId={TENANT_ID} />)
        await waitFor(() => {
            const link = screen.getByRole('link', { name: /go to settings/i })
            expect(link).toHaveAttribute('href', '/dashboard/settings')
        })
    })

    it('does not render the Settings link when hasLlmConfig is true', async () => {
        mockFetchStatus({ githubConnected: true, hasFirstJob: false, hasLlmConfig: true })
        render(<GettingStartedBanner tenantId={TENANT_ID} />)
        await waitFor(() => {
            expect(screen.queryByRole('link', { name: /go to settings/i })).not.toBeInTheDocument()
        })
    })

    it('clicking dismiss hides the banner', async () => {
        mockFetchStatus()
        const { container } = render(<GettingStartedBanner tenantId={TENANT_ID} />)
        await waitFor(() => {
            expect(screen.getByText('Getting Started')).toBeInTheDocument()
        })
        fireEvent.click(screen.getByRole('button', { name: /dismiss/i }))
        await waitFor(() => {
            expect(container.firstChild).toBeNull()
        })
    })

    it('clicking dismiss persists the dismissed state in localStorage', async () => {
        mockFetchStatus()
        render(<GettingStartedBanner tenantId={TENANT_ID} />)
        await waitFor(() => {
            expect(screen.getByText('Getting Started')).toBeInTheDocument()
        })
        fireEvent.click(screen.getByRole('button', { name: /dismiss/i }))
        expect(localStorage.getItem(DISMISSED_KEY)).toBe('true')
    })

    it('renders nothing when fetch fails (fail silently)', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))
        const { container } = render(<GettingStartedBanner tenantId={TENANT_ID} />)
        // status stays null, so banner stays hidden
        await waitFor(() => {
            expect(container.firstChild).toBeNull()
        })
    })
})
