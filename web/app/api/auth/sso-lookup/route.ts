// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * GET /api/auth/sso-lookup?email=user@company.com
 *
 * Looks up the tenant with SSO enabled whose users share the given email domain.
 * Returns { loginUrl } to redirect the browser to the SAML SP-initiated login.
 */
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000"
// For browser redirects use the public app URL, not the internal Docker backend hostname
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || BACKEND_URL

// In-memory rate limiter: 10 requests per IP per 60 seconds
const RATE_LIMIT = 10
const WINDOW_MS = 60_000
const _rateLimitMap = new Map<string, { count: number; windowStart: number }>()

function _isRateLimited(ip: string): boolean {
    const now = Date.now()
    const entry = _rateLimitMap.get(ip)
    if (!entry || now - entry.windowStart > WINDOW_MS) {
        _rateLimitMap.set(ip, { count: 1, windowStart: now })
        return false
    }
    entry.count += 1
    if (entry.count > RATE_LIMIT) {
        return true
    }
    return false
}

export async function GET(req: Request) {
    // Rate limit by IP
    const ip =
        req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
        req.headers.get("x-real-ip") ||
        "unknown"
    if (_isRateLimited(ip)) {
        return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }

    const { searchParams } = new URL(req.url)
    const email = searchParams.get("email")?.trim().toLowerCase()

    if (!email || !email.includes("@")) {
        return NextResponse.json({ error: "Valid email required" }, { status: 400 })
    }

    const domain = email.split("@")[1]

    // Find a tenant with SSO enabled that has at least one user with this email domain
    const user = await prisma.user.findFirst({
        where: {
            email: { endsWith: `@${domain}` },
            tenant: { ssoEnabled: true },
        },
        select: { tenantId: true },
    })

    if (!user?.tenantId) {
        // Return 200 (not 404) to prevent oracle attacks that enumerate SSO-enabled domains
        return NextResponse.json(
            { error: "No SSO configuration found for this email domain." },
            { status: 200 },
        )
    }

    const loginUrl = `${APP_URL}/auth/saml/login?tenant_id=${user.tenantId}`
    return NextResponse.json({ loginUrl })
}
