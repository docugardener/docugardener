export const dynamic = "force-dynamic"
// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * GET /api/audit/export
 *
 * Streams the full tenant audit log as a CSV or JSON download.
 * Access: ADMIN or AUDITOR only.
 *
 * Query params:
 *   format   — "csv" (default) | "json"
 *   from     — ISO 8601 date (inclusive lower bound)
 *   to       — ISO 8601 date (inclusive upper bound)
 *   event    — filter by AuditEvent enum value
 *   actor    — filter by actorEmail substring (PRO+)
 *   status   — filter triage status on TRIAGE_DECISION entries: ACCEPTED|IGNORED (PRO+)
 *   severity — filter by drift severity on associated job: critical|significant|moderate|minor (PRO+)
 *   repo     — filter by repository name substring (PRO+)
 *
 * Row enrichment (TEAM+): each row additionally includes job_id, pr_number, pr_url.
 *
 * Limits: max 10,000 rows per export. Use `from`/`to` to slice large tenants.
 */
import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"
import { canAccessTenant } from "@/lib/features"

const ALLOWED_ROLES = ["ADMIN", "AUDITOR"]
const MAX_ROWS = 10_000

// AC-5: in-memory rate limiter — 1 export per minute per tenant
const _exportLastTime = new Map<string, number>()
const EXPORT_RATE_LIMIT_MS = 60_000

const BASE_CSV_COLUMNS = [
    "id", "createdAt", "event", "actorEmail", "actorIp",
    "resourceType", "resourceId", "metadata", "hash",
] as const

// EVID-01 AC-3: enriched columns added for TEAM plan
const ENRICHED_CSV_COLUMNS = [
    ...BASE_CSV_COLUMNS,
    "job_id", "pr_number", "pr_url",
] as const

