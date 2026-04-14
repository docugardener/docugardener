// SPDX-License-Identifier: AGPL-3.0-or-later
"use client"

import {
    Bar, BarChart, CartesianGrid, Legend,
    ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts"

export interface IgnoreTrendDataPoint {
    date: string
    ignored: number
    accepted: number
}

interface IgnoreTrendChartProps {
    data: IgnoreTrendDataPoint[]
}

export function IgnoreTrendChart({ data }: IgnoreTrendChartProps) {
    if (data.length === 0) {
        return (
            <div className="h-[320px] flex items-center justify-center text-muted-foreground">
                <p className="text-sm font-bold uppercase tracking-widest opacity-40">No triage decisions yet</p>
            </div>
        )
    }

    return (
        <div className="h-[320px] w-full">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                    <XAxis
                        dataKey="date"
                        tick={{ fontSize: 10, fontWeight: 700, fill: "var(--muted-foreground)" }}
                        axisLine={false}
                        tickLine={false}
                        interval="preserveStartEnd"
                    />
                    <YAxis
                        tick={{ fontSize: 10, fontWeight: 700, fill: "var(--muted-foreground)" }}
                        axisLine={false}
                        tickLine={false}
                        allowDecimals={false}
                    />
                    <Tooltip
                        content={({ active, payload }) => {
                            if (!active || !payload?.length) return null
                            return (
                                <div className="bg-card border border-border p-3 rounded-xl shadow-xl">
                                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2">
                                        {payload[0].payload.date}
                                    </p>
                                    {payload.map((p: any) => (
                                        <div key={p.dataKey} className="flex items-center gap-2 mb-1">
                                            <div className="h-2 w-2 rounded-full" style={{ background: p.fill }} />
                                            <p className="text-foreground font-black text-sm">
                                                {p.value} {p.name}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            )
                        }}
                    />
                    <Legend
                        wrapperStyle={{
                            fontSize: 10,
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.1em",
                            paddingTop: "12px",
                        }}
                    />
                    <Bar
                        dataKey="ignored"
                        name="Ignored"
                        fill="#f43f5e"
                        radius={[3, 3, 0, 0]}
                        animationDuration={1200}
                    />
                    <Bar
                        dataKey="accepted"
                        name="Accepted"
                        fill="var(--status-fresh, #6366f1)"
                        radius={[3, 3, 0, 0]}
                        animationDuration={1200}
                    />
                </BarChart>
            </ResponsiveContainer>
        </div>
    )
}
