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

export async function GET(req: Request) {
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
        return NextResponse.json(
            { error: "No SSO configuration found for this email domain." },
            { status: 404 },
        )
    }

    const loginUrl = `${BACKEND_URL}/auth/saml/login?tenant_id=${user.tenantId}`
    return NextResponse.json({ loginUrl })
}
