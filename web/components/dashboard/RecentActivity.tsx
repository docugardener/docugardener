// SPDX-License-Identifier: AGPL-3.0-or-later
"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"

interface ActivityItem {
    id: string
    repo: string
    pr: number
    status: string
    drift: number
    date: Date
}

export function RecentActivity({ activity }: { activity: ActivityItem[] }) {
    const [isMounted, setIsMounted] = useState(false)

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setIsMounted(true)
    }, [])

    if (!activity?.length) {
        return (
            <div className="p-12 text-center text-muted-foreground">
                <p className="text-sm font-medium italic">Scanning for recent garden growth...</p>
            </div>
        )
    }

    return (
        <div className="w-full h-full">
            <CardHeader className="px-0 pt-0 pb-6">
                <CardTitle className="type-table-header">Recent Growth</CardTitle>
                <CardDescription className="type-body text-muted-foreground">
                    Latest semantic analysis across your garden.
                </CardDescription>
            </CardHeader>
            <CardContent className="px-0">
                <div className="space-y-1">
                    {activity.map((item) => (
                        <Link
                            key={item.id}
                            href={`/dashboard/jobs/${item.id}`}
                            className="flex items-center p-4 rounded-xl hover:bg-muted/50 transition-all cursor-pointer group border border-transparent hover:border-border"
                        >
                            {/* PR number chip — JetBrains Mono */}
                            <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center mr-4 group-hover:bg-accent border border-transparent group-hover:border-border transition-colors">
                                <span className="type-mono text-muted-foreground">#{item.pr}</span>
                            </div>
                            <div className="flex-1 space-y-0.5">
                                <p className="text-sm font-black text-foreground leading-none">
                                    {item.repo}
                                </p>
                                <p className="type-metadata" suppressHydrationWarning>
                                    {isMounted ? new Date(item.date).toLocaleDateString() : '...'}{' // Drift: '}{item.drift}%
                                </p>
                            </div>
                            <div className="ml-4 font-medium">
                                <StatusBadge status={item.status} score={item.drift} />
                            </div>
                        </Link>
                    ))}
                </div>
            </CardContent>
        </div>
    )
}

function StatusBadge({ status, score }: { status: string, score: number }) {
    const base = "font-black text-[10px] uppercase tracking-tighter"

    if (status === "PROCESSING") {
        return <Badge variant="outline" className={`${base} animate-pulse bg-indigo-500/10 text-indigo-400 border-indigo-500/30`}>Growing</Badge>
    }
    if (status === "FAILED") {
        return <Badge className={`${base} bg-status-broken text-white border-transparent`}>Error</Badge>
    }
    if (score > 80) return <Badge className={`${base} bg-status-broken border border-status-broken/30 text-white`}>Blocked</Badge>
    if (score > 60) return <Badge className={`${base} bg-status-withered border border-status-withered/30 text-zinc-900`}>Warning</Badge>
    return <Badge className={`${base} bg-status-fresh border border-status-fresh/30 text-zinc-900`}>Healthy</Badge>
}
