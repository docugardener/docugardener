// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * DG-OWN-01: Owner auth helper for API routes.
 * Returns the owner email if the request is owner-authenticated, otherwise null.
 * API routes call this and return 404 (not 401) on null to avoid leaking existence.
 *
 * SEC-OWN-01: Two-factor protection — OWNER_ACCESS_TOKEN + HMAC-SHA256 cookie.
 */
import { createHmac, timingSafeEqual } from "crypto"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"

export async function getOwnerSession(): Promise<string | null> {
  const ownerEmail = process.env.OWNER_EMAIL
  if (!ownerEmail) return null

  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return null
  if (session.user.email !== ownerEmail) return null

  return ownerEmail
}

// ─── SEC-OWN-01: HMAC cookie helpers ────────────────────────────────────────

export const OWNER_COOKIE_NAME = "dg_owner_access"

function getOwnerAccessToken(): string {
  return process.env.OWNER_ACCESS_TOKEN ?? ""
}

/** Returns true when OWNER_ACCESS_TOKEN is configured in env. */
export function isOwnerTokenConfigured(): boolean {
  return getOwnerAccessToken().length > 0
}

/**
 * Sign a cookie value binding the token to a specific userId.
 * Result: HMAC-SHA256("userId:OWNER_ACCESS_TOKEN") — hex-encoded.
 * The HMAC key is also OWNER_ACCESS_TOKEN, so a missing key returns empty string.
 */
export function signOwnerToken(userId: string): string {
  const secret = getOwnerAccessToken()
  if (!secret) return ""
  return createHmac("sha256", secret)
    .update(`${userId}:${secret}`)
    .digest("hex")
}

/**
 * Verify the dg_owner_access cookie value for a given userId.
 * Uses timingSafeEqual to prevent timing oracle attacks.
 * Returns false if OWNER_ACCESS_TOKEN is not set or cookie is malformed.
 */
export function verifyOwnerToken(userId: string, cookie: string): boolean {
  const secret = getOwnerAccessToken()
  if (!secret) return false
  try {
    const expected = signOwnerToken(userId)
    if (!expected) return false
    const a = Buffer.from(expected, "hex")
    const b = Buffer.from(cookie, "hex")
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}
