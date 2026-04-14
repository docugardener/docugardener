import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'

/**
 * Tests for app/auth/signin/page.tsx — DG-SAAS-06 signup mode.
 *
 * The signin page gains a `?signup=1` query-parameter mode that changes:
 *   - The heading copy
 *   - A "Free plan · No credit card needed" subtitle
 *
 * Both modes share the same GitHub OAuth button and magic-link email form.
 *
 * These are RED tests — the updated page does not exist yet.
 */

// ── Dependency mocks ──────────────────────────────────────────────────────────

const mockSignIn = vi.fn()

vi.mock('next-auth/react', () => ({
    signIn: (...args: any[]) => mockSignIn(...args),
    useSession: () => ({ data: null, status: 'unauthenticated' }),
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

// ── useSearchParams stub factory ──────────────────────────────────────────────
// next/navigation is module-level; we swap the mock implementation per test.

const mockGetParam = vi.fn()

vi.mock('next/navigation', () => ({
    useSearchParams: () => ({ get: (key: string) => mockGetParam(key) }),
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('app/auth/signin — sign-in vs. sign-up mode', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        // Default: no ?signup param
        mockGetParam.mockReturnValue(null)
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('without ?signup=1: heading says "Sign in to your workspace"', async () => {
        mockGetParam.mockReturnValue(null)

        const { default: SignInPage } = await import('../app/auth/signin/page')
        render(<SignInPage />)

        expect(
            screen.getByRole('heading', { name: /sign in to your workspace/i })
        ).toBeInTheDocument()
    })

    it('with ?signup=1: heading says "Create your free account"', async () => {
        mockGetParam.mockImplementation((key: string) => key === 'signup' ? '1' : null)

        const { default: SignInPage } = await import('../app/auth/signin/page')
        render(<SignInPage />)

        expect(
            screen.getByRole('heading', { name: /create your free account/i })
        ).toBeInTheDocument()
    })

    it('with ?signup=1: shows "Free plan · No credit card needed"', async () => {
        mockGetParam.mockImplementation((key: string) => key === 'signup' ? '1' : null)

        const { default: SignInPage } = await import('../app/auth/signin/page')
        render(<SignInPage />)

        expect(
            screen.getByText(/free plan.*no credit card needed/i)
        ).toBeInTheDocument()
    })

    it('without ?signup=1: does NOT show "Free plan · No credit card needed"', async () => {
        mockGetParam.mockReturnValue(null)

        const { default: SignInPage } = await import('../app/auth/signin/page')
        render(<SignInPage />)

        expect(
            screen.queryByText(/free plan.*no credit card needed/i)
        ).not.toBeInTheDocument()
    })

    it('GitHub OAuth button is present in sign-in mode', async () => {
        mockGetParam.mockReturnValue(null)

        const { default: SignInPage } = await import('../app/auth/signin/page')
        render(<SignInPage />)

        // The button should reference GitHub by text or accessible name
        expect(screen.getByRole('button', { name: /github/i })).toBeInTheDocument()
    })

    it('GitHub OAuth button is present in sign-up mode', async () => {
        mockGetParam.mockImplementation((key: string) => key === 'signup' ? '1' : null)

        const { default: SignInPage } = await import('../app/auth/signin/page')
        render(<SignInPage />)

        expect(screen.getByRole('button', { name: /github/i })).toBeInTheDocument()
    })

    it('magic-link email form is present in sign-in mode', async () => {
        mockGetParam.mockReturnValue(null)

        const { default: SignInPage } = await import('../app/auth/signin/page')
        render(<SignInPage />)

        expect(screen.getByRole('textbox', { name: /email/i })).toBeInTheDocument()
    })

    it('magic-link email form is present in sign-up mode', async () => {
        mockGetParam.mockImplementation((key: string) => key === 'signup' ? '1' : null)

        const { default: SignInPage } = await import('../app/auth/signin/page')
        render(<SignInPage />)

        expect(screen.getByRole('textbox', { name: /email/i })).toBeInTheDocument()
    })
})
