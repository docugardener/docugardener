// SPDX-License-Identifier: AGPL-3.0-or-later
import { Suspense } from "react"
import { getServerSession } from "next-auth"
import { authOptions } from "../../api/auth/[...nextauth]/route"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Settings, Activity, ShieldAlert, GitPullRequest, Lock, TrendingUp } from "lucide-react"
import { UpgradeContextCard } from "@/components/billing/UpgradeContextCard"
import { prisma } from "@/lib/prisma"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { HealthScoreWidget } from "@/components/dashboard/HealthScoreWidget"
import { DriftVelocityChart } from "@/components/dashboard/DriftVelocityChart"
import { WitheringZones } from "@/components/dashboard/WitheringZones"
import { IgnoreTrendChart } from "@/components/dashboard/IgnoreTrendChart"
import { PageHeader } from "@/components/layout/PageHeader"
import { DashboardShell } from "@/components/dashboard/DashboardShell"
import { ReportsTabs } from "@/components/reports/ReportsTabs"
import { TopRiskZones } from "@/components/reports/TopRiskZones"
import { SEVERITY_CONFIG, normaliseSeverity } from "@/lib/severity"

export const dynamic = 'force-dynamic'

async function getDashboardData(tenantId: string) {
    const totalRepos = await prisma.repository.count({ where: { tenantId } })
    const yesterday = new Date(new Date().getTime() - 24 * 60 * 60 * 1000)
    const totalJobs24h = await prisma.job.count({ where: { tenantId, createdAt: { gte: yesterday } } })
    const activeJobs = await prisma.job.count({ where: { tenantId, status: "PROCESSING" } })
    const recentJobs = await prisma.job.findMany({
        where: { tenantId },
        take: 20,
        orderBy: { createdAt: "desc" },
        include: { repository: { select: { name: true } } }
    })

    const velocityData = recentJobs
        .filter(j => j.status === "COMPLETED" && (j.result as any)?.drift_score !== undefined)
        .map(j => ({
            date: new Date(j.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' }),
            score: (j.result as any).drift_score as number
        }))
        .reverse()

    const repos = await prisma.repository.findMany({
        where: { tenantId },
        include: {
            jobs: {
                where: { status: "COMPLETED" },
                orderBy: { createdAt: "desc" },
                take: 5,
                select: { result: true, createdAt: true }
            }
        }
    })

    const witheringZones = repos
        .map(repo => {
            const scores = repo.jobs.map(j => (j.result as any)?.drift_score).filter(s => s !== undefined)
            const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0
            return {
                name: repo.name,
                avgDrift: Math.round(avg),
                lastScan: repo.jobs[0] ? new Date(repo.jobs[0].createdAt).toLocaleDateString() : "Never"
            }
        })
        .filter(z => z.avgDrift > 0)
        .sort((a, b) => b.avgDrift - a.avgDrift)
        .slice(0, 3)

    let totalDrift = 0, count = 0, criticalBlocks = 0
    const completedJobsForStats = await prisma.job.findMany({
        // @ts-ignore
        where: { tenantId, status: "COMPLETED", result: { not: null } },
        take: 50,
        select: { result: true }
    })

    for (const job of completedJobsForStats) {
        const res = job.result as any
        if (res?.drift_score !== undefined) {
            totalDrift += res.drift_score
            count++
            if (res.drift_score > 80) criticalBlocks++
        }
    }
    const avgDrift = count > 0 ? Math.round(totalDrift / count) : 0

    return {
        stats: { totalRepos, totalJobs24h, activeJobs, avgDrift, criticalBlocks },
        velocityData,
        witheringZones,
    }
}

async function getIgnoreData(tenantId: string) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

    const decidedJobs = await prisma.job.findMany({
        where: {
            tenantId,
            triageStatus: { in: ["IGNORED", "ACCEPTED"] },
            updatedAt: { gte: thirtyDaysAgo },
        },
        select: { triageStatus: true, result: true, updatedAt: true },
    })

    const ignoredJobs = decidedJobs.filter(j => j.triageStatus === "IGNORED")
    const totalIgnored = ignoredJobs.length
    const totalAccepted = decidedJobs.filter(j => j.triageStatus === "ACCEPTED").length
    const ignoreRate = (totalIgnored + totalAccepted) > 0
        ? Math.round((totalIgnored / (totalIgnored + totalAccepted)) * 100)
        : 0
    const withReason = ignoredJobs.filter(j => !!(j.result as any)?.dismiss_reason).length
    const reasonCaptureRate = totalIgnored > 0
        ? Math.round((withReason / totalIgnored) * 100)
        : 0

    const trendMap: Record<string, { ignored: number; accepted: number }> = {}
    for (const job of decidedJobs) {
        const day = job.updatedAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })
        if (!trendMap[day]) trendMap[day] = { ignored: 0, accepted: 0 }
        if (job.triageStatus === "IGNORED") trendMap[day].ignored++
        else trendMap[day].accepted++
    }
    const year = new Date().getFullYear()
    const trend = Object.entries(trendMap)
        .sort(([a], [b]) => new Date(`${a} ${year}`).getTime() - new Date(`${b} ${year}`).getTime())
        .map(([date, v]) => ({ date, ...v }))

    const severityMap: Record<string, number> = {}
    for (const job of ignoredJobs) {
        const raw = (job.result as any)?.drift_analysis?.severity ?? "none"
        severityMap[raw.toLowerCase()] = (severityMap[raw.toLowerCase()] ?? 0) + 1
    }
    const severityBreakdown = Object.entries(severityMap)
        .sort(([, a], [, b]) => b - a)
        .map(([severity, count]) => ({ severity, count }))

    // EVID-01 AC-5: dismiss rate by severity — % of decisions that were IGNORED per severity level
    const decidedBySev: Record<string, { ignored: number; accepted: number }> = {}
    for (const job of decidedJobs) {
        const sev = (job.result as any)?.drift_analysis?.severity?.toLowerCase() ?? "none"
        if (!decidedBySev[sev]) decidedBySev[sev] = { ignored: 0, accepted: 0 }
        if (job.triageStatus === "IGNORED") decidedBySev[sev].ignored++
        else decidedBySev[sev].accepted++
    }
    const SEV_ORDER = ["critical", "significant", "moderate", "minor", "none"]
    const dismissRatesBySeverity = Object.entries(decidedBySev)
        .map(([severity, { ignored, accepted }]) => ({
            severity,
            ignored,
            accepted,
            dismissRate: Math.round((ignored / (ignored + accepted)) * 100),
        }))
        .sort((a, b) => SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity))

    const reasonMap: Record<string, number> = {}
    for (const job of ignoredJobs) {
        const reason = (job.result as any)?.dismiss_reason
        if (reason) reasonMap[reason] = (reasonMap[reason] ?? 0) + 1
    }
    const topReasons = Object.entries(reasonMap)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 8)
        .map(([reason, count]) => ({ reason, count }))

    return {
        kpis: { totalIgnored, ignoreRate, reasonCaptureRate },
        trend,
        severityBreakdown,
        topReasons,
        dismissRatesBySeverity,
    }
}

