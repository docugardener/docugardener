import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DiscoverMoreChecklist } from '../components/onboarding/DiscoverMoreChecklist'

/**
 * Tests for components/onboarding/DiscoverMoreChecklist.tsx
 *
 * An optional "next steps" panel shown in the dashboard after completing
 * onboarding. The component is pure client-state — no fetch calls.
 * It dismisses itself (and remembers via localStorage) so it shows only once.
 *
 * localStorage key: dg-discover-more-dismissed-{tenantId}
 *
 * These are RED tests — the component does not exist yet.
 */

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

// ── Constants ─────────────────────────────────────────────────────────────────

const TENANT_ID = 'tenant-abc-123'
const DISMISSED_KEY = `dg-discover-more-dismissed-${TENANT_ID}`

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DiscoverMoreChecklist', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        localStorage.clear()
        vi.unstubAllGlobals()
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('renders all 4 checklist items', () => {
        render(<DiscoverMoreChecklist tenantId={TENANT_ID} />)

        expect(screen.getByText(/invite teammates/i)).toBeInTheDocument()
        expect(screen.getByText(/connect slack alerts/i)).toBeInTheDocument()
        expect(screen.getByText(/configure llm provider/i)).toBeInTheDocument()
        expect(screen.getByText(/explore documentation policies/i)).toBeInTheDocument()
    })

    it('"Invite teammates" links to /dashboard/settings?tab=team', () => {
        render(<DiscoverMoreChecklist tenantId={TENANT_ID} />)

        const link = screen.getByRole('link', { name: /invite teammates/i })
        expect(link).toHaveAttribute('href', '/dashboard/settings?tab=team')
    })

    it('"Connect Slack alerts" links to /dashboard/settings?tab=integrations', () => {
        render(<DiscoverMoreChecklist tenantId={TENANT_ID} />)

        const link = screen.getByRole('link', { name: /connect slack alerts/i })
        expect(link).toHaveAttribute('href', '/dashboard/settings?tab=integrations')
    })

    it('"Configure LLM provider" links to /dashboard/settings?tab=intelligence', () => {
        render(<DiscoverMoreChecklist tenantId={TENANT_ID} />)

        const link = screen.getByRole('link', { name: /configure llm provider/i })
        expect(link).toHaveAttribute('href', '/dashboard/settings?tab=intelligence')
    })

    it('"Explore documentation policies" links to /dashboard/settings?tab=agent', () => {
        render(<DiscoverMoreChecklist tenantId={TENANT_ID} />)

        const link = screen.getByRole('link', { name: /explore documentation policies/i })
        expect(link).toHaveAttribute('href', '/dashboard/settings?tab=agent')
    })

    it('clicking the dismiss button hides the component', () => {
        const { container } = render(<DiscoverMoreChecklist tenantId={TENANT_ID} />)

        expect(screen.getByText(/invite teammates/i)).toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: /dismiss discover more/i }))

        expect(container.firstChild).toBeNull()
    })

    it('clicking dismiss saves the key to localStorage', () => {
        render(<DiscoverMoreChecklist tenantId={TENANT_ID} />)

        fireEvent.click(screen.getByRole('button', { name: /dismiss discover more/i }))

        expect(localStorage.getItem(DISMISSED_KEY)).toBeTruthy()
    })

    it('is hidden on mount when the localStorage key is already set', () => {
        localStorage.setItem(DISMISSED_KEY, 'true')

        const { container } = render(<DiscoverMoreChecklist tenantId={TENANT_ID} />)

        expect(container.firstChild).toBeNull()
    })

    it('does not make any fetch calls — pure client state', () => {
        // Stub fetch with a spy to detect any unexpected calls
        const fetchSpy = vi.fn()
        vi.stubGlobal('fetch', fetchSpy)

        render(<DiscoverMoreChecklist tenantId={TENANT_ID} />)

        // Interact with the component to exercise all code paths
        fireEvent.click(screen.getByRole('button', { name: /dismiss discover more/i }))

        expect(fetchSpy).not.toHaveBeenCalled()
    })
})
