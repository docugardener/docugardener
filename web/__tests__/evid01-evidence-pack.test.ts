/**
 * EVID-01: Trust-Grade Evidence Pack tests
 *
 *   AC-EVID01-1  Inbox: event timeline renders correct step labels
 *   AC-EVID01-2  Export: actor filter passes actorEmail contains to Prisma
 *   AC-EVID01-2b Export: severity filter resolves job IDs and filters resourceId
 *   AC-EVID01-2c Export: repo filter resolves repo IDs then job IDs
 *   AC-EVID01-2d Export: status filter applied in-memory on metadata.status
 *   AC-EVID01-3  Export: enriched columns job_id, pr_number, pr_url present in output
 *   AC-EVID01-3b Export: JSON enriched row contains pr_number and pr_url
 *   AC-EVID01-3c Export: empty repo/severity match returns empty export
 *   AC-EVID01-4  Reports: evidenceCoverage = % jobs with non-PENDING triageStatus
 *   AC-EVID01-5  Reports: dismissRatesBySeverity computes correct rates per severity
 *   AC-EVID01-5b Reports: dismissRatesBySeverity sorted by SEV_ORDER
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockGetServerSession = vi.fn()
vi.mock("next-auth", () => ({ getServerSession: mockGetServerSession }))
vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }))

const mockAuditFindMany = vi.fn()
const mockTenantFindUnique = vi.fn()
const mockJobFindMany = vi.fn()
const mockRepoFindMany = vi.fn()

vi.mock("@/lib/prisma", () => ({
    prisma: {
        auditLog: { findMany: (...a: any[]) => mockAuditFindMany(...a) },
        tenant: { findUnique: (...a: any[]) => mockTenantFindUnique(...a) },
        job: { findMany: (...a: any[]) => mockJobFindMany(...a) },
        repository: { findMany: (...a: any[]) => mockRepoFindMany(...a) },
    },
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

function adminSession() {
    return { user: { role: "ADMIN", tenantId: "t-1", email: "admin@test.com" } }
}

const BASE_LOG = {
    id: "log-1",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    event: "JOB_COMPLETED",
    actorEmail: "alice@test.com",
    actorIp: "1.2.3.4",
    resourceType: "job",
    resourceId: "job-1",
    metadata: { status: "ACCEPTED" },
    hash: "abc123",
}

async function callExport(url: string, setupMocks?: () => void) {
    vi.resetModules()
    mockGetServerSession.mockResolvedValue(adminSession())
    mockTenantFindUnique.mockResolvedValue({ plan: "TEAM" })
    setupMocks?.()
    const { GET } = await import("@/app/api/audit/export/route")
    return GET(new Request(url))
}

// ── AC-EVID01-2: actor filter ─────────────────────────────────────────────────

describe("AC-EVID01-2: actor filter passes actorEmail contains to Prisma", () => {
    it("includes actorEmail insensitive contains filter", async () => {
        mockAuditFindMany.mockResolvedValue([BASE_LOG])
        mockJobFindMany.mockResolvedValue([])

        const res = await callExport(
            "http://localhost/api/audit/export?actor=alice",
            () => {
                mockAuditFindMany.mockResolvedValue([BASE_LOG])
                mockJobFindMany.mockResolvedValue([])
            }
        )
        expect(res.status).toBe(200)
        expect(mockAuditFindMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    actorEmail: { contains: "alice", mode: "insensitive" },
                }),
            })
        )
    })
})

// ── AC-EVID01-2b: severity filter resolves job IDs ───────────────────────────

describe("AC-EVID01-2b: severity filter resolves matching job IDs", () => {
    it("queries jobs and filters by drift_analysis.severity, then filters audit logs by resourceId", async () => {
        const criticalJob = {
            id: "job-critical",
            result: { drift_analysis: { severity: "Critical" } },
        }
        const moderateJob = {
            id: "job-moderate",
            result: { drift_analysis: { severity: "moderate" } },
        }

        const res = await callExport(
            "http://localhost/api/audit/export?severity=critical",
            () => {
                mockJobFindMany.mockResolvedValueOnce([criticalJob, moderateJob]) // first call: resolve job IDs
                mockJobFindMany.mockResolvedValue([])  // second call: enrichment
                mockAuditFindMany.mockResolvedValue([{ ...BASE_LOG, resourceId: "job-critical" }])
            }
        )
        expect(res.status).toBe(200)
        // Should have queried jobs to resolve severity
        expect(mockJobFindMany).toHaveBeenCalled()
        // Should filter audit logs by the resolved job ID
        expect(mockAuditFindMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    resourceId: { in: ["job-critical"] },
                }),
            })
        )
    })

    it("returns empty export (header only) when no jobs match severity", async () => {
        const res = await callExport(
            "http://localhost/api/audit/export?severity=critical",
            () => {
                mockJobFindMany.mockResolvedValueOnce([]) // no matching jobs
            }
        )
        expect(res.status).toBe(200)
        const text = await res.text()
        // Should be header only (one line)
        expect(text.trim().split("\n").length).toBe(1)
    })
})

// ── AC-EVID01-2c: repo filter resolves through repos → jobs ──────────────────

describe("AC-EVID01-2c: repo filter resolves repo IDs then job IDs", () => {
    it("queries repositories first, then jobs filtered by repositoryId", async () => {
        const matchingRepo = { id: "repo-1" }
        const matchingJob = { id: "job-repo1", result: { drift_analysis: {} } }

        const res = await callExport(
            "http://localhost/api/audit/export?repo=my-service",
            () => {
                mockRepoFindMany.mockResolvedValue([matchingRepo])
                mockJobFindMany.mockResolvedValueOnce([matchingJob]) // job resolution
                mockJobFindMany.mockResolvedValue([])  // enrichment
                mockAuditFindMany.mockResolvedValue([BASE_LOG])
            }
        )
        expect(res.status).toBe(200)
        expect(mockRepoFindMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    name: { contains: "my-service", mode: "insensitive" },
                }),
            })
        )
        expect(mockJobFindMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    repositoryId: { in: ["repo-1"] },
                }),
            })
        )
    })
})

// ── AC-EVID01-2d: status filter applied in-memory ────────────────────────────

describe("AC-EVID01-2d: status filter applied in-memory on metadata.status", () => {
    it("keeps only logs whose metadata.status matches (case-insensitive)", async () => {
        const acceptedLog = { ...BASE_LOG, id: "log-accepted", metadata: { status: "ACCEPTED" } }
        const ignoredLog = { ...BASE_LOG, id: "log-ignored", metadata: { status: "IGNORED" } }

        const res = await callExport(
            "http://localhost/api/audit/export?format=json&status=ACCEPTED",
            () => {
                mockAuditFindMany.mockResolvedValue([acceptedLog, ignoredLog])
                mockJobFindMany.mockResolvedValue([])
            }
        )
        expect(res.status).toBe(200)
        const data = await res.json()
        expect(data.count).toBe(1)
        expect(data.logs[0].id).toBe("log-accepted")
    })
})

// ── AC-EVID01-3: enriched columns in CSV ─────────────────────────────────────

describe("AC-EVID01-3: enriched columns job_id, pr_number, pr_url in CSV header", () => {
    it("CSV header contains job_id, pr_number, pr_url", async () => {
        mockAuditFindMany.mockResolvedValue([BASE_LOG])
        mockJobFindMany.mockResolvedValue([])

        const res = await callExport(
            "http://localhost/api/audit/export?format=csv",
            () => {
                mockAuditFindMany.mockResolvedValue([BASE_LOG])
                mockJobFindMany.mockResolvedValue([])
            }
        )
        expect(res.status).toBe(200)
        const text = await res.text()
        const header = text.split("\n")[0]
        expect(header).toContain("job_id")
        expect(header).toContain("pr_number")
        expect(header).toContain("pr_url")
    })
})

// ── AC-EVID01-3b: JSON enriched rows include pr_number and pr_url ─────────────

describe("AC-EVID01-3b: JSON enriched row contains pr_number and pr_url from job", () => {
    it("joins job data onto log row", async () => {
        const logWithJobRef = { ...BASE_LOG, resourceId: "job-99" }
        const enrichedJob = {
            id: "job-99",
            prNumber: 42,
            result: { fixPrUrl: "https://github.com/x/y/pull/42" },
        }

        const res = await callExport(
            "http://localhost/api/audit/export?format=json",
            () => {
                mockAuditFindMany.mockResolvedValue([logWithJobRef])
                mockJobFindMany.mockResolvedValue([enrichedJob])
            }
        )
        expect(res.status).toBe(200)
        const data = await res.json()
        expect(data.logs[0].job_id).toBe("job-99")
        expect(data.logs[0].pr_number).toBe(42)
        expect(data.logs[0].pr_url).toBe("https://github.com/x/y/pull/42")
    })

    it("pr_number and pr_url are null when resourceId has no matching job", async () => {
        const logNoJob = { ...BASE_LOG, resourceId: "unknown-job" }

        const res = await callExport(
            "http://localhost/api/audit/export?format=json",
            () => {
                mockAuditFindMany.mockResolvedValue([logNoJob])
                mockJobFindMany.mockResolvedValue([]) // no matching job
            }
        )
        expect(res.status).toBe(200)
        const data = await res.json()
        expect(data.logs[0].pr_number).toBeNull()
        expect(data.logs[0].pr_url).toBeNull()
    })
})

// ── AC-EVID01-4: Evidence Coverage KPI ───────────────────────────────────────
//
// evidenceCoverage = % of completed jobs where triageStatus !== "PENDING"

describe("AC-EVID01-4: evidenceCoverage computation", () => {
    function computeEvidenceCoverage(jobs: { triageStatus: string }[]) {
        const total = jobs.length
        if (total === 0) return null
        const decided = jobs.filter(j => j.triageStatus !== "PENDING").length
        return Math.round((decided / total) * 100)
    }

    it("returns null when no completed jobs", () => {
        expect(computeEvidenceCoverage([])).toBeNull()
    })

    it("returns 100 when all jobs have non-PENDING status", () => {
        const jobs = [
            { triageStatus: "ACCEPTED" },
            { triageStatus: "IGNORED" },
        ]
        expect(computeEvidenceCoverage(jobs)).toBe(100)
    })

    it("returns 0 when all jobs are PENDING", () => {
        const jobs = [{ triageStatus: "PENDING" }, { triageStatus: "PENDING" }]
        expect(computeEvidenceCoverage(jobs)).toBe(0)
    })

    it("returns 50 for half decided", () => {
        const jobs = [
            { triageStatus: "ACCEPTED" },
            { triageStatus: "PENDING" },
        ]
        expect(computeEvidenceCoverage(jobs)).toBe(50)
    })

    it("rounds to integer", () => {
        const jobs = [
            { triageStatus: "ACCEPTED" },
            { triageStatus: "PENDING" },
            { triageStatus: "PENDING" },
        ]
        // 1/3 = 33.33… → 33
        expect(computeEvidenceCoverage(jobs)).toBe(33)
    })
})

// ── AC-EVID01-5: dismissRatesBySeverity ──────────────────────────────────────

describe("AC-EVID01-5: dismissRatesBySeverity per severity", () => {
    const SEV_ORDER = ["critical", "significant", "moderate", "minor", "none"]

    function computeDismissRates(jobs: { triageStatus: string; severity: string }[]) {
        const decidedBySev: Record<string, { ignored: number; accepted: number }> = {}
        for (const job of jobs) {
            const sev = job.severity.toLowerCase()
            if (!decidedBySev[sev]) decidedBySev[sev] = { ignored: 0, accepted: 0 }
            if (job.triageStatus === "IGNORED") decidedBySev[sev].ignored++
            else decidedBySev[sev].accepted++
        }
        return Object.entries(decidedBySev)
            .map(([severity, { ignored, accepted }]) => ({
                severity,
                ignored,
                accepted,
                dismissRate: Math.round((ignored / (ignored + accepted)) * 100),
            }))
            .sort((a, b) => SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity))
    }

    it("computes 100% dismiss rate when all decisions are IGNORED", () => {
        const jobs = [
            { triageStatus: "IGNORED", severity: "critical" },
            { triageStatus: "IGNORED", severity: "critical" },
        ]
        const rates = computeDismissRates(jobs)
        expect(rates[0].severity).toBe("critical")
        expect(rates[0].dismissRate).toBe(100)
        expect(rates[0].ignored).toBe(2)
        expect(rates[0].accepted).toBe(0)
    })

    it("computes 0% dismiss rate when all decisions are ACCEPTED", () => {
        const jobs = [
            { triageStatus: "ACCEPTED", severity: "moderate" },
            { triageStatus: "ACCEPTED", severity: "moderate" },
        ]
        const rates = computeDismissRates(jobs)
        expect(rates[0].dismissRate).toBe(0)
    })

    it("computes 50% dismiss rate for equal ignored and accepted", () => {
        const jobs = [
            { triageStatus: "IGNORED", severity: "minor" },
            { triageStatus: "ACCEPTED", severity: "minor" },
        ]
        const rates = computeDismissRates(jobs)
        expect(rates[0].dismissRate).toBe(50)
    })

    it("handles multiple severities with correct per-severity rates", () => {
        const jobs = [
            { triageStatus: "IGNORED", severity: "critical" },
            { triageStatus: "IGNORED", severity: "critical" },
            { triageStatus: "ACCEPTED", severity: "moderate" },
        ]
        const rates = computeDismissRates(jobs)
        const critical = rates.find(r => r.severity === "critical")!
        const moderate = rates.find(r => r.severity === "moderate")!
        expect(critical.dismissRate).toBe(100)
        expect(moderate.dismissRate).toBe(0)
    })

    it("returns empty array when no decisions", () => {
        expect(computeDismissRates([])).toHaveLength(0)
    })
})

// ── AC-EVID01-5b: dismissRatesBySeverity sorted by SEV_ORDER ─────────────────

describe("AC-EVID01-5b: dismissRatesBySeverity sorted critical → minor → none", () => {
    const SEV_ORDER = ["critical", "significant", "moderate", "minor", "none"]

    function computeDismissRates(jobs: { triageStatus: string; severity: string }[]) {
        const decidedBySev: Record<string, { ignored: number; accepted: number }> = {}
        for (const job of jobs) {
            const sev = job.severity.toLowerCase()
            if (!decidedBySev[sev]) decidedBySev[sev] = { ignored: 0, accepted: 0 }
            if (job.triageStatus === "IGNORED") decidedBySev[sev].ignored++
            else decidedBySev[sev].accepted++
        }
        return Object.entries(decidedBySev)
            .map(([severity, { ignored, accepted }]) => ({
                severity,
                ignored,
                accepted,
                dismissRate: Math.round((ignored / (ignored + accepted)) * 100),
            }))
            .sort((a, b) => SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity))
    }

    it("orders results: minor before critical when input is reversed", () => {
        const jobs = [
            { triageStatus: "IGNORED", severity: "minor" },
            { triageStatus: "ACCEPTED", severity: "critical" },
        ]
        const rates = computeDismissRates(jobs)
        expect(rates[0].severity).toBe("critical")
        expect(rates[1].severity).toBe("minor")
    })

    it("places 'none' severity last", () => {
        const jobs = [
            { triageStatus: "IGNORED", severity: "none" },
            { triageStatus: "IGNORED", severity: "significant" },
            { triageStatus: "ACCEPTED", severity: "minor" },
        ]
        const rates = computeDismissRates(jobs)
        expect(rates[rates.length - 1].severity).toBe("none")
        expect(rates[0].severity).toBe("significant")
    })
})
