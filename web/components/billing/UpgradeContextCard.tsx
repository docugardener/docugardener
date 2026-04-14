// SPDX-License-Identifier: AGPL-3.0-or-later
"use client"

import Link from "next/link"
import { Zap } from "lucide-react"
import { Button } from "@/components/ui/button"

interface UpgradeContextCardProps {
  title: string
  description: string
  persona: string
  outcomes: [string, string]
  requiredPlan: "PRO" | "TEAM"
  ctaLabel?: string
}

export function UpgradeContextCard({
  title,
  description,
  persona,
  outcomes,
  requiredPlan,
  ctaLabel,
}: UpgradeContextCardProps) {
  const planLabel = requiredPlan === "PRO" ? "Pro" : "Team"
  const defaultCta = `Upgrade to ${planLabel}`

  return (
    <div
      role="region"
      aria-label={`Upgrade required: ${title}`}
      className="rounded-xl border border-primary/20 bg-primary/5 px-5 py-4 space-y-3"
    >
      <div className="flex items-start gap-3">
        <Zap className="h-4 w-4 text-primary mt-0.5 shrink-0" />
        <div className="space-y-1 min-w-0">
          <p className="text-sm font-black text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>

      <div className="pl-7 space-y-1.5">
        <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">
          Best for:{" "}
          <span className="normal-case font-normal">{persona}</span>
        </p>
        <ul className="space-y-1">
          {outcomes.map((o, i) => (
            <li
              key={i}
              className="text-xs text-foreground flex items-start gap-1.5"
            >
              <span className="text-primary mt-0.5 shrink-0">✓</span>
              {o}
            </li>
          ))}
        </ul>
      </div>

      <div className="pl-7">
        <Button asChild size="sm" className="h-7 text-xs">
          <Link href="/dashboard/billing">{ctaLabel ?? defaultCta} →</Link>
        </Button>
        <p className="text-[11px] text-muted-foreground mt-1.5">
          Available on the{" "}
          <span className="font-semibold text-foreground">{planLabel}</span>{" "}
          plan and above.
        </p>
      </div>
    </div>
  )
}
