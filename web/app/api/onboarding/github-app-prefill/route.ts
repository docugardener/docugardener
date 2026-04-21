// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * UX-ONBOARD-02: Pre-fill the manual GitHub App form with values already set
 * in the server environment, so self-hosters don't have to re-enter credentials
 * that are already in their .env file.
 *
 * Returns only to authenticated users. Never returns PEM content — the private
 * key path is resolved and the file is read server-side, then returned so the
 * form can auto-populate the textarea.
 */
export const dynamic = "force-dynamic"
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import fs from "fs"
import path from "path"

export async function GET() {
    const session = await getServerSession(authOptions)
    if (!session) {
        return new NextResponse("Unauthorized", { status: 401 })
    }

    const appId = process.env.GITHUB_APP_ID ?? ""
    const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET ?? ""
    const pemPath = process.env.GITHUB_PRIVATE_KEY_PATH ?? ""

    let privateKey = ""
    if (pemPath) {
        try {
            const resolved = path.isAbsolute(pemPath)
                ? pemPath
                : path.resolve(process.cwd(), pemPath)
            privateKey = fs.readFileSync(resolved, "utf-8")
        } catch {
            // PEM file unreadable — caller gets empty string; user uploads manually
        }
    }

    return NextResponse.json({ appId, webhookSecret, privateKey })
}
