"use client"

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts"

interface DriftVelocityChartProps {
    data: { date: string; score: number }[]
}

export function DriftVelocityChart({ data }: DriftVelocityChartProps) {
    return (
        <div className="h-[400px] w-full">
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                        <linearGradient id="colorDrift" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="var(--status-fresh)" stopOpacity={0.15} />
                            <stop offset="95%" stopColor="var(--status-fresh)" stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                    <XAxis
                        dataKey="date"
                        hide
                    />
                    <YAxis
                        tick={{ fontSize: 10, fontWeight: 700, fill: 'var(--muted-foreground)' }}
                        axisLine={false}
                        tickLine={false}
                        domain={[0, 100]}
                    />
                    <Tooltip
                        content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                                return (
                                    <div className="bg-card border border-border p-3 rounded-xl shadow-xl">
                                        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">{payload[0].payload.date}</p>
                                        <div className="flex items-center gap-2">
                                            <div className="h-2 w-2 rounded-full bg-primary" />
                                            <p className="text-foreground font-black text-lg">{payload[0].value}% Drift</p>
                                        </div>
                                    </div>
                                )
                            }
                            return null
                        }}
                    />
                    <Area
                        type="monotone"
                        dataKey="score"
                        stroke="var(--status-fresh)"
                        strokeWidth={4}
                        fillOpacity={1}
                        fill="url(#colorDrift)"
                        animationDuration={1500}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    )
}
