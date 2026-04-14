"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"
import { CheckCircle2, Circle, X, Rocket } from "lucide-react"
import { cn } from "@/lib/utils"

interface OnboardingStatus {
    githubConnected: boolean
    hasFirstJob: boolean
    hasLlmConfig: boolean
}

interface Step {
    label: string
    description: string
    done: boolean
    href?: string
    linkLabel?: string
}

interface GettingStartedBannerProps {
    tenantId: string
}

const DISMISSED_KEY = (tenantId: string) => `dg_onboarding_dismissed_${tenantId}`

export function GettingStartedBanner({ tenantId }: GettingStartedBannerProps) {
    const [status, setStatus] = useState<OnboardingStatus | null>(null)
    const [dismissed, setDismissed] = useState(false)
    const [mounted, setMounted] = useState(false)

    // Read localStorage only after mount to avoid SSR mismatch
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setMounted(true)

        if (localStorage.getItem(DISMISSED_KEY(tenantId)) === "true") {
            setDismissed(true)
            return
        }
        fetch("/api/onboarding/status")
            .then(r => r.ok ? r.json() : null)
            .then(data => { if (data) setStatus(data) })
            .catch(() => {/* fail silently — banner is non-critical */ })
    }, [tenantId])

    const handleDismiss = () => {
        localStorage.setItem(DISMISSED_KEY(tenantId), "true")
        setDismissed(true)
    }

    // Don't render until after hydration
    if (!mounted || dismissed || status === null) return null

    // Auto-hide once everything is complete
    const allDone = status.githubConnected && status.hasFirstJob && status.hasLlmConfig
    if (allDone) return null

    const steps: Step[] = [
        {
            label: "Connect GitHub App",
            description: "Your GitHub App is installed and ready.",
            done: status.githubConnected,
        },
        {
            label: "Open your first Pull Request",
            description: "Push a PR to a connected repo to trigger the first scan.",
            done: status.hasFirstJob,
        },
        {
            label: "Add your own LLM key",
            description: "Optional — using the bundled free-tier key until you add yours.",
            done: status.hasLlmConfig,
            href: "/dashboard/settings",
            linkLabel: "Go to Settings",
        },
    ]

    const completedCount = steps.filter(s => s.done).length

    return (
        <AnimatePresence>
            <motion.div
                key="onboarding-banner"
                initial={{ opacity: 0, y: -12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="mb-6 rounded-xl border border-primary/20 bg-primary/5 px-5 py-4 relative"
            >
                {/* Header row */}
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <Rocket className="h-4 w-4 text-primary" />
                        <span className="text-sm font-black text-foreground uppercase tracking-widest">
                            Getting Started
                        </span>
                        <span className="text-xs font-bold text-muted-foreground">
                            {completedCount}/{steps.length} complete
                        </span>
                    </div>
                    <button
                        onClick={handleDismiss}
                        aria-label="Dismiss getting started banner"
                        className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                    >
                        <X className="h-3.5 w-3.5" />
                    </button>
                </div>

                {/* Progress bar */}
                <div className="h-1 rounded-full bg-border mb-4 overflow-hidden">
                    <motion.div
                        className="h-full rounded-full bg-primary"
                        initial={{ width: 0 }}
                        animate={{ width: `${(completedCount / steps.length) * 100}%` }}
                        transition={{ duration: 0.4, ease: "easeOut" }}
                    />
                </div>

                {/* Steps */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {steps.map((step, i) => (
                        <div
                            key={i}
                            className={cn(
                                "flex items-start gap-3 rounded-lg px-3 py-2.5 border transition-colors",
                                step.done
                                    ? "border-primary/20 bg-primary/10"
                                    : "border-border bg-card/50"
                            )}
                        >
                            <div className="mt-0.5 shrink-0">
                                {step.done ? (
                                    <CheckCircle2 className="h-4 w-4 text-primary" />
                                ) : (
                                    <Circle className="h-4 w-4 text-muted-foreground/40" />
                                )}
                            </div>
                            <div className="min-w-0">
                                <p className={cn(
                                    "text-xs font-black leading-tight",
                                    step.done ? "text-primary" : "text-foreground"
                                )}>
                                    {step.label}
                                </p>
                                <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                                    {step.description}
                                </p>
                                {!step.done && step.href && (
                                    <Link
                                        href={step.href}
                                        className="text-[11px] font-black text-primary hover:underline mt-1 inline-block"
                                    >
                                        {step.linkLabel} →
                                    </Link>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </motion.div>
        </AnimatePresence>
    )
}
