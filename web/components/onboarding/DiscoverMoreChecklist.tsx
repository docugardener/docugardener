"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Sparkles, X } from "lucide-react"

interface DiscoverMoreChecklistProps {
  tenantId: string
}

const DISMISSED_KEY = (id: string) => `dg-discover-more-dismissed-${id}`

const ITEMS = [
  { label: "Invite teammates", href: "/dashboard/settings?tab=team" },
  { label: "Connect Slack alerts", href: "/dashboard/settings?tab=integrations" },
  { label: "Configure LLM provider", href: "/dashboard/settings?tab=intelligence" },
  { label: "Explore documentation policies", href: "/dashboard/settings?tab=agent" },
]

export function DiscoverMoreChecklist({ tenantId }: DiscoverMoreChecklistProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (localStorage.getItem(DISMISSED_KEY(tenantId)) === "true") return
    setVisible(true)
  }, [tenantId])

  if (!visible) return null

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY(tenantId), "true")
    setVisible(false)
  }

  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 mb-4 flex items-center gap-3 flex-wrap">
      <div className="flex items-center gap-1.5 shrink-0">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-bold uppercase tracking-widest text-foreground">
          Discover
        </span>
      </div>
      <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
        {ITEMS.map((item, i) => (
          <span key={item.href} className="flex items-center gap-2">
            {i > 0 && <span className="text-border select-none">·</span>}
            <Link
              href={item.href}
              className="text-xs text-muted-foreground hover:text-foreground hover:underline transition-colors whitespace-nowrap"
            >
              {item.label}
            </Link>
          </span>
        ))}
      </div>
      <button
        onClick={handleDismiss}
        aria-label="Dismiss discover more"
        className="h-5 w-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors shrink-0"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}