function escapeCSV(value: unknown): string {
    if (value === null || value === undefined) return ""
    const str = typeof value === "object" ? JSON.stringify(value) : String(value)
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`
    }
    return str
}

function toCSVRow(log: Record<string, unknown>, columns: readonly string[]): string {
    return columns.map(col => escapeCSV(log[col])).join(",")
}

export async function GET(req: Request) {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
        return new NextResponse("Unauthorized", { status: 401 })
    }

    const role: string = (session.user as any).role ?? ""
    if (!ALLOWED_ROLES.includes(role)) {
        return new NextResponse("Forbidden", { status: 403 })
    }

    const tenantId: string = (session.user as any).tenantId
    if (!tenantId) {
        return new NextResponse("Tenant not found", { status: 403 })
    }

    // AC-4: GTM-04 — evidence export is TEAM plan only (overridable via grantedFeatures)
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { plan: true, workflowConfig: true } })
    if (!canAccessTenant(tenant!, "audit_log_export")) {
        return NextResponse.json({ error: "upgrade_required", feature: "evidence_export" }, { status: 403 })
    }

    // AC-5: rate limit — 1 export per minute per tenant
    const now = Date.now()
    const last = _exportLastTime.get(tenantId) ?? 0
    if (now - last < EXPORT_RATE_LIMIT_MS) {
        const retryAfter = Math.ceil((EXPORT_RATE_LIMIT_MS - (now - last)) / 1000)
        return NextResponse.json(
            { error: "rate_limited", retryAfterSeconds: retryAfter },
            { status: 429, headers: { "Retry-After": String(retryAfter) } },
        )
    }
    _exportLastTime.set(tenantId, now)

    const { searchParams } = new URL(req.url)
    const format = searchParams.get("format") === "json" ? "json" : "csv"
    const eventFilter = searchParams.get("event") ?? undefined
    const fromStr = searchParams.get("from")
    const toStr = searchParams.get("to")
    // EVID-01 AC-2: new filter params (PRO+ — already TEAM-gated above, so available to all passing users)
    const actorFilter = searchParams.get("actor") ?? undefined
    const statusFilter = searchParams.get("status") ?? undefined
    const severityFilter = searchParams.get("severity") ?? undefined
    const repoFilter = searchParams.get("repo") ?? undefined

    // EVID-01 AC-2: resolve job IDs for repo/severity filters (requires joining Job table)
    let resourceIdFilter: string[] | undefined
    if (repoFilter || severityFilter) {
        const repoWhere: Record<string, unknown> = { tenantId }
        if (repoFilter) repoWhere.name = { contains: repoFilter, mode: "insensitive" }

        const matchingRepos = repoFilter
            ? await prisma.repository.findMany({ where: repoWhere as any, select: { id: true } })
            : null

        const jobWhere: Record<string, unknown> = { tenantId }
        if (matchingRepos) jobWhere.repositoryId = { in: matchingRepos.map(r => r.id) }

        const matchingJobs = await prisma.job.findMany({
            where: jobWhere as any,
            select: { id: true, result: true },
        })

        const filtered = severityFilter
            ? matchingJobs.filter(j => {
                const sev = (j.result as any)?.drift_analysis?.severity?.toLowerCase()
                return sev === severityFilter.toLowerCase()
            })
            : matchingJobs

        resourceIdFilter = filtered.map(j => j.id)
        // If no jobs match the repo/severity criteria return empty export rather than full dataset
        if (resourceIdFilter.length === 0) {
            const emptyTs = new Date().toISOString().slice(0, 10)
            const emptyFilename = `audit-log-${emptyTs}.${format}`
            if (format === "json") {
                return new NextResponse(JSON.stringify({ exportedAt: new Date().toISOString(), tenantId, count: 0, logs: [] }, null, 2), {
                    headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="${emptyFilename}"` },
                })
            }
            const header = ENRICHED_CSV_COLUMNS.join(",")
            return new NextResponse(header, {
                headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${emptyFilename}"` },
            })
        }
    }

    const where: Record<string, unknown> = { tenantId }
    if (eventFilter) where.event = eventFilter
    if (fromStr || toStr) {
        const range: Record<string, Date> = {}
        if (fromStr) range.gte = new Date(fromStr)
        if (toStr) range.lte = new Date(toStr + "T23:59:59.999Z")
        where.createdAt = range
    }
    // EVID-01 AC-2: actor filter — direct match on actorEmail
    if (actorFilter) where.actorEmail = { contains: actorFilter, mode: "insensitive" }
    // EVID-01 AC-2: repo/severity — filter by resolved job IDs (resourceId = job.id for job events)
    if (resourceIdFilter) where.resourceId = { in: resourceIdFilter }

    const logs = await prisma.auditLog.findMany({
        where: where as any,
        orderBy: { createdAt: "asc" },
        take: MAX_ROWS,
        select: {
            id: true, createdAt: true, event: true, actorEmail: true, actorIp: true,
            resourceType: true, resourceId: true, metadata: true, hash: true,
        },
    })

    // EVID-01 AC-2: status filter — applied in-memory on metadata.status for TRIAGE_DECISION entries
    const filteredLogs = statusFilter
        ? logs.filter(l => {
            const meta = l.metadata as any
            return !meta?.status || meta.status === statusFilter.toUpperCase()
        })
        : logs

    // EVID-01 AC-3: enrich with job data (job_id = resourceId, fetch matching jobs for pr_number + pr_url)
    const jobIds = [...new Set(filteredLogs.map(l => l.resourceId).filter(Boolean))] as string[]
    const jobMap = new Map<string, { prNumber: number; prUrl: string | null }>()
    if (jobIds.length > 0) {
        const jobs = await prisma.job.findMany({
            where: { id: { in: jobIds } },
            select: { id: true, prNumber: true, result: true },
        })
        for (const j of jobs) {
            jobMap.set(j.id, {
                prNumber: j.prNumber,
                prUrl: (j.result as any)?.fixPrUrl ?? null,
            })
        }
    }

    const enrichedLogs = filteredLogs.map(l => {
        const job = l.resourceId ? jobMap.get(l.resourceId) : undefined
        return {
            ...l,
            job_id: l.resourceId ?? null,
            pr_number: job?.prNumber ?? null,
            pr_url: job?.prUrl ?? null,
        }
    })

    const timestamp = new Date().toISOString().slice(0, 10)
    const filename = `audit-log-${timestamp}.${format}`
    const csvColumns = ENRICHED_CSV_COLUMNS

    if (format === "json") {
        const body = JSON.stringify({ exportedAt: new Date().toISOString(), tenantId, count: enrichedLogs.length, logs: enrichedLogs }, null, 2)
        return new NextResponse(body, {
            status: 200,
            headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="${filename}"` },
        })
    }

    const header = csvColumns.join(",")
    const rows = enrichedLogs.map(log => toCSVRow(log as any, csvColumns))
    const csv = [header, ...rows].join("\n")

    return new NextResponse(csv, {
        status: 200,
        headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"` },
    })
}
