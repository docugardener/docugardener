import { withAuth } from "next-auth/middleware"
import { NextResponse } from "next/server"

/**
 * Authorization predicate for withAuth. A token that exists but was flagged
 * `revoked` by the NextAuth jwt callback (idle timeout, SCIM deactivation, or
 * tenant session-revocation) must NOT be authorized — `!!token` alone would
 * wrongly let an expired session keep navigating a userless dashboard. Returning
 * false here makes withAuth redirect to the sign-in page instead.
 * Exported for unit testing.
 */
export function isAuthorized(token: unknown): boolean {
    if (!token) return false
    if ((token as { revoked?: boolean }).revoked) return false
    return true
}

export default withAuth(
    function middleware(req) {
        const role = req.nextauth.token?.role
        const { pathname } = req.nextUrl

        // Settings: ADMIN only
        if (pathname.startsWith("/dashboard/settings") && role !== "ADMIN") {
            return NextResponse.redirect(new URL("/dashboard", req.url))
        }

        // Team: ADMIN only
        if (pathname.startsWith("/dashboard/team") && role !== "ADMIN") {
            return NextResponse.redirect(new URL("/dashboard", req.url))
        }

        // Prompts (Developer Tools): ADMIN only — SEC-02 AC-1
        if (pathname.startsWith("/dashboard/prompts") && role !== "ADMIN") {
            return NextResponse.redirect(new URL("/dashboard", req.url))
        }

        // Audit log: ADMIN or AUDITOR
        if (
            pathname.startsWith("/dashboard/audit") &&
            role !== "ADMIN" &&
            role !== "AUDITOR"
        ) {
            return NextResponse.redirect(new URL("/dashboard", req.url))
        }

        // Billing: BILLING_ADMIN or ADMIN
        if (
            pathname.startsWith("/dashboard/billing") &&
            role !== "ADMIN" &&
            role !== "BILLING_ADMIN"
        ) {
            return NextResponse.redirect(new URL("/dashboard", req.url))
        }
    },
    {
        // Redirect unauthorized/expired sessions to the custom sign-in page
        // (withAuth otherwise defaults to /api/auth/signin).
        pages: {
            signIn: "/auth/signin",
        },
        callbacks: {
            authorized: ({ token }) => isAuthorized(token),
        },
    }
)

export const config = {
    // Guard the whole dashboard — not just the role-gated sub-paths — so an
    // expired/revoked session is bounced to sign-in from any page instead of
    // rendering a chrome-less shell (the "left pane vanished overnight" bug).
    matcher: [
        "/dashboard",
        "/dashboard/:path*",
    ],
}
