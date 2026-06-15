// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * UX-VSCODE-ONBOARD-01 — POST /api/vscode/token
 *
 * The extension exchanges a single-use code (from /api/vscode/grant) for the
 * tenant's plugin API key. No browser session — the code IS the credential.
 * Idempotent: returns the tenant's existing pluginApiKey, generating one if absent.
 */
import { NextResponse } from "next/server"
import { randomBytes } from "crypto"
import { prisma } from "@/lib/prisma"
import { consumeAuthCode } from "@/lib/vscode-auth-codes"

export const dynamic = "force-dynamic"

const KEY_PREFIX = "dg_"

export async function POST(req: Request) {
    let body: { code?: string }
    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ error: "invalid_body" }, { status: 400 })
    }

    const code = (body.code || "").trim()
    if (!code) {
        return NextResponse.json({ error: "missing_code" }, { status: 400 })
    }

    // Single-use: consume removes the code regardless of outcome.
    const tenantId = consumeAuthCode(code)
    if (!tenantId) {
        return NextResponse.json({ error: "invalid_or_expired_code" }, { status: 401 })
    }

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } })
    if (!tenant) {
        return NextResponse.json({ error: "tenant_not_found" }, { status: 404 })
    }

    const config = (tenant.workflowConfig as any) || {}
    let key: string | undefined = config.pluginApiKey

    if (!key) {
        // First sign-in for this tenant — mint the key (idempotent thereafter).
        key = KEY_PREFIX + randomBytes(24).toString("hex")
        await prisma.tenant.update({
            where: { id: tenantId },
            data: { workflowConfig: { ...config, pluginApiKey: key } },
        })
    }

    return NextResponse.json({ pluginApiKey: key })
}
