export const dynamic = "force-dynamic"
// SPDX-License-Identifier: AGPL-3.0-or-later
// SEC-OWN-01: Owner console second-factor verification endpoint.
// POST /api/admin/owner/auth — verifies OWNER_ACCESS_TOKEN, sets HMAC cookie.
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import {
  isOwnerTokenConfigured,
  signOwnerToken,
  OWNER_COOKIE_NAME,
} from "@/lib/owner-auth"
import { timingSafeEqual } from "crypto"

const OWNER_EMAIL = process.env.OWNER_EMAIL
const OWNER_ACCESS_TOKEN = process.env.OWNER_ACCESS_TOKEN ?? ""

export async function POST(req: NextRequest) {
  // Gate 1: env configured
  if (!OWNER_EMAIL || !isOwnerTokenConfigured()) {
    return NextResponse.json({ ok: false, error: "not_configured" }, { status: 404 })
  }

  // Gate 2: session email matches
  const session = await getServerSession(authOptions)
  if (!session?.user?.email || session.user.email !== OWNER_EMAIL) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 404 })
  }

  // Gate 3: parse body
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 })
  }

  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as Record<string, unknown>).token !== "string"
  ) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 })
  }

  const submittedToken = (body as { token: string }).token

  // Gate 4: timingSafeEqual — prevents timing oracle
  let tokenValid = false
  try {
    const a = Buffer.from(OWNER_ACCESS_TOKEN)
    const b = Buffer.from(submittedToken)
    // Pad to same length before compare to avoid length leaking (timingSafeEqual requires equal length)
    if (a.length === b.length) {
      tokenValid = timingSafeEqual(a, b)
    }
  } catch {
    tokenValid = false
  }

  if (!tokenValid) {
    return NextResponse.json({ ok: false, error: "invalid_token" }, { status: 401 })
  }

  // Issue HMAC cookie bound to userId
  const userId = (session.user as { id?: string }).id ?? session.user.email
  const hmac = signOwnerToken(userId)

  const res = NextResponse.json({ ok: true })
  res.cookies.set(OWNER_COOKIE_NAME, hmac, {
    httpOnly: true,
    sameSite: "strict",
    path: "/admin/owner",
    maxAge: 86400, // 24h
    secure: process.env.NODE_ENV === "production",
  })
  return res
}