async function getProofPoints(tenantId: string) {
    const completedJobs = await prisma.job.findMany({
        where: { tenantId, status: "COMPLETED", completedAt: { not: null } },
        select: { result: true, triageStatus: true, completedAt: true, updatedAt: true, fixPrUrl: true },
        take: 200,
        orderBy: { completedAt: "desc" },
    })

    // FEED-01: false-positive rate — % of analyses where a developer clicked "false positive" (PRO+)
    const totalFeedback = await prisma.analysisFeedback.count({ where: { tenantId } })
    const downVotes     = await prisma.analysisFeedback.count({ where: { tenantId, signal: "down" } })
    const falsePositiveRate = totalFeedback > 0
        ? Math.round((downVotes / totalFeedback) * 100)
        : null

    // 1. % PRs where drift was detected
    const withDrift = completedJobs.filter(j => {
        const score = (j.result as any)?.drift_score
        return typeof score === "number" && score > 0
    })
    const prsWithDriftPct = completedJobs.length > 0
        ? Math.round((withDrift.length / completedJobs.length) * 100)
        : null

    // 2. Average time to triage (hours) — updatedAt approximates triage timestamp
    const decidedJobs = completedJobs.filter(j => j.triageStatus !== "PENDING" && j.completedAt != null)
    let avgTriageHours: number | null = null
    if (decidedJobs.length > 0) {
        const totalMs = decidedJobs.reduce((sum, j) => sum + (j.updatedAt.getTime() - j.completedAt!.getTime()), 0)
        avgTriageHours = Math.round(totalMs / decidedJobs.length / (1000 * 60 * 60))
    }

    // 3. % critical severity alerts dismissed without a fix
    const criticalJobs = completedJobs.filter(j => {
        const sev = (j.result as any)?.drift_analysis?.severity?.toLowerCase()
        return sev === "critical"
    })
    const criticalDismissedPct = criticalJobs.length > 0
        ? Math.round((criticalJobs.filter(j => j.triageStatus === "IGNORED").length / criticalJobs.length) * 100)
        : null

    // FIX-01: auto-fix success rate — % of fix PRs where recheck passed
    // fixPrUrl lives only in result JSON (the top-level column is not populated by the Python worker)
    const jobsWithFix = completedJobs.filter(j => !!(j.result as any)?.fixPrUrl)
    const jobsWithRecheckPassed = jobsWithFix.filter(j => (j.result as any)?.recheck_status === "passed")
    const autoFixSuccessRate = jobsWithFix.length > 0
        ? Math.round((jobsWithRecheckPassed.length / jobsWithFix.length) * 100)
        : null

    // EVID-01 AC-4: Evidence Coverage — % of PRs with a complete evidence chain
    // Complete = analysis ran + a triage decision was recorded (not still PENDING)
    const jobsWithDecision = completedJobs.filter(j => j.triageStatus !== "PENDING")
    const evidenceCoverage = completedJobs.length > 0
        ? Math.round((jobsWithDecision.length / completedJobs.length) * 100)
        : null

    return { prsWithDriftPct, avgTriageHours, criticalDismissedPct, autoFixSuccessRate, totalFixPrs: jobsWithFix.length, evidenceCoverage, falsePositiveRate, totalFeedback, totalAnalyzed: completedJobs.length }
}

