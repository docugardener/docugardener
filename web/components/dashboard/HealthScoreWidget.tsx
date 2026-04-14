"use client"

import { motion } from "framer-motion"

interface HealthScoreWidgetProps {
    score: number
}

export function HealthScoreWidget({ score }: HealthScoreWidgetProps) {
    // Health is 100 - drift score
    const health = 100 - score
    // Primary Indigo color, use Rose for critical failure
    const color = health > 30 ? "#4f46e5" : "#f43f5e"
    const circumference = 2 * Math.PI * 40 // Smaller radius

    return (
        <div className="flex flex-col items-center justify-center space-y-6">
            <div className="relative w-48 h-48">
                <svg className="w-full h-full transform -rotate-90">
                    {/* Background Track */}
                    <circle
                        cx="96"
                        cy="96"
                        r="40"
                        fill="transparent"
                        stroke="var(--muted)"
                        strokeWidth="12"
                    />
                    {/* Animated Progress */}
                    <motion.circle
                        cx="96"
                        cy="96"
                        r="40"
                        fill="transparent"
                        stroke={color}
                        strokeWidth="12"
                        strokeDasharray={circumference}
                        initial={{ strokeDashoffset: circumference }}
                        animate={{ strokeDashoffset: circumference - (health / 100) * circumference }}
                        transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
                        strokeLinecap="round"
                    />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-4xl font-[900] tracking-tighter text-foreground">
                        {health}%
                    </span>
                    <span className="text-[9px] font-black uppercase text-muted-foreground tracking-[0.2em] mt-1">
                        Vitality
                    </span>
                </div>
            </div>

            <div className="max-w-[180px] text-center space-y-1">
                <div className="text-sm font-bold text-foreground">
                    {health > 80 ? "Garden thriving" : health > 50 ? "Doc maintenance needed" : "Critical Overgrowth"}
                </div>
                <p className="text-[11px] font-medium text-muted-foreground leading-relaxed">
                    Based on semantic coverage across {health > 80 ? "all" : "critical"} repositories.
                </p>
            </div>
        </div>
    )
}
