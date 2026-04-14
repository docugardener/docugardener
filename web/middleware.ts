import { withAuth } from "next-auth/middleware"
import { NextResponse } from "next/server"

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
        callbacks: {
            authorized: ({ token }) => !!token,
        },
    }
)

export const config = {
    matcher: [
        "/dashboard/settings/:path*",
        "/dashboard/team/:path*",
        "/dashboard/audit/:path*",
        "/dashboard/billing/:path*",
        "/dashboard/prompts/:path*",
    ],
}
