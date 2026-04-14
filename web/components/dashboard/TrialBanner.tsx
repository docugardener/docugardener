"use client"

import { useEffect, useState } from "react"
import { Zap, Clock, AlertTriangle, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"

interface TrialStatus {
    isActive: boolean
    isExpired: boolean
    daysRemaining: number
    plan: string
}

export function TrialBanner() {
    const [trial, setTrial] = useState<TrialStatus | null>(null)
    const [dismissed, setDismissed] = useState(false)

    useEffect(() => {
        fetch("/api/billing/trial")
            .then(r => r.ok ? r.json() : null)
            .then(d => {
                if (d && (d.isActive || d.isExpired)) setTrial(d)
            })
            .catch(() => null)
    }, [])

    if (!trial || dismissed) return null

    if (trial.isActive) {
        const urgency = trial.daysRemaining <= 3
        return (
            <div className={`flex items-center justify-between px-4 py-2 text-xs font-semibold ${
                urgency
                    ? "bg-amber-500/15 border-b border-amber-500/30 text-amber-400"
                    : "bg-primary/10 border-b border-primary/20 text-primary"
            }`}>
                <div className="flex items-center gap-2">
                    {urgency
                        ? <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        : <Zap className="h-3.5 w-3.5 shrink-0" />
                    }
                    <span>
                        <span className="font-black uppercase tracking-wider">Pro Trial Active</span>
                        {" — "}
                        {trial.daysRemaining === 1
                            ? "1 day remaining."
                            : `${trial.daysRemaining} days remaining.`
                        }
                        {" "}Upgrade to keep private repos and Pro features.
                    </span>
                </div>
                <div className="flex items-center gap-3 ml-4 shrink-0">
                    <Button asChild size="sm" className="h-6 px-3 text-[10px] font-black uppercase tracking-widest">
                        <Link href="/dashboard/billing">Upgrade</Link>
                    </Button>
                    <button onClick={() => setDismissed(true)} className="opacity-60 hover:opacity-100 transition-opacity">
                        <X className="h-3.5 w-3.5" />
                    </button>
                </div>
            </div>
        )
    }

    // Trial expired
    if (trial.isExpired && trial.plan === "FREE") {
        return (
            <div className="flex items-center justify-between px-4 py-2 text-xs font-semibold bg-red-500/10 border-b border-red-500/20 text-red-400">
                <div className="flex items-center gap-2">
                    <Clock className="h-3.5 w-3.5 shrink-0" />
                    <span>
                        <span className="font-black uppercase tracking-wider">Pro Trial Expired</span>
                        {" — "}
                        Private repos and Pro features are no longer available. Upgrade to restore access.
                    </span>
                </div>
                <div className="flex items-center gap-3 ml-4 shrink-0">
                    <Button asChild size="sm" variant="destructive" className="h-6 px-3 text-[10px] font-black uppercase tracking-widest">
                        <Link href="/dashboard/billing">Upgrade Now</Link>
                    </Button>
                    <button onClick={() => setDismissed(true)} className="opacity-60 hover:opacity-100 transition-opacity">
                        <X className="h-3.5 w-3.5" />
                    </button>
                </div>
            </div>
        )
    }

    return null
}
