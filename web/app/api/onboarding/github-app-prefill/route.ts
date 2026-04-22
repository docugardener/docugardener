// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * ENV-DUP-01: Proxy GitHub App credentials from the FastAPI backend so
 * self-hosters don't need to duplicate GITHUB_APP_ID / GITHUB_WEBHOOK_SECRET /
 * GITHUB_PRIVATE_KEY_PATH in web/.env — the backend is the single source of truth.
 */
export const dynamic = "force-dynamic"
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000"

export async function GET() {
    const session = await getServerSession(authOptions)
    if (!session) {
        return new NextResponse("Unauthorized", { status: 401 })
    }

    const token = process.env.ENCRYPTION_KEY
    if (!token) {
        return NextResponse.json({ appId: "", webhookSecret: "", privateKey: "" })
    }

    try {
        const res = await fetch(`${BACKEND_URL}/environment/github-app-profile`, {
            headers: { "x-internal-token": token },
            cache: "no-store",
        })
        if (!res.ok) {
            return NextResponse.json({ appId: "", webhookSecret: "", privateKey: "" })
        }
        const data = await res.json()
        return NextResponse.json(data)
    } catch {
        return NextResponse.json({ appId: "", webhookSecret: "", privateKey: "" })
    }
}
