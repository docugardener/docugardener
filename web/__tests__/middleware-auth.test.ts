// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect, vi } from 'vitest'

// Stub the Next/next-auth edge modules so importing middleware.ts doesn't pull
// in real edge runtime internals. isAuthorized + config are plain exports and
// are unaffected by these stubs.
vi.mock('next-auth/middleware', () => ({
    withAuth: (fn: unknown, opts: unknown) => ({ fn, opts }),
}))
vi.mock('next/server', () => ({
    NextResponse: { redirect: vi.fn() },
}))

import { isAuthorized, config } from '../middleware'

describe('middleware isAuthorized', () => {
    it('rejects when no token (unauthenticated)', () => {
        expect(isAuthorized(null)).toBe(false)
        expect(isAuthorized(undefined)).toBe(false)
    })

    it('rejects a revoked token even though it exists (idle-timeout / session revocation)', () => {
        // Regression guard: the old `!!token` check authorized this, leaving an
        // expired session navigating a userless dashboard instead of redirecting.
        expect(isAuthorized({ revoked: true, role: 'ADMIN' })).toBe(false)
    })

    it('authorizes a present, non-revoked token', () => {
        expect(isAuthorized({ role: 'ADMIN' })).toBe(true)
        expect(isAuthorized({ revoked: false, role: 'VIEWER' })).toBe(true)
    })
})

describe('middleware matcher', () => {
    it('guards the dashboard base route', () => {
        expect(config.matcher).toContain('/dashboard')
    })

    it('guards every nested dashboard route (not just role-gated sub-paths)', () => {
        expect(config.matcher).toContain('/dashboard/:path*')
    })
})
