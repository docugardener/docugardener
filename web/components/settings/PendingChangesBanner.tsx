"use client"

/**
 * DG-LPP-04: Pending license changes notification banner.
 *
 * Shown in the Intelligence tab of Settings when PlatformCloud has
 * queued plan changes (e.g. upcoming downgrade, quota reduction).
 * Only visible in client-installed mode (SaaS returns []).
 */

import { useEffect, useState } from "react"
import { AlertTriangle, Clock, X } from "lucide-react"

interface PendingChange {
    type: string
    effective_at: string | null
    detail: string
}

function formatEffectiveAt(iso: string | null): string {
    if (!iso) return "at next renewal"
    try {
        return new Date(iso).toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
        })
    } catch {
        return iso
    }
}

function formatChangeType(type: string): string {
    return type
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase())
}

export function PendingChangesBanner() {
    const [changes, setChanges] = useState<PendingChange[]>([])
    const [dismissed, setDismissed] = useState(false)

    useEffect(() => {
        fetch("/api/billing/pending-changes")
            .then((r) => r.json())
            .then((data) => {
                if (Array.isArray(data?.pending_changes)) {
                    setChanges(data.pending_changes)
                }
            })
            .catch(() => {/* network failure — hide banner */})
    }, [])

    if (dismissed || changes.length === 0) return null

    return (
        <div className="rounded-card border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 p-4 flex gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-amber-900 dark:text-amber-200 mb-1">
                    Upcoming license changes
                </p>
                <ul className="space-y-1">
                    {changes.map((c, i) => (
                        <li key={i} className="text-sm text-amber-800 dark:text-amber-300 flex items-start gap-2">
                            <Clock className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-500" />
                            <span>
                                <span className="font-medium">{formatChangeType(c.type)}</span>
                                {" — "}
                                {c.detail}
                                {c.effective_at && (
                                    <span className="text-amber-600 dark:text-amber-400 ml-1">
                                        (effective {formatEffectiveAt(c.effective_at)})
                                    </span>
                                )}
                            </span>
                        </li>
                    ))}
                </ul>
            </div>
            <button
                onClick={() => setDismissed(true)}
                className="shrink-0 text-amber-500 hover:text-amber-700 dark:hover:text-amber-300"
                aria-label="Dismiss"
            >
                <X className="h-4 w-4" />
            </button>
        </div>
    )
}
