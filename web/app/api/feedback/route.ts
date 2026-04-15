export const dynamic = "force-dynamic"
// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * FEED-01: Analysis Feedback Signal endpoint.
 *
 * GET /api/feedback?j={jobId}&s={signal}&tid={tenantId}&t={token}
 *
 * Verifies HMAC-SHA256 token, upserts AnalysisFeedback, redirects to /feedback/thank-you.
 * No auth cookie required — the HMAC token is the auth.
 *
 * Query params:
 *   j   — job CUID
 *   s   — signal: "up" | "down"
 *   tid — tenant CUID
 *   t   — HMAC token (first 24 hex chars of HMAC-SHA256(secret, "jobId:tenantId"))
 */

import { NextRequest, NextResponse } from "next/server"
import { createHmac, timingSafeEqual } from "crypto"
import { prisma } from "@/lib/prisma"

const FEEDBACK_HMAC_SECRET = process.env.FEEDBACK_HMAC_SECRET ?? ""

function makeToken(jobId: string, tenantId: string): string {
    const mac = createHmac("sha256", FEEDBACK_HMAC_SECRET)
    mac.update(`${jobId}:${tenantId}`)
    return mac.digest("hex").slice(0, 24)
}

function verifyToken(jobId: string, tenantId: string, token: string): boolean {
    if (!FEEDBACK_HMAC_SECRET || token.length !== 24) return false
    const expected = makeToken(jobId, tenantId)
    return timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(token, "utf8"))
}

export async function GET(req: NextRequest) {
    const { searchParams } = req.nextUrl
    const jobId    = searchParams.get("j")   ?? ""
    const signal   = searchParams.get("s")   ?? ""
    const tenantId = searchParams.get("tid") ?? ""
    const token    = searchParams.get("t")   ?? ""

    // Validate signal value
    if (signal !== "up" && signal !== "down") {
        return NextResponse.redirect(new URL("/feedback/thank-you?err=1", req.url))
    }

    // Verify HMAC
    if (!verifyToken(jobId, tenantId, token)) {
        return NextResponse.redirect(new URL("/feedback/thank-you?err=1", req.url))
    }

    // Upsert — one record per job per source
    try {
        await prisma.analysisFeedback.upsert({
            where:  { jobId_source: { jobId, source: "pr_comment" } },
            create: { jobId, tenantId, signal, source: "pr_comment" },
            update: { signal, updatedAt: new Date() },
        })
    } catch {
        // Don't expose DB errors to the user — redirect to thank-you anyway
    }

    return NextResponse.redirect(new URL("/feedback/thank-you", req.url))
}
