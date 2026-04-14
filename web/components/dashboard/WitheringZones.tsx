// SPDX-License-Identifier: AGPL-3.0-or-later
"use client"

import { Progress } from "@/components/ui/progress"
import { AlertTriangle, Droplets } from "lucide-react"

interface Zone {
    name: string
    avgDrift: number
    lastScan: string
}

interface WitheringZonesProps {
    zones: Zone[]
}

export function WitheringZones({ zones }: WitheringZonesProps) {
    return (
        <div className="space-y-8">
            {zones.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-zinc-300 italic">
                    <Droplets className="w-10 h-10 mb-2 opacity-20" />
                    <p className="text-sm font-medium text-muted-foreground">Your garden is fully hydrated.</p>
                </div>
            ) : (
                zones.map((zone) => (
                    <div key={zone.name} className="group relative space-y-3">
                        <div className="flex justify-between items-start">
                            <div className="space-y-1">
                                <h4 className="text-sm font-black text-foreground tracking-tight group-hover:text-primary transition-colors">
                                    {zone.name}
                                </h4>
                                <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">
                                    Last scan: {zone.lastScan}
                                </p>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                                <div className="flex items-center gap-1.5 text-[11px] font-black tracking-tighter">
                                    {zone.avgDrift > 70 && <AlertTriangle className="w-3.5 h-3.5 text-broken" />}
                                    <span className={zone.avgDrift > 70 ? "text-broken" : "text-primary"}>
                                        {zone.avgDrift}% Drift
                                    </span>
                                </div>
                            </div>
                        </div>
                        <Progress
                            value={zone.avgDrift}
                            className={`h-2 transition-all ${zone.avgDrift > 70 ? "bg-broken/20" : "bg-primary/20"}`}
                        />
                    </div>
                ))
            )}
        </div>
    )
}
