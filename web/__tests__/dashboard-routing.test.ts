import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tests for /dashboard routing behaviour.
 *
 * The dashboard page is a Next.js server component that:
 * 1. Checks session via getServerSession
 * 2. If no session → redirects to /api/auth/signin
 * 3. If session but no tenantId → redirects to /onboarding
 * 4. If session with tenantId → redirects to /dashboard/inbox
 *
 * We test this by mocking the dependencies and calling the component's
 * default export directly (the async server function).
 */

const mockRedirect = vi.fn()
const mockGetServerSession = vi.fn()

// next/navigation's redirect() throws a special error to abort rendering.
// Simulate that behaviour so execution stops after the first redirect call.
vi.mock('next/navigation', () => ({
    redirect: (url: string) => {
        mockRedirect(url)
        throw new Error(`NEXT_REDIRECT:${url}`)
    },
}))

vi.mock('next-auth', () => ({
    getServerSession: (...args: any[]) => mockGetServerSession(...args),
}))

// Mock the authOptions export
vi.mock('../app/api/auth/[...nextauth]/route', () => ({
    authOptions: {},
}))

describe('/dashboard page routing', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('redirects to /api/auth/signin when session is null', async () => {
        mockGetServerSession.mockResolvedValue(null)

        const { default: Dashboard } = await import('../app/dashboard/page')
        // redirect() throws to abort rendering — catch it
        await expect(Dashboard()).rejects.toThrow('NEXT_REDIRECT:/api/auth/signin')
        expect(mockRedirect).toHaveBeenCalledWith('/api/auth/signin')
    })

    it('redirects to /api/auth/signin when session object exists but user is undefined (revoked/expired JWT)', async () => {
        // This is the BUG-ONBOARD-01 scenario: idle timeout or session revocation
        // causes the session callback to return { ...session, user: undefined }.
        // The session object is truthy but user is gone — must go to sign-in, not onboarding.
        mockGetServerSession.mockResolvedValue({ user: undefined })

        const { default: Dashboard } = await import('../app/dashboard/page')
        await expect(Dashboard()).rejects.toThrow('NEXT_REDIRECT:/api/auth/signin')
        expect(mockRedirect).toHaveBeenCalledWith('/api/auth/signin')
    })

    it('redirects to /onboarding when session exists but tenantId is missing', async () => {
        mockGetServerSession.mockResolvedValue({
            user: { email: 'test@example.com' }, // no tenantId
        })

        const { default: Dashboard } = await import('../app/dashboard/page')
        await expect(Dashboard()).rejects.toThrow('NEXT_REDIRECT:/onboarding')
        expect(mockRedirect).toHaveBeenCalledWith('/onboarding')
    })

    it('redirects to /dashboard/inbox when session has tenantId', async () => {
        mockGetServerSession.mockResolvedValue({
            user: { email: 'test@example.com', tenantId: 'tenant-123' },
        })

        const { default: Dashboard } = await import('../app/dashboard/page')
        await expect(Dashboard()).rejects.toThrow('NEXT_REDIRECT:/dashboard/inbox')
        expect(mockRedirect).toHaveBeenCalledWith('/dashboard/inbox')
    })
})
