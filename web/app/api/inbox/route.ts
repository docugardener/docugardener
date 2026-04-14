// SPDX-License-Identifier: AGPL-3.0-or-later
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { NextResponse } from "next/server"

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000"

export async function GET(req: Request) {
    const session = await getServerSession(authOptions)
    if (!session || !session.user || !session.user.tenantId) {
        return new NextResponse("Unauthorized", { status: 401 })
    }

    const role = (session.user as any).role
    if (!["ADMIN", "VIEWER"].includes(role)) {
        return new NextResponse(
            JSON.stringify({ error: "forbidden", reason: "Requires ADMIN or VIEWER role." }),
            { status: 403 }
        )
    }

    const { searchParams } = new URL(req.url)
    const repositoryId = searchParams.get("repository_id")

    let url = `${BACKEND_URL}/inbox?tenant_id=${session.user.tenantId}`
    if (repositoryId) {
        url += `&repository_id=${repositoryId}`
    }

    try {
        const res = await fetch(url, {
            headers: { "X-Tenant-ID": session.user.tenantId },
        })
        const data = await res.json()
        return NextResponse.json(data, { status: res.status })
    } catch (error: any) {
        return new NextResponse(JSON.stringify({ error: error.message }), { status: 500 })
    }
}
