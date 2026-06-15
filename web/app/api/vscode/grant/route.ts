// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * UX-VSCODE-ONBOARD-01 — POST /api/vscode/grant
 *
 * Called from the (signed-in) consent page. Mints a single-use code for the
 * session's tenant and returns the editor redirect URL with ?code=&state=.
 * The extension then exchanges the code at /api/vscode/token.
 */
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { randomBytes } from "crypto"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { isAllowedRedirectUri, putAuthCode } from "@/lib/vscode-auth-codes"

export const dynamic = "force-dynamic"

export async function POST(req: Request) {
    const session = await getServerSession(authOptions)
    const tenantId = (session?.user as any)?.tenantId
    if (!session || !tenantId) {
        return new NextResponse("Unauthorized", { status: 401 })
    }

    let body: { redirect_uri?: string; state?: string }
    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ error: "invalid_body" }, { status: 400 })
    }

    const redirectUri = (body.redirect_uri || "").trim()
    const state = (body.state || "").trim()
    if (!isAllowedRedirectUri(redirectUri)) {
        return NextResponse.json({ error: "invalid_redirect_uri" }, { status: 400 })
    }
    if (!state || state.length > 256) {
        return NextResponse.json({ error: "invalid_state" }, { status: 400 })
    }

    const code = randomBytes(32).toString("base64url")
    putAuthCode(code, tenantId)

    const redirectUrl =
        `${redirectUri}?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`
    return NextResponse.json({ redirectUrl })
}
