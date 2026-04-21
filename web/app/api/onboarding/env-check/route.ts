// SPDX-License-Identifier: AGPL-3.0-or-later
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

export async function GET() {
    const session = await getServerSession(authOptions)
    if (!session) return new NextResponse("Unauthorized", { status: 401 })

    const encryptionKeySet = !!process.env.ENCRYPTION_KEY
    const webhookUrlSet =
        !!process.env.NEXT_PUBLIC_WEBHOOK_URL &&
        !process.env.NEXT_PUBLIC_WEBHOOK_URL.includes("YOUR_CHANNEL_ID")

    return NextResponse.json({ encryptionKeySet, webhookUrlSet })
}
