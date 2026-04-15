// SPDX-License-Identifier: AGPL-3.0-or-later
"use client"

import { useState, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import { Brain, Plug, GitBranch, Shield, Bot, CreditCard } from "lucide-react"

const TABS = [
    { id: "intelligence", label: "Intelligence", icon: Brain },
    { id: "integrations", label: "Integrations", icon: Plug },
    { id: "repositories", label: "Repositories", icon: GitBranch },
    { id: "security", label: "Security", icon: Shield },
    { id: "agent_rules", label: "Agent Governance", icon: Bot },
    { id: "license", label: "Subscription", icon: CreditCard },
] as const

type TabId = (typeof TABS)[number]["id"]

interface SettingsTabsProps {
    intelligence: React.ReactNode
    integrations: React.ReactNode
    repositories: React.ReactNode
    security: React.ReactNode
    agent_rules: React.ReactNode
    license: React.ReactNode
}

const TAB_IDS = TABS.map((t) => t.id) as string[]

export function SettingsTabs({ intelligence, integrations, repositories, security, agent_rules, license }: SettingsTabsProps) {
    const searchParams = useSearchParams()
    const tabParam = searchParams.get("tab")
    const [active, setActive] = useState<TabId>(
        TAB_IDS.includes(tabParam ?? "") ? (tabParam as TabId) : "intelligence"
    )

    useEffect(() => {
        if (tabParam && TAB_IDS.includes(tabParam)) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setActive(tabParam as TabId)
        }
    }, [tabParam])

    const content: Record<TabId, React.ReactNode> = { intelligence, integrations, repositories, security, agent_rules, license }

    return (
        <div>
            {/* Tab bar */}
            <div className="flex gap-1 border-b border-border mb-8 overflow-x-auto">
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

            {/* Tab panels — all rendered, only active one visible (preserves component state) */}
            {TABS.map(({ id }) => (
                <div
                    key={id}
                    className={`space-y-12 ${active === id ? "animate-in fade-in slide-in-from-bottom-2 duration-300" : "hidden"}`}
                >
                    {content[id]}
                </div>
            ))}
        </div>
    )
}
