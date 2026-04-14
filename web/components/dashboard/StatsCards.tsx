// SPDX-License-Identifier: AGPL-3.0-or-later
"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Activity, ShieldAlert, GitPullRequest } from "lucide-react"

interface StatsCardsProps {
    stats: {
        totalRepos: number
        totalJobs24h: number
        activeJobs: number
        avgDrift: number
        criticalBlocks: number
    }
}

export function StatsCards({ stats }: StatsCardsProps) {
    return (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">
                        Avg. Drift Score
                    </CardTitle>
                    <Activity className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{stats.avgDrift}%</div>
                    <p className="text-xs text-muted-foreground">
                        {stats.avgDrift > 0 ? "Across all repos" : "No data yet"}
                    </p>
                    <div className="mt-2 h-2 w-full bg-secondary rounded-full overflow-hidden">
                        <div
                            className="h-full bg-primary transition-all"
                            style={{ width: `${stats.avgDrift}%`, backgroundColor: stats.avgDrift > 20 ? '#f43f5e' : '#10b981' }}
                        />
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">
                        PRs Scanned
                    </CardTitle>
                    <GitPullRequest className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{stats.totalJobs24h}</div>
                    <p className="text-xs text-muted-foreground">
                        {stats.totalJobs24h > 0 ? "Last 24 hours" : "No scans yet"}
                    </p>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">
                        Critical Blocks
                    </CardTitle>
                    <ShieldAlert className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold text-red-600">{stats.criticalBlocks}</div>
                    <p className="text-xs text-muted-foreground">
                        {stats.criticalBlocks > 0 ? "Action required immediately" : "All clear"}
                    </p>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">
                        Active Jobs
                    </CardTitle>
                    <Activity className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{stats.activeJobs}</div>
                    <p className="text-xs text-muted-foreground">
                        Currently processing
                    </p>
                </CardContent>
            </Card>
        </div>
    )
}
