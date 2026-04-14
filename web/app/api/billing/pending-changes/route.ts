// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * GET /api/billing/pending-changes
 *
 * Always returns an empty list — PlatformCloud license sync has been removed.
 * Auth: session required.
 */
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"

export const dynamic = "force-dynamic"

export async function GET() {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    return NextResponse.json({ pending_changes: [] })
}
