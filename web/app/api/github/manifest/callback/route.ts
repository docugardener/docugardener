import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"
import { encrypt } from "@/lib/encryption"

export async function POST(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions)

        // We firmly require the user to be logged in to link the new GitHub App to a Tenant
        if (!session?.user?.email) {
            console.warn("Manifest Callback aborted: No active session.")
            const errorUrl = new URL("/onboarding", req.url)
            errorUrl.searchParams.set("error", "Session expired. Please log in and try again.")
            return NextResponse.redirect(errorUrl)
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
            const errorUrl = new URL("/onboarding", req.url)
            errorUrl.searchParams.set("error", "Failed to negotiate App creation with GitHub API.")
            return NextResponse.redirect(errorUrl)
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
        const errorUrl = new URL("/onboarding", req.url)
        errorUrl.searchParams.set("error", "Internal server error during app installation.")
        return NextResponse.redirect(errorUrl)
    }
}

export async function GET(req: NextRequest) {
    return POST(req)
}