export default async function ReportsPage() {
    const session = await getServerSession(authOptions)
    if (!session?.user || !(session.user as any).tenantId) {
        redirect(session ? "/onboarding" : "/api/auth/signin")
    }

    const tenantId = (session.user as any).tenantId
    const role = (session.user as any).role

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { plan: true } })
    const plan = tenant?.plan ?? "FREE"
    const isPro = plan !== "FREE"

    const [data, ignoreData, proofPoints] = await Promise.all([
        getDashboardData(tenantId),
        isPro ? getIgnoreData(tenantId) : Promise.resolve(null),
        getProofPoints(tenantId),
    ])

    return (
        <div className="w-full min-h-screen bg-background pb-20 font-sans text-foreground">
            <PageHeader
                title="GARDEN HEALTH"
                description={`Workspace context: ${tenantId}`}
                subtitle={
                    <div className="flex items-center gap-2 text-primary mb-2 font-black text-[11px] uppercase tracking-[0.3em]">
                        <Activity className="h-4 w-4" />
                        Live Monitoring System
                    </div>
                }
                actions={
                    role === "ADMIN" ? (
                        <Link href="/dashboard/settings">
                            <Button variant="outline" className="rounded-xl border-border bg-card text-foreground hover:bg-muted h-12 px-6 gap-2 font-black shadow-md transition-all active:translate-y-0.5">
                                <Settings className="w-4 h-4" />
                                Control Plane
                            </Button>
                        </Link>
                    ) : undefined
                }
            >
                {/* KPI Bar — 4 equal columns, Avg Drift replaces low-signal "Processing" */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    {[
                        { label: "Active Repos",  val: data.stats.totalRepos,    icon: GitPullRequest, color: "text-foreground" },
                        { label: "PRs Scanned",   val: data.stats.totalJobs24h,  icon: Activity,       color: "text-foreground", sub: data.stats.totalJobs24h > 0 ? "Last 24 hours" : undefined },
                        { label: "Critical Drift", val: data.stats.criticalBlocks, icon: ShieldAlert,  color: "text-broken",    sub: data.stats.criticalBlocks > 0 ? "Action required" : undefined },
                        { label: "Avg Drift Score", val: data.stats.avgDrift,     icon: Activity,       color: "text-primary",   sub: data.stats.avgDrift > 0 ? "Across all repos" : undefined },
                    ].map((stat, i) => (
                        <div key={i} className="rounded-card bg-card border border-border p-6 shadow-card transition-all hover:shadow-card-hover animate-entrance" style={{ animationDelay: `${i * 100}ms` }}>
                            <div className="flex justify-between items-start mb-2">
                                <span className="type-metadata font-black uppercase tracking-widest text-muted-foreground">{stat.label}</span>
                                <stat.icon className="w-5 h-5 text-muted-foreground/30" />
                            </div>
                            <div className={`text-4xl font-black tracking-tighter ${stat.color}`}>{stat.val}</div>
                            {stat.sub && (
                                <div className="text-[11px] font-bold text-muted-foreground mt-2 flex items-center gap-1.5 uppercase tracking-tight">
                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                    {stat.sub}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </PageHeader>

            <div className="app-container">
                <DashboardShell initialRepoCount={data.stats.totalRepos} isAdmin={role === "ADMIN"}>
                    <Suspense>
                    <ReportsTabs
                        overview={<>
                            {/* Drift Velocity */}
                            <div className="col-span-12 lg:col-span-7">
                                <Card className="h-full rounded-card border-border bg-card shadow-card-hover flex flex-col border-l-8 border-l-primary overflow-hidden animate-entrance" style={{ animationDelay: '100ms' }}>
                                    <CardHeader className="border-b border-border pb-4 flex flex-row items-center justify-between bg-muted/50">
                                        <div className="flex flex-col">
                                            <CardTitle className="type-section-header">Drift Velocity</CardTitle>
                                            <p className="type-metadata text-muted-foreground mt-1">Cross-repository semantic decay over time</p>
                                        </div>
                                        <Badge className="rounded-md border-border bg-foreground text-background font-black px-3 py-1 tracking-[0.1em] uppercase text-[10px]">
                                            Trends
                                        </Badge>
                                    </CardHeader>
                                    <CardContent className="h-80 p-6 pt-8">
                                        <DriftVelocityChart data={data.velocityData} />
                                    </CardContent>
                                </Card>
                            </div>

                            {/* Vitality Index */}
                            <div className="col-span-12 lg:col-span-5">
                                <Card className="h-full rounded-card border-border bg-card shadow-card-hover flex flex-col border-l-8 border-l-primary overflow-hidden animate-entrance" style={{ animationDelay: '200ms' }}>
                                    <CardHeader className="border-b border-border pb-4 bg-muted/50">
                                        <CardTitle className="type-section-header">Vitality Index</CardTitle>
                                        <p className="type-metadata text-muted-foreground mt-1">Aggregated garden health score</p>
                                    </CardHeader>
                                    <CardContent className="flex flex-col items-center justify-center p-8 flex-1 gap-6">
                                        <HealthScoreWidget score={data.stats.avgDrift} />
                                        <div className="w-full grid grid-cols-2 gap-3">
                                            <div className="rounded-lg bg-muted/60 border border-border p-4 text-center">
                                                <div className="text-2xl font-black tracking-tighter text-primary">{data.stats.avgDrift}</div>
                                                <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mt-1">Avg Drift</div>
                                            </div>
                                            <div className="rounded-lg bg-muted/60 border border-border p-4 text-center">
                                                <div className={`text-2xl font-black tracking-tighter ${data.stats.criticalBlocks > 0 ? "text-broken" : "text-foreground"}`}>{data.stats.criticalBlocks}</div>
                                                <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mt-1">Critical</div>
                                            </div>
                                        </div>
                                        {isPro && (
                                            <Link href="/dashboard/reports?tab=repositories" className="w-full">
                                                <Button variant="outline" className="w-full h-9 text-[10px] font-black uppercase tracking-widest gap-1.5">
                                                    <TrendingUp className="h-3 w-3" />
                                                    View Risk Map
                                                </Button>
                                            </Link>
                                        )}
                                    </CardContent>
                                </Card>
                            </div>
                        </>}

                        repositories={<>
                            {/* Withering Zones */}
                            <div className="col-span-12 lg:col-span-5">
                                <Card className="h-full rounded-card border-border bg-card shadow-card-hover flex flex-col border-l-8 border-l-broken overflow-hidden animate-entrance" style={{ animationDelay: '100ms' }}>
                                    <CardHeader className="border-b border-border bg-muted/50">
                                        <CardTitle className="type-section-header">Withering Zones</CardTitle>
                                        <CardDescription className="type-body text-muted-foreground mt-1">Semantic Drift Hotspots</CardDescription>
                                    </CardHeader>
                                    <CardContent className="p-8 flex-1">
                                        <WitheringZones zones={data.witheringZones} />
                                    </CardContent>
                                    {(role === "ADMIN" || role === "VIEWER") && (
                                        <div className="p-8 pt-0">
                                            <Link href="/dashboard/inbox" className="w-full">
                                                <Button className="btn-premium w-full bg-primary text-primary-foreground font-black uppercase tracking-widest text-[11px] h-14 hover:bg-primary/90 shadow-xl shadow-primary/20">
                                                    <GitPullRequest className="w-5 h-5 mr-3" />
                                                    Review All Zones
                                                </Button>
                                            </Link>
                                        </div>
                                    )}
                                </Card>
                            </div>

                            {/* MAP-01: Documentation Risk Map — PRO+ only */}
                            {isPro ? (
                                <div className="col-span-12 lg:col-span-7" id="repositories">
                                    <Card className="h-full rounded-card border-border bg-card shadow-card-hover flex flex-col border-l-8 border-l-amber-500 overflow-hidden animate-entrance" style={{ animationDelay: '200ms' }}>
                                        <CardHeader className="border-b border-border pb-4 flex flex-row items-center justify-between bg-muted/50">
                                            <div className="flex flex-col">
                                                <CardTitle className="type-section-header">Documentation Risk Map</CardTitle>
                                                <p className="type-metadata text-muted-foreground mt-1">Per-repo risk scores derived from drift history, unresolved alerts, and policy violations</p>
                                            </div>
                                            <Badge className="rounded-md border-border bg-foreground text-background font-black px-3 py-1 tracking-[0.1em] uppercase text-[10px]">
                                                <TrendingUp className="w-3 h-3 mr-1.5 inline" />
                                                Risk Map
                                            </Badge>
                                        </CardHeader>
                                        <CardContent className="p-6 flex-1">
                                            <TopRiskZones />
                                        </CardContent>
                                    </Card>
                                </div>
                            ) : (
                                <div className="col-span-12 lg:col-span-7">
                                    <Card className="h-full rounded-card border-border bg-card shadow-card flex flex-col border-l-8 border-l-muted overflow-hidden animate-entrance" style={{ animationDelay: '200ms' }}>
                                        <CardHeader className="border-b border-border bg-muted/50">
                                            <CardTitle className="type-section-header">Documentation Risk Map</CardTitle>
                                            <CardDescription className="type-body text-muted-foreground mt-1">Per-repo risk scores and drift history</CardDescription>
                                        </CardHeader>
                                        <CardContent className="flex-1 flex flex-col items-center justify-center p-10 gap-6 text-center">
                                            <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-muted shrink-0">
                                                <Lock className="h-7 w-7 text-muted-foreground" />
                                            </div>
                                            <UpgradeContextCard
                                                title="Documentation Risk Map"
                                                description="Per-repo risk scores with timeline drilldown — see which repos are drifting fastest and which PRs contributed most."
                                                persona="Engineering managers and staff engineers tracking documentation health at scale"
                                                outcomes={[
                                                    "Identify the top 3 drifting repos before your quarterly planning cycle, not after",
                                                    "Correlate documentation debt spikes with specific PRs to coach teams proactively",
                                                ]}
                                                requiredPlan="PRO"
                                            />
                                        </CardContent>
                                    </Card>
                                </div>
                            )}
                        </>}

                        governance={<>
                            {/* Governance Proof Points — all plans */}
                            <div className="col-span-12">
                                <Card className="rounded-card border-border bg-card shadow-card-hover border-l-8 border-l-emerald-500 overflow-hidden animate-entrance" style={{ animationDelay: '100ms' }}>
                                    <CardHeader className="border-b border-border pb-4 flex flex-row items-center justify-between bg-muted/50">
                                        <div className="flex flex-col">
                                            <CardTitle className="type-section-header">Governance Proof Points</CardTitle>
                                            <p className="type-metadata text-muted-foreground mt-1">Evidence-ready metrics for compliance conversations — last 200 analyses</p>
                                        </div>
                                        <Badge className="rounded-md border-border bg-foreground text-background font-black px-3 py-1 tracking-[0.1em] uppercase text-[10px]">
                                            <TrendingUp className="w-3 h-3 mr-1.5 inline" />
                                            Evidence
                                        </Badge>
                                    </CardHeader>
                                    <CardContent className="p-6">
                                        {proofPoints.totalAnalyzed === 0 ? (
                                            <p className="text-sm text-muted-foreground italic text-center py-4">No completed analyses yet — metrics will appear once PRs are processed.</p>
                                        ) : (
                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                                                {[
                                                    {
                                                        label: "PRs With Drift Detected",
                                                        val: proofPoints.prsWithDriftPct !== null ? `${proofPoints.prsWithDriftPct}%` : "—",
                                                        sub: `${proofPoints.totalAnalyzed} analyses`,
                                                        dot: "bg-amber-500",
                                                        help: "Share of merged PRs that contained documentation drift",
                                                    },
                                                    {
                                                        label: "Avg Time to Triage",
                                                        val: proofPoints.avgTriageHours !== null ? `${proofPoints.avgTriageHours}h` : "—",
                                                        sub: "Accept or dismiss",
                                                        dot: "bg-blue-500",
                                                        help: "Average hours from drift detection to a triage decision",
                                                    },
                                                    {
                                                        label: "Critical Drift Dismissed",
                                                        val: proofPoints.criticalDismissedPct !== null ? `${proofPoints.criticalDismissedPct}%` : "—",
                                                        sub: "Of critical severity",
                                                        dot: proofPoints.criticalDismissedPct !== null && proofPoints.criticalDismissedPct > 30 ? "bg-rose-500" : "bg-emerald-500",
                                                        help: "Critical-severity alerts that were dismissed rather than fixed — lower is better",
                                                    },
                                                    // FIX-01: auto-fix success rate
                                                    {
                                                        label: "Auto-Fix Success Rate",
                                                        val: proofPoints.autoFixSuccessRate !== null ? `${proofPoints.autoFixSuccessRate}%` : "—",
                                                        sub: proofPoints.totalFixPrs > 0 ? `${proofPoints.totalFixPrs} fix PRs` : "No fix PRs yet",
                                                        dot: proofPoints.autoFixSuccessRate !== null && proofPoints.autoFixSuccessRate >= 80 ? "bg-emerald-500" : "bg-amber-500",
                                                        help: "% of auto-generated fix PRs where the documentation recheck verification passed",
                                                    },
                                                    // EVID-01 AC-4: evidence coverage
                                                    {
                                                        label: "Evidence Coverage",
                                                        val: proofPoints.evidenceCoverage !== null ? `${proofPoints.evidenceCoverage}%` : "—",
                                                        sub: "PRs with triage decision",
                                                        dot: proofPoints.evidenceCoverage !== null && proofPoints.evidenceCoverage >= 80 ? "bg-emerald-500" : "bg-amber-500",
                                                        help: "% of analysed PRs where a triage decision (accept or dismiss) was recorded — measures governance completeness",
                                                    },
                                                    // FEED-01: false-positive rate (PRO+ only — requires developer feedback signal)
                                                    ...(isPro ? [{
                                                        label: "False-Positive Rate",
                                                        val: proofPoints.falsePositiveRate !== null ? `${proofPoints.falsePositiveRate}%` : "—",
                                                        sub: proofPoints.totalFeedback > 0 ? `${proofPoints.totalFeedback} feedback signals` : "No feedback yet",
                                                        dot: proofPoints.falsePositiveRate !== null && proofPoints.falsePositiveRate <= 15 ? "bg-emerald-500" : "bg-amber-500",
                                                        help: "% of analyses where a developer clicked 'false positive' in the PR comment — lower is better; drives accuracy improvements",
                                                    }] : []),
                                                ].map((stat, i) => (
                                                    <div key={i} className="rounded-lg bg-muted/50 border border-border p-5" title={stat.help}>
                                                        <span className="type-metadata font-black uppercase tracking-widest text-muted-foreground">{stat.label}</span>
                                                        <div className="text-4xl font-black tracking-tighter text-foreground mt-2">{stat.val}</div>
                                                        <div className="text-[11px] font-bold text-muted-foreground mt-2 flex items-center gap-1.5 uppercase tracking-tight">
                                                            <div className={`w-1.5 h-1.5 rounded-full ${stat.dot}`} />
                                                            {stat.sub}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            </div>

                            {/* Ignore analytics — PRO+ */}
                            {isPro && ignoreData ? (<>
                                <div className="col-span-12">
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                                        {[
                                            { label: "Total Ignored",   val: ignoreData.kpis.totalIgnored,              sub: "Last 30 days" },
                                            { label: "Ignore Rate",     val: `${ignoreData.kpis.ignoreRate}%`,           sub: "vs accepted" },
                                            { label: "Reason Captured", val: `${ignoreData.kpis.reasonCaptureRate}%`,    sub: "Quality signal" },
                                        ].map((stat, i) => (
                                            <div key={i} className="rounded-card bg-card border border-border p-6 shadow-card transition-all hover:shadow-card-hover animate-entrance" style={{ animationDelay: `${(i + 2) * 100}ms` }}>
                                                <span className="type-metadata font-black uppercase tracking-widest text-muted-foreground">{stat.label}</span>
                                                <div className="text-4xl font-black tracking-tighter text-foreground mt-2">{stat.val}</div>
                                                <div className="text-[11px] font-bold text-muted-foreground mt-2 flex items-center gap-1.5 uppercase tracking-tight">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                                                    {stat.sub}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Ignore Trend chart */}
                                <div className="col-span-12 lg:col-span-7">
                                    <Card className="h-full rounded-card border-border bg-card shadow-card-hover flex flex-col border-l-8 border-l-broken overflow-hidden animate-entrance" style={{ animationDelay: '500ms' }}>
                                        <CardHeader className="border-b border-border pb-4 flex flex-row items-center justify-between bg-muted/50">
                                            <div className="flex flex-col">
                                                <CardTitle className="type-section-header">Ignore Trend</CardTitle>
                                                <p className="type-metadata text-muted-foreground mt-1">Ignored vs accepted decisions — last 30 days</p>
                                            </div>
                                            <Badge className="rounded-md border-border bg-foreground text-background font-black px-3 py-1 tracking-[0.1em] uppercase text-[10px]">
                                                Analytics
                                            </Badge>
                                        </CardHeader>
                                        <CardContent className="h-80 p-6 pt-8">
                                            <IgnoreTrendChart data={ignoreData.trend} />
                                        </CardContent>
                                    </Card>
                                </div>

                                {/* Dismiss Signals */}
                                <div className="col-span-12 lg:col-span-5">
                                    <Card className="h-full rounded-card border-border bg-card shadow-card-hover flex flex-col border-l-8 border-l-broken overflow-hidden animate-entrance" style={{ animationDelay: '600ms' }}>
                                        <CardHeader className="border-b border-border bg-muted/50">
                                            <CardTitle className="type-section-header">Dismiss Signals</CardTitle>
                                            <p className="type-metadata text-muted-foreground mt-1">Risk profile of silenced alerts</p>
                                        </CardHeader>
                                        <CardContent className="p-8 flex-1 flex flex-col gap-8 overflow-y-auto">
                                            <div>
                                                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-4">Dismiss Rate by Severity</p>
                                                {ignoreData.dismissRatesBySeverity.length === 0 ? (
                                                    <p className="text-sm text-muted-foreground italic">No triage decisions yet.</p>
                                                ) : (
                                                    <div className="space-y-3">
                                                        {ignoreData.dismissRatesBySeverity.map(({ severity, ignored, accepted, dismissRate }) => {
                                                            const cfg = SEVERITY_CONFIG[normaliseSeverity(severity)]
                                                            return (
                                                                <div key={severity} className="flex flex-col gap-1">
                                                                    <div className="flex items-center justify-between">
                                                                        <div className="flex items-center gap-2">
                                                                            <div className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                                                                            <span className="text-xs font-black uppercase tracking-tight text-foreground">{cfg.label}</span>
                                                                        </div>
                                                                        <span className="text-xs font-black text-muted-foreground tabular-nums">{dismissRate}% ignored</span>
                                                                    </div>
                                                                    <div className="h-1.5 rounded-full bg-muted overflow-hidden ml-4">
                                                                        <div
                                                                            className={`h-full rounded-full ${cfg.dot.replace("bg-", "bg-")}`}
                                                                            style={{ width: `${dismissRate}%`, opacity: 0.7 }}
                                                                        />
                                                                    </div>
                                                                    <span className="text-[10px] text-muted-foreground ml-4">{ignored} ignored · {accepted} accepted</span>
                                                                </div>
                                                            )
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-4">Top Dismiss Reasons</p>
                                                {ignoreData.topReasons.length === 0 ? (
                                                    <p className="text-sm text-muted-foreground italic">No reasons captured yet.</p>
                                                ) : (
                                                    <div className="space-y-3">
                                                        {ignoreData.topReasons.map(({ reason, count }) => (
                                                            <div key={reason} className="flex items-start gap-3">
                                                                <div className="w-1.5 h-1.5 rounded-full bg-rose-500 mt-1.5 shrink-0" />
                                                                <p className="flex-1 min-w-0 text-xs font-bold text-foreground truncate" title={reason}>{reason}</p>
                                                                <span className="text-xs font-black text-muted-foreground tabular-nums shrink-0">{count}×</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </CardContent>
                                    </Card>
                                </div>
                            </>) : (
                                <div className="col-span-12">
                                    <Card className="rounded-card border-border bg-card shadow-card border-l-8 border-l-muted overflow-hidden">
                                        <CardContent className="p-10 flex flex-col sm:flex-row items-center gap-8">
                                            <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-muted shrink-0">
                                                <Lock className="h-7 w-7 text-muted-foreground" />
                                            </div>
                                            <div className="flex-1">
                                                <UpgradeContextCard
                                                    title="Ignore-Rate Analytics & Drift Digest"
                                                    description="Track how often teams dismiss drift alerts, see dismiss trends over time, and get a nightly digest delivered to your GitHub Issues."
                                                    persona="Team leads who want signal on whether documentation debt is improving week-over-week"
                                                    outcomes={[
                                                        "Spot teams that habitually dismiss alerts before it becomes a culture problem",
                                                        "Get a daily drift health summary in GitHub Issues without opening the DocuGardener dashboard",
                                                    ]}
                                                    requiredPlan="PRO"
                                                />
                                            </div>
                                        </CardContent>
                                    </Card>
                                </div>
                            )}
                        </>}
                    />
                    </Suspense>
                </DashboardShell>

                <footer className="mt-28 py-16 border-t font-black flex flex-col md:flex-row justify-between items-center gap-8 opacity-40">
                    <div className="flex items-center gap-4">
                        <div className="h-8 w-8 bg-foreground rounded-lg flex items-center justify-center shadow-lg">
                            <span className="text-white text-[11px] font-black">DG</span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[10px] font-black tracking-[0.2em] uppercase text-foreground">DocuGardener // Kernel v0.1</span>
                            <span className="text-[9px] font-bold text-muted-foreground">© 2026 SEMANTIC SYSTEMS INTL.</span>
                        </div>
                    </div>
                </footer>

            </div>
        </div>
    )
}
