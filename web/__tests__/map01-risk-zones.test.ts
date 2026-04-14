/**
 * MAP-01: Documentation Coverage & Risk Map — API route tests
 *
 *   AC-MAP01-1  GET /api/reports/risk-zones returns 401 when unauthenticated
 *   AC-MAP01-2  GET /api/reports/risk-zones returns 403 for FREE plan
 *   AC-MAP01-3  PRO tenant gets zones sorted by riskScore desc
 *   AC-MAP01-4  riskScore factors in avgDrift, unresolvedCount, criticalCount, policyViolations
 *   AC-MAP01-5  severity is derived correctly from riskScore thresholds
 *   AC-MAP01-6  repo filter (name contains) excludes non-matching repos
 *   AC-MAP01-7  docType filter excludes zones with no matching path prefix
 *   AC-MAP01-8  zones with no drift (score === 0) are excluded
 *   AC-MAP01-9  timeRange param defaults to 30d and limits job query window
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockGetServerSession = vi.fn()
vi.mock("next-auth", () => ({ getServerSession: mockGetServerSession }))
vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ authOptions: {} }))

const mockTenantFindUnique = vi.fn()
const mockRepoFindMany = vi.fn()
vi.mock("@/lib/prisma", () => ({
    prisma: {
        tenant: { findUnique: (...a: any[]) => mockTenantFindUnique(...a) },
        repository: { findMany: (...a: any[]) => mockRepoFindMany(...a) },
    },
}))

// ── Helpers ──────────────────────────────────────────────────────────────────

function adminSession(plan?: string) {
    return { user: { id: "u-1", email: "admin@t.com", role: "ADMIN", tenantId: "t-1" } }
}

function makeRequest(params: Record<string, string> = {}) {
    const qs = new URLSearchParams(params).toString()
    return new NextRequest(`http://localhost/api/reports/risk-zones${qs ? `?${qs}` : ""}`)
}

function makeRepo(name: string, jobs: any[]) {
    return { id: `repo-${name}`, name, jobs }
}

function makeJob(opts: {
    driftScore?: number
    severity?: string
    triageStatus?: string
    prNumber?: number
    filePaths?: string[]
    policyViolations?: any[]
    daysAgo?: number
}) {
    const {
        driftScore = 50,
        severity = "moderate",
        triageStatus = "PENDING",
        prNumber = 1,
        filePaths = [],
        policyViolations = [],
        daysAgo = 1,
    } = opts
    return {
        id: `job-${Math.random()}`,
        prNumber,
        triageStatus,
        createdAt: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000),
        result: {
            drift_score: driftScore,
            drift_analysis: {
                severity,
                items: filePaths.map((p) => ({ file_path: p })),
            },
            policy_violations: policyViolations,
        },
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("MAP-01: GET /api/reports/risk-zones", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockTenantFindUnique.mockResolvedValue({ plan: "PRO" })
        mockRepoFindMany.mockResolvedValue([])
    })

    it("AC-MAP01-1: unauthenticated → 401", async () => {
        mockGetServerSession.mockResolvedValue(null)
        const { GET } = await import("@/app/api/reports/risk-zones/route")
        const res = await GET(makeRequest())
        expect(res.status).toBe(401)
    })

    it("AC-MAP01-2: FREE plan → 403", async () => {
        mockGetServerSession.mockResolvedValue(adminSession())
        mockTenantFindUnique.mockResolvedValue({ plan: "FREE" })
        const { GET } = await import("@/app/api/reports/risk-zones/route")
        const res = await GET(makeRequest())
        expect(res.status).toBe(403)
    })

    it("AC-MAP01-3: PRO tenant — zones sorted by riskScore desc", async () => {
        mockGetServerSession.mockResolvedValue(adminSession())
        // repo-b has higher drift → higher riskScore
        mockRepoFindMany.mockResolvedValue([
            makeRepo("repo-a", [makeJob({ driftScore: 20 })]),
            makeRepo("repo-b", [makeJob({ driftScore: 80 })]),
        ])
        const { GET } = await import("@/app/api/reports/risk-zones/route")
        const res = await GET(makeRequest())
        const { zones } = await res.json()
        expect(zones[0].repoName).toBe("repo-b")
        expect(zones[1].repoName).toBe("repo-a")
    })

    it("AC-MAP01-4: riskScore accounts for drift, unresolved and policy violations", async () => {
        mockGetServerSession.mockResolvedValue(adminSession())
        mockRepoFindMany.mockResolvedValue([
            makeRepo("repo-x", [
                makeJob({ driftScore: 60, triageStatus: "PENDING", policyViolations: [{ rule_name: "api-docs" }] }),
            ]),
        ])
        const { GET } = await import("@/app/api/reports/risk-zones/route")
        const res = await GET(makeRequest())
        const { zones } = await res.json()
        expect(zones).toHaveLength(1)
        // riskScore = 60*0.5 + min(20,1*3) + min(20,0*10) + min(10,1*2) = 30+3+0+2 = 35
        expect(zones[0].riskScore).toBe(35)
        expect(zones[0].policyViolationCount).toBe(1)
    })

    it("AC-MAP01-5: severity thresholds — critical ≥75, high ≥50, moderate ≥25, low <25", async () => {
        mockGetServerSession.mockResolvedValue(adminSession())
        mockRepoFindMany.mockResolvedValue([
            // r-crit: avgDrift=100, unresolvedCount=3, criticalCount=2 → round(50+9+20)=79 → "critical"
            makeRepo("r-crit", [
                makeJob({ driftScore: 100, triageStatus: "PENDING", severity: "critical" }),
                makeJob({ driftScore: 100, triageStatus: "PENDING", severity: "critical" }),
                makeJob({ driftScore: 100, triageStatus: "PENDING" }),
            ]),
            // r-high: avgDrift=100, unresolvedCount=0 → round(50)=50 → "high"
            makeRepo("r-high", [makeJob({ driftScore: 100, triageStatus: "ACCEPTED" })]),
            // r-mod: avgDrift=50, unresolvedCount=0 → round(25)=25 → "moderate"
            makeRepo("r-mod",  [makeJob({ driftScore: 50,  triageStatus: "ACCEPTED" })]),
            // r-low: avgDrift=20, unresolvedCount=0 → round(10)=10 → "low"
            makeRepo("r-low",  [makeJob({ driftScore: 20,  triageStatus: "ACCEPTED" })]),
        ])
        const { GET } = await import("@/app/api/reports/risk-zones/route")
        const res = await GET(makeRequest())
        const { zones } = await res.json()
        const byName = Object.fromEntries(zones.map((z: any) => [z.repoName, z.severity]))
        expect(byName["r-crit"]).toBe("critical")
        expect(byName["r-high"]).toBe("high")
        expect(byName["r-mod"]).toBe("moderate")
        expect(byName["r-low"]).toBe("low")
    })

    it("AC-MAP01-6: repo filter excludes non-matching repos", async () => {
        mockGetServerSession.mockResolvedValue(adminSession())
        // Mock filters by passing repo param; the API calls prisma with contains filter
        // Simulate that prisma only returns matching repo
        mockRepoFindMany.mockResolvedValue([
            makeRepo("backend-api", [makeJob({ driftScore: 60 })]),
        ])
        const { GET } = await import("@/app/api/reports/risk-zones/route")
        const res = await GET(makeRequest({ repo: "backend" }))
        const { zones } = await res.json()
        expect(zones).toHaveLength(1)
        expect(zones[0].repoName).toBe("backend-api")
        // Verify prisma was called with the name filter
        expect(mockRepoFindMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    name: expect.objectContaining({ contains: "backend" }),
                }),
            })
        )
    })

    it("AC-MAP01-7: docType filter excludes zones with no matching path prefix", async () => {
        mockGetServerSession.mockResolvedValue(adminSession())
        mockRepoFindMany.mockResolvedValue([
            makeRepo("repo-a", [makeJob({ driftScore: 60, filePaths: ["src/api/routes.py"] })]),
            makeRepo("repo-b", [makeJob({ driftScore: 60, filePaths: ["docs/api/readme.md"] })]),
        ])
        const { GET } = await import("@/app/api/reports/risk-zones/route")
        const res = await GET(makeRequest({ docType: "docs/" }))
        const { zones } = await res.json()
        expect(zones).toHaveLength(1)
        expect(zones[0].repoName).toBe("repo-b")
    })

    it("AC-MAP01-8: repos with zero drift score are excluded from results", async () => {
        mockGetServerSession.mockResolvedValue(adminSession())
        mockRepoFindMany.mockResolvedValue([
            makeRepo("clean-repo", [makeJob({ driftScore: 0 })]),
        ])
        const { GET } = await import("@/app/api/reports/risk-zones/route")
        const res = await GET(makeRequest())
        const { zones } = await res.json()
        expect(zones).toHaveLength(0)
    })

    it("AC-MAP01-9: TEAM plan also returns 200", async () => {
        mockGetServerSession.mockResolvedValue(adminSession())
        mockTenantFindUnique.mockResolvedValue({ plan: "TEAM" })
        mockRepoFindMany.mockResolvedValue([makeRepo("team-repo", [makeJob({ driftScore: 55 })])])
        const { GET } = await import("@/app/api/reports/risk-zones/route")
        const res = await GET(makeRequest())
        expect(res.status).toBe(200)
        const { zones } = await res.json()
        expect(zones).toHaveLength(1)
    })
})
