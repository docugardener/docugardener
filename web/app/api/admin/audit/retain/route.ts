/**
 * POST /api/admin/audit/retain
 *
 * SOC 2 audit log retention enforcement.
 * Called by a scheduled CI/CD job — NOT exposed to end users.
 *
 * Auth: Bearer token from CRON_SECRET env var.
 *
 * Env vars:
 *   CRON_SECRET          — shared secret for cron auth (required in production)
 *   AUDIT_HOT_DAYS       — retain in DB (default: 90 days)
 *   AUDIT_DELETE_DAYS    — hard-delete from DB (default: 365 days)
 *
 * Behaviour:
 *   1. Fetches all entries older than AUDIT_HOT_DAYS.
 *   2. Writes them to a timestamped JSON archive file (cold storage simulation).
 *      In production, replace the fs.writeFileSync with an S3 PutObject call.
 *   3. Hard-deletes entries older than AUDIT_DELETE_DAYS.
 *   4. Returns { archived, deleted, archiveFile } JSON.
 *
 * Body (optional):
 *   { "dryRun": true }  — skips writes and deletes; only reports counts.
 */
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import fs from "fs"
import path from "path"

const HOT_DAYS = parseInt(process.env.AUDIT_HOT_DAYS ?? "90", 10)
const DELETE_DAYS = parseInt(process.env.AUDIT_DELETE_DAYS ?? "365", 10)
// Where to write archive JSON files (relative to cwd / override with env var)
const ARCHIVE_DIR = process.env.AUDIT_ARCHIVE_DIR ?? path.join(process.cwd(), "audit-archives")

function addDays(date: Date, days: number): Date {
    const d = new Date(date)
    d.setDate(d.getDate() - days)
    return d
}

export async function POST(req: Request) {
    // ── Auth ───────────────────────────────────────────────────────────────────
    const cronSecret = process.env.CRON_SECRET
    if (!cronSecret) {
        // In dev (no secret set), allow unauthenticated for local testing
        if (process.env.NODE_ENV === "production") {
            return new NextResponse("CRON_SECRET not configured", { status: 500 })
        }
    } else {
        const authHeader = req.headers.get("authorization") ?? ""
        const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : ""
        if (token !== cronSecret) {
            return new NextResponse("Unauthorized", { status: 401 })
        }
    }

    let dryRun = false
    try {
        const body = await req.json()
        dryRun = Boolean(body?.dryRun)
    } catch { /* body optional */ }

    const now = new Date()
    const hotCutoff = addDays(now, HOT_DAYS)
    const deleteCutoff = addDays(now, DELETE_DAYS)

    // ── Count candidates ───────────────────────────────────────────────────────
    const [archiveCandidates, deleteCount] = await Promise.all([
        prisma.auditLog.findMany({
            where: { createdAt: { lt: hotCutoff, gte: deleteCutoff } },
            orderBy: { createdAt: "asc" },
            select: {
                id: true, tenantId: true, actorEmail: true, actorIp: true,
                event: true, resourceType: true, resourceId: true,
                metadata: true, hash: true, createdAt: true,
            },
        }),
        prisma.auditLog.count({
            where: { createdAt: { lt: deleteCutoff } },
        }),
    ])

    if (dryRun) {
        return NextResponse.json({
            dryRun: true,
            wouldArchive: archiveCandidates.length,
            wouldDelete: deleteCount,
            hotCutoff: hotCutoff.toISOString(),
            deleteCutoff: deleteCutoff.toISOString(),
        })
    }

    // ── Archive to cold storage ───────────────────────────────────────────────
    let archiveFile: string | null = null
    if (archiveCandidates.length > 0) {
        try {
            if (!fs.existsSync(ARCHIVE_DIR)) {
                fs.mkdirSync(ARCHIVE_DIR, { recursive: true })
            }
            const filename = `audit-archive-${now.toISOString().slice(0, 10)}.json`
            archiveFile = path.join(ARCHIVE_DIR, filename)
            fs.writeFileSync(
                archiveFile,
                JSON.stringify({ archivedAt: now.toISOString(), count: archiveCandidates.length, entries: archiveCandidates }, null, 2),
                "utf-8"
            )
        } catch (err) {
            console.error("[audit-retain] Archive write failed:", err)
            // Non-fatal — continue with deletion
        }
    }

    // ── Hard-delete expired entries ────────────────────────────────────────────
    const deleted = await prisma.auditLog.deleteMany({
        where: { createdAt: { lt: deleteCutoff } },
    })

    console.info(
        `[audit-retain] archived=${archiveCandidates.length} deleted=${deleted.count} archiveFile=${archiveFile ?? "none"}`
    )

    return NextResponse.json({
        archived: archiveCandidates.length,
        deleted: deleted.count,
        archiveFile,
        hotCutoff: hotCutoff.toISOString(),
        deleteCutoff: deleteCutoff.toISOString(),
    })
}
