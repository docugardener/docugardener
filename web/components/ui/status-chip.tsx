// SPDX-License-Identifier: AGPL-3.0-or-later
import * as React from "react"
import { cn } from "@/lib/utils"

export type StatusChipVariant = "fresh" | "withered" | "broken" | "primary" | "neutral"

interface StatusChipProps {
    variant: StatusChipVariant
    label: string
    dot?: boolean
    className?: string
}

const variantStyles: Record<StatusChipVariant, string> = {
    fresh:    "bg-[color-mix(in_srgb,var(--status-fresh)_12%,transparent)] border-[color-mix(in_srgb,var(--status-fresh)_35%,transparent)] text-[var(--status-fresh)]",
    withered: "bg-[color-mix(in_srgb,var(--status-withered)_12%,transparent)] border-[color-mix(in_srgb,var(--status-withered)_35%,transparent)] text-[var(--status-withered)]",
    broken:   "bg-[color-mix(in_srgb,var(--status-broken)_12%,transparent)] border-[color-mix(in_srgb,var(--status-broken)_35%,transparent)] text-[var(--status-broken)]",
    primary:  "bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] border-[color-mix(in_srgb,var(--primary)_35%,transparent)] text-[var(--primary)]",
    neutral:  "bg-[color-mix(in_srgb,var(--muted-foreground)_12%,transparent)] border-[color-mix(in_srgb,var(--muted-foreground)_35%,transparent)] text-muted-foreground",
}

const dotStyles: Record<StatusChipVariant, string> = {
    fresh:    "bg-[var(--status-fresh)]",
    withered: "bg-[var(--status-withered)]",
    broken:   "bg-[var(--status-broken)]",
    primary:  "bg-[var(--primary)]",
    neutral:  "bg-muted-foreground",
}

export function StatusChip({ variant, label, dot = true, className }: StatusChipProps) {
    return (
        <span
            role="status"
            aria-label={label}
            data-variant={variant}
            className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5",
                "text-[11px] font-semibold uppercase tracking-wide",
                variantStyles[variant],
                className
            )}
        >
            {dot && (
                <span
                    aria-hidden="true"
                    className={cn("inline-block h-1.5 w-1.5 rounded-full shrink-0", dotStyles[variant])}
                />
            )}
            {label}
        </span>
    )
}
