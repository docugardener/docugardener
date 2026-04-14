"use client"

import { useState, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import { Activity, GitBranch, ShieldCheck } from "lucide-react"

const TABS = [
    { id: "overview",      label: "Overview",      icon: Activity     },
    { id: "repositories",  label: "Repositories",  icon: GitBranch    },
    { id: "governance",    label: "Governance",    icon: ShieldCheck  },
] as const

type TabId = (typeof TABS)[number]["id"]
const TAB_IDS = TABS.map((t) => t.id) as string[]

interface ReportsTabsProps {
    overview:     React.ReactNode
    repositories: React.ReactNode
    governance:   React.ReactNode
}

export function ReportsTabs({ overview, repositories, governance }: ReportsTabsProps) {
    const searchParams = useSearchParams()
    const tabParam = searchParams.get("tab")
    const [active, setActive] = useState<TabId>(
        TAB_IDS.includes(tabParam ?? "") ? (tabParam as TabId) : "overview"
    )

    useEffect(() => {
        if (tabParam && TAB_IDS.includes(tabParam)) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setActive(tabParam as TabId)
        }
    }, [tabParam])

    const content: Record<TabId, React.ReactNode> = { overview, repositories, governance }

    return (
        <div>
            {/* Tab bar */}
            <div className="flex gap-1 border-b border-border mb-10 overflow-x-auto">
                {TABS.map(({ id, label, icon: Icon }) => (
                    <button
                        key={id}
                        onClick={() => setActive(id)}
                        className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors -mb-px ${
                            active === id
                                ? "border-primary text-foreground"
                                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                        }`}
                    >
                        <Icon className="h-4 w-4" />
                        {label}
                    </button>
                ))}
            </div>

            {/* Tab panel */}
            <div className="grid grid-cols-12 gap-10 animate-in fade-in slide-in-from-bottom-2 duration-300" key={active}>
                {content[active]}
            </div>
        </div>
    )
}
