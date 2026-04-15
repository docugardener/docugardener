// SPDX-License-Identifier: AGPL-3.0-or-later
export const dynamic = "force-dynamic"
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"
import { encrypt } from "@/lib/encryption"

// Use NEXTAUTH_URL as the base for all redirects so that reverse-proxy
// deployments (where req.url contains the internal container hostname)
// always redirect to the real external domain.
const BASE_URL = process.env.NEXTAUTH_URL ?? "http://localhost:3000"

function onboardingUrl(error?: string): URL {
    const url = new URL("/onboarding", BASE_URL)
    if (error) url.searchParams.set("error", error)
    return url
}

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions)

        // We firmly require the user to be logged in to link the new GitHub App to a Tenant
        if (!session?.user?.email) {
            console.warn("Manifest Callback aborted: No active session.")
            return NextResponse.redirect(onboardingUrl("Session expired. Please log in and try again."))
        }

        const searchParams = req.nextUrl.searchParams
        const code = searchParams.get("code")

        if (!code) {
            return NextResponse.json({ error: "Missing code" }, { status: 400 })
        }

        // 1. Exchange code for App Configuration
        const response = await fetch(`https://api.github.com/app-manifests/${code}/conversions`, {
            method: "POST",
            headers: {
                Accept: "application/vnd.github+json",
            },
        })

        if (!response.ok) {
            const errorText = await response.text()
            console.error("GitHub Manifest Conversion Error:", errorText)
            return NextResponse.redirect(onboardingUrl("Failed to negotiate App creation with GitHub API."))
        }

        const data = await response.json()

        // 2. Encrypt Credentials
        const encryptedPrivateKey = encrypt(data.pem)
        const encryptedWebhookSecret = encrypt(data.webhook_secret)

        // 3. Create or Update Tenant
        const tenant = await prisma.tenant.upsert({
            where: {
                githubOrgId: String(data.owner.id),
            },
            update: {
                name: data.owner.login,
                appId: String(data.id),
                privateKey: encryptedPrivateKey,
                webhookSecret: encryptedWebhookSecret,
            },
            create: {
                githubOrgId: String(data.owner.id),
                name: data.owner.login,
                appId: String(data.id),
                privateKey: encryptedPrivateKey,
                webhookSecret: encryptedWebhookSecret,
            },
        })

        // 4. Link User to Tenant (CRITICAL FIX)
        await prisma.user.update({
            where: { email: session.user.email },
            data: { tenantId: tenant.id }
        })

        // 5. Redirect to GitHub App Installation page
        const installationUrl = `https://github.com/apps/${data.slug}/installations/new`
        return NextResponse.redirect(new URL(installationUrl))

    } catch (error) {
        console.error("Manifest Handler Error:", error)
        return NextResponse.redirect(onboardingUrl("Internal server error during app installation."))
    }
}

export async function GET(req: NextRequest) {
    return POST(req)
}
