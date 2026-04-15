// SPDX-License-Identifier: AGPL-3.0-or-later
import { NextResponse } from "next/server"

export async function GET() {
    return NextResponse.json({ status: "ok" })
}
