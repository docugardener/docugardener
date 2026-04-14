// SPDX-License-Identifier: AGPL-3.0-or-later
"use client"

/**
 * MAP-01: Top Risk Zones — Documentation Coverage & Risk Map
 * Interactive, filterable per-repo risk table. PRO+ only.
 */
import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { AlertTriangle, TrendingUp, FileWarning, ChevronDown, ChevronUp, ExternalLink, Shield } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { RiskZone } from "@/app/api/reports/risk-zones/route"

const TIME_RANGES = [
    { value: "7d", label: "Last 7 days" },
    { value: "30d", label: "Last 30 days" },
    { value: "90d", label: "Last 90 days" },
]

const SEVERITY_STYLE: Record<string, { bar: string; badge: string; text: string; dot: string }> = {
    critical: { bar: "bg-rose-500", badge: "bg-rose-500/10 text-rose-500 border-rose-500/30", text: "text-rose-500", dot: "bg-rose-500" },
    high:     { bar: "bg-amber-500", badge: "bg-amber-500/10 text-amber-500 border-amber-500/30", text: "text-amber-500", dot: "bg-amber-500" },
    moderate: { bar: "bg-yellow-400", badge: "bg-yellow-400/10 text-yellow-500 border-yellow-400/30", text: "text-yellow-500", dot: "bg-yellow-400" },
    low:      { bar: "bg-emerald-500", badge: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30", text: "text-emerald-500", dot: "bg-emerald-500" },
}

function RiskBar({ score, severity }: { score: number; severity: string }) {
    const style = SEVERITY_STYLE[severity] ?? SEVERITY_STYLE.low
    return (
        <div className="flex items-center gap-2 min-w-[100px]">
            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                <div className={`h-full rounded-full transition-all ${style.bar}`} style={{ width: `${score}%` }} />
            </div>
            <span className={`text-xs font-black tabular-nums ${style.text}`}>{score}</span>
        </div>
    )
}

function ZoneRow({ zone }: { zone: RiskZone }) {
    const [expanded, setExpanded] = useState(false)
    const style = SEVERITY_STYLE[zone.severity] ?? SEVERITY_STYLE.low

    return (
        <>
            <tr
                className="border-b border-border hover:bg-muted/30 cursor-pointer transition-colors"
                onClick={() => setExpanded((v) => !v)}
            >
                <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${style.dot}`} />
                        <span className="text-sm font-bold text-foreground truncate max-w-[180px]" title={zone.repoName}>
                            {zone.repoName}
                        </span>
                    </div>
                </td>
                <td className="py-3 px-4">
                    <RiskBar score={zone.riskScore} severity={zone.severity} />
                </td>
                <td className="py-3 px-4">
                    <Badge className={`text-[10px] font-black uppercase tracking-wider border ${style.badge}`}>
                        {zone.severity}
                    </Badge>
                </td>
                <td className="py-3 px-4 text-center">
                    <span className={`text-sm font-black tabular-nums ${zone.unresolvedCount > 0 ? "text-amber-500" : "text-muted-foreground"}`}>
                        {zone.unresolvedCount}
                    </span>
                </td>
                <td className="py-3 px-4 text-center">
                    {zone.policyViolationCount > 0 ? (
                        <span className="flex items-center justify-center gap-1 text-xs font-black text-rose-500">
                            <Shield className="h-3 w-3" />
                            {zone.policyViolationCount}
                        </span>
                    ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                    )}
                </td>
                <td className="py-3 px-4">
                    <div className="flex items-center justify-end gap-2">
                        <Link
                            href={`/dashboard/inbox?repo=${encodeURIComponent(zone.repoName)}`}
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-primary hover:underline"
                        >
                            Review <ExternalLink className="h-2.5 w-2.5" />
                        </Link>
                        {expanded ? (
                            <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                        ) : (
                            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                    </div>
                </td>
            </tr>

            {expanded && (
                <tr className="border-b border-border bg-muted/20">
                    <td colSpan={6} className="px-6 py-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                            {/* Recent drift events */}
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3">
                                    Recent Drift Events
                                </p>
                                {zone.recentEvents.length === 0 ? (
                                    <p className="text-xs text-muted-foreground italic">None</p>
                                ) : (
                                    <div className="space-y-1.5">
                                        {zone.recentEvents.map((ev, i) => {
                                            const s = SEVERITY_STYLE[ev.severity.toLowerCase()] ?? SEVERITY_STYLE.low
                                            return (
                                                <div key={i} className="flex items-center gap-2 text-xs">
                                                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.dot}`} />
                                                    <span className="text-muted-foreground">
                                                        PR #{ev.prNumber} —{" "}
                                                        <span className={`font-bold ${s.text}`}>{ev.severity}</span>
                                                    </span>
                                                    <span className="text-muted-foreground/60 ml-auto">
                                                        {new Date(ev.createdAt).toLocaleDateString()}
                                                    </span>
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Top affected paths */}
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3">
                                    Owning Paths
                                </p>
                                {zone.topPaths.length === 0 ? (
                                    <p className="text-xs text-muted-foreground italic">No path data</p>
                                ) : (
                                    <div className="space-y-1.5">
                                        {zone.topPaths.map((path) => (
                                            <div key={path} className="flex items-center gap-2">
                                                <FileWarning className="h-3 w-3 text-muted-foreground shrink-0" />
                                                <span className="text-xs font-mono text-foreground truncate" title={path}>
                                                    {path}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </td>
                </tr>
            )}
        </>
    )
}

export function TopRiskZones() {
    const [timeRange, setTimeRange] = useState("30d")
    const [repoFilter, setRepoFilter] = useState("")
    const [docTypeFilter, setDocTypeFilter] = useState("")
    const [zones, setZones] = useState<RiskZone[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const fetchZones = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const params = new URLSearchParams({ timeRange })
            if (repoFilter) params.set("repo", repoFilter)
            if (docTypeFilter) params.set("docType", docTypeFilter)
            const res = await fetch(`/api/reports/risk-zones?${params}`)
            if (!res.ok) throw new Error(await res.text())
            const data = await res.json()
            setZones(data.zones ?? [])
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load risk zones")
        } finally {
            setLoading(false)
        }
    }, [timeRange, repoFilter, docTypeFilter])

    useEffect(() => { fetchZones() }, [fetchZones])

    const criticalCount = zones.filter((z) => z.severity === "critical").length
    const highCount = zones.filter((z) => z.severity === "high").length

    return (
        <div className="flex flex-col gap-4">
            {/* Header + summary badges */}
            <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 mr-auto">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    <span className="text-sm font-black uppercase tracking-wider text-foreground">Top Risk Zones</span>
                </div>
                {criticalCount > 0 && (
                    <Badge className="bg-rose-500/10 text-rose-500 border border-rose-500/30 text-[10px] font-black uppercase tracking-wider">
                        {criticalCount} Critical
                    </Badge>
                )}
                {highCount > 0 && (
                    <Badge className="bg-amber-500/10 text-amber-500 border border-amber-500/30 text-[10px] font-black uppercase tracking-wider">
                        {highCount} High
                    </Badge>
                )}
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-3">
                <select
                    value={timeRange}
                    onChange={(e) => setTimeRange(e.target.value)}
                    className="h-8 rounded-md border border-border bg-muted px-3 text-xs font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    aria-label="Time range"
                >
                    {TIME_RANGES.map((r) => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                </select>
                <input
                    type="text"
                    placeholder="Filter by repo…"
                    value={repoFilter}
                    onChange={(e) => setRepoFilter(e.target.value)}
                    className="h-8 rounded-md border border-border bg-muted px-3 text-xs font-bold text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary w-40"
                    aria-label="Repo filter"
                />
                <input
                    type="text"
                    placeholder="Doc path prefix…"
                    value={docTypeFilter}
                    onChange={(e) => setDocTypeFilter(e.target.value)}
                    className="h-8 rounded-md border border-border bg-muted px-3 text-xs font-bold text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary w-40"
                    aria-label="Doc type filter"
                />
                <Button
                    variant="outline"
                    size="sm"
                    onClick={fetchZones}
                    className="h-8 px-4 text-xs font-black uppercase tracking-wider"
                >
                    <TrendingUp className="h-3 w-3 mr-1.5" />
                    Apply
                </Button>
            </div>

            {/* Table */}
            {loading ? (
                <div className="py-12 text-center text-sm text-muted-foreground animate-pulse">Loading risk zones…</div>
            ) : error ? (
                <div className="py-8 text-center text-sm text-rose-500">{error}</div>
            ) : zones.length === 0 ? (
                <div className="py-12 text-center">
                    <p className="text-sm text-muted-foreground">No risk zones found for the selected filters.</p>
                    <p className="text-xs text-muted-foreground mt-1">Drift events will appear here once PRs are analyzed.</p>
                </div>
            ) : (
                <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-sm" data-testid="risk-zones-table">
                        <thead>
                            <tr className="border-b border-border bg-muted/50">
                                <th className="py-2.5 px-4 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">Repository</th>
                                <th className="py-2.5 px-4 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">Risk Score</th>
                                <th className="py-2.5 px-4 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">Level</th>
                                <th className="py-2.5 px-4 text-center text-[10px] font-black uppercase tracking-widest text-muted-foreground">Unresolved</th>
                                <th className="py-2.5 px-4 text-center text-[10px] font-black uppercase tracking-widest text-muted-foreground">Policy</th>
                                <th className="py-2.5 px-4" />
                            </tr>
                        </thead>
                        <tbody>
                            {zones.map((zone) => (
                                <ZoneRow key={zone.repoId} zone={zone} />
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}
