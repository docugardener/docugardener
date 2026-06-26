// SPDX-License-Identifier: AGPL-3.0-or-later
"use client"

import { useEffect } from "react"
import { useSession, signOut } from "next-auth/react"

/**
 * Bounces a revoked/expired session to the sign-in page.
 *
 * The NextAuth `jwt` callback flags idle-timed-out or revoked sessions, and the
 * `session` callback then strips `user` (returns the session with `user`
 * undefined). Without this guard the dashboard renders a chrome-less, role-less
 * shell — the Sidebar filters every nav link out because `userRole` is undefined
 * — instead of redirecting to login. That is the "left pane disappeared after
 * leaving it open overnight" bug.
 *
 * When we detect an authenticated-but-userless session we force a clean
 * `signOut` (which clears the stale revoked cookie) and redirect to
 * `/auth/signin`. Middleware enforces the same on the server for navigations;
 * this covers the already-open tab whose session expires in place.
 */
export function SessionGuard() {
    const { data: session, status } = useSession()

    useEffect(() => {
        if (status === "authenticated" && !session?.user) {
            signOut({ callbackUrl: "/auth/signin" })
        }
    }, [status, session])

    return null
}
