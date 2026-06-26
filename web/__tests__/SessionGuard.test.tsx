// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'

// Mock next-auth/react so each test can drive the session shape + spy on signOut.
const mockSignOut = vi.fn()
const mockUseSession = vi.fn()
vi.mock('next-auth/react', () => ({
    useSession: () => mockUseSession(),
    signOut: (opts: unknown) => mockSignOut(opts),
}))

import { SessionGuard } from '../components/layout/SessionGuard'

describe('SessionGuard', () => {
    beforeEach(() => {
        mockSignOut.mockClear()
        mockUseSession.mockReset()
    })

    it('signs out + redirects to /auth/signin when authenticated but user is missing (revoked/expired session)', () => {
        // This is the overnight-idle case: jwt callback revoked the token, the
        // session callback stripped `user`, leaving an authenticated-but-userless session.
        mockUseSession.mockReturnValue({ data: { user: undefined }, status: 'authenticated' })
        render(<SessionGuard />)
        expect(mockSignOut).toHaveBeenCalledTimes(1)
        expect(mockSignOut).toHaveBeenCalledWith({ callbackUrl: '/auth/signin' })
    })

    it('does nothing for a healthy authenticated session with a user', () => {
        mockUseSession.mockReturnValue({
            data: { user: { email: 'a@b.c', role: 'ADMIN' } },
            status: 'authenticated',
        })
        render(<SessionGuard />)
        expect(mockSignOut).not.toHaveBeenCalled()
    })

    it('does nothing while the session is still loading', () => {
        mockUseSession.mockReturnValue({ data: null, status: 'loading' })
        render(<SessionGuard />)
        expect(mockSignOut).not.toHaveBeenCalled()
    })

    it('does nothing when unauthenticated (middleware owns that redirect)', () => {
        mockUseSession.mockReturnValue({ data: null, status: 'unauthenticated' })
        render(<SessionGuard />)
        expect(mockSignOut).not.toHaveBeenCalled()
    })

    it('renders nothing into the DOM', () => {
        mockUseSession.mockReturnValue({
            data: { user: { email: 'a@b.c', role: 'ADMIN' } },
            status: 'authenticated',
        })
        const { container } = render(<SessionGuard />)
        expect(container).toBeEmptyDOMElement()
    })
})
