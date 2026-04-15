export const dynamic = "force-dynamic"
// SPDX-License-Identifier: AGPL-3.0-or-later
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "../../../api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"
import { encrypt } from "@/lib/encryption"
import { Octokit } from "octokit"

/**
 * Normalize a PEM private key so Octokit can parse it regardless of how it
 * was copy-pasted into the form:
 *   - Properly line-wrapped (ideal): returned as-is
 *   - Literal \n escape sequences:  replaced with real newlines
 *   - Single flat line (no newlines): header/body/footer split and body
 *     re-wrapped at 64 chars per the PEM spec
 */
function normalizePemKey(raw: string): string {
    const key = raw.trim()
    // Already has real newlines — just return it
    if (key.includes("\n")) return key
    // Literal \n escape sequences
    const unescaped = key.replace(/\\n/g, "\n")
    if (unescaped.includes("\n")) return unescaped
    // Flat single line — reconstruct PEM wrapping
    const match = key.match(/^(-----BEGIN[^-]+-----)([A-Za-z0-9+/=\s]+)(-----END[^-]+-----)$/)
    if (match) {
        const header = match[1]
        const body   = match[2].replace(/\s/g, "")
        const footer = match[3]
        const wrapped = body.match(/.{1,64}/g)?.join("\n") ?? body
        return `${header}\n${wrapped}\n${footer}`
    }
    return key
}

export async function POST(req: Request) {
    const session = await getServerSession(authOptions)

    if (!session || !session.user) {
        return new NextResponse("Unauthorized", { status: 401 })
    }

    // @ts-ignore
    if (session.user.tenantId) {
        return new NextResponse("Already linked to a tenant", { status: 400 })
    }

    try {
        const body = await req.json()
        const { appId: rawAppId, privateKey, webhookSecret } = body

        if (!rawAppId || !privateKey) {
            return new NextResponse("Missing App ID or Private Key", { status: 400 })
        }

        // GitHub requires appId as integer in the JWT iss claim — coerce from string input
        const appId = Number(rawAppId)
        if (!Number.isInteger(appId) || appId <= 0) {
            return new NextResponse("App ID must be a positive integer", { status: 400 })
        }

        // 1. Verify Credentials with GitHub
        const normalizedKey = normalizePemKey(privateKey)

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let appData: any
        try {
            // @octokit/auth-app is ESM-only — must use dynamic import, not require()
            const { createAppAuth } = await import("@octokit/auth-app")
            const appOctokit = new Octokit({
                authStrategy: createAppAuth,
                auth: {
                    appId,
                    privateKey: normalizedKey,
                },
            })
            const result = await appOctokit.rest.apps.getAuthenticated()
            appData = result.data
        } catch (ghError: any) {
            console.error("GitHub App validation failed:", ghError?.message ?? ghError)
            const detail = ghError?.status === 401
                ? "Invalid App ID or Private Key — GitHub rejected the credentials."
                : `GitHub error: ${ghError?.message ?? "unknown"}`
            return new NextResponse(detail, { status: 401 })
        }

        if (!appData) {
            return new NextResponse("Failed to retrieve GitHub App info", { status: 500 })
        }

        const ownerId = String(appData.owner?.id)
        // @ts-ignore - login exists on User/Org but TS is confused by union
        const ownerLogin = (appData.owner as any)?.login || appData.owner?.name || `tenant-${ownerId}`

        const encryptedPrivateKey = encrypt(normalizedKey)
        const encryptedWebhookSecret = webhookSecret ? encrypt(webhookSecret) : null

        const tenant = await prisma.tenant.upsert({
            where: { githubOrgId: ownerId },
            update: {
                appId: String(appId),
                privateKey: encryptedPrivateKey,
                name: ownerLogin,
                ...(encryptedWebhookSecret && { webhookSecret: encryptedWebhookSecret })
            },
            create: {
                githubOrgId: ownerId,
                name: ownerLogin,
                appId: String(appId),
                privateKey: encryptedPrivateKey,
                webhookSecret: encryptedWebhookSecret
            }
        })

        // 3. Link User to Tenant
        // @ts-ignore
        const userId = session.user.id as string | undefined
        const userEmail = (session.user.email ?? (session.user as any).email) as string | undefined
        if (!userId && !userEmail) {
            console.error("Session missing user identity", { userId, userEmail, sessionUser: session.user })
            return new NextResponse("Session missing user identity", { status: 401 })
        }
        await prisma.user.update({
            where: userId ? { id: userId } : { email: userEmail! },
            data: {
                tenantId: tenant.id,
                role: "ADMIN"
            }
        })

        return NextResponse.json({ success: true })

    } catch (error) {
        console.error("Connection failed", error)
        return new NextResponse("Internal Error", { status: 500 })
    }
}
