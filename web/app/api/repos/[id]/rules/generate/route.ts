export const dynamic = "force-dynamic"
// SPDX-License-Identifier: AGPL-3.0-or-later
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { NextResponse } from "next/server"

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000"

/** POST /api/repos/[id]/rules/generate — proxy to FastAPI */
export async function POST(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getServerSession(authOptions)
    if (!session?.user || !(session.user as any).tenantId) {
        return new NextResponse("Unauthorized", { status: 401 })
    }

    const tenantId = (session.user as any).tenantId as string
    const { id: repoId } = await params

    let body: unknown
    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
    }

    const res = await fetch(`${BACKEND_URL}/repos/${repoId}/rules/generate`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-Tenant-ID": tenantId,
        },
        body: JSON.stringify(body),
    })

    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
}
