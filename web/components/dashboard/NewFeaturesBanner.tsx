// SPDX-License-Identifier: AGPL-3.0-or-later
"use client"

import { useEffect, useState } from "react"
import { Sparkles, X } from "lucide-react"
import Link from "next/link"

// Human-readable labels for feature keys (mirrors web/lib/features.ts FEATURES catalog)
const FEATURE_LABELS: Record<string, string> = {
    audit_log:                  "Audit Log",
    audit_log_export:           "Audit Log Export",
    risk_map:                   "Risk Map",
    analytics:                  "Analytics",
    holistic_scoring:           "Holistic Scoring",
    prompt_customization:       "Prompt Customization",
    llm_config:                 "LLM Configuration",
    ai_author_mode:             "AI Author Mode",
    slack_integration:          "Slack Integration",
    integrations_jira:          "Jira Integration",
    integrations_linear:        "Linear Integration",
    integrations_github_issues: "GitHub Issues Integration",
    sso_saml:                   "Single Sign-On (SSO)",
    scim:                       "SCIM Provisioning",
    environment_profile:        "Environment Profile Export",
    compliance_templates:       "Compliance Templates",
    role_auditor:               "Auditor Role",
    role_billing_admin:         "Billing Admin Role",
    private_repos:              "Private Repositories",
    agent_rules:                "Agent Rules",
}

const LS_KEY = "dg-seen-features"

/** Returns { seen, initialized } — initialized=false means LS key never existed (first visit). */
function getSeenFeatures(): { seen: Set<string>; initialized: boolean } {
    try {
        const raw = localStorage.getItem(LS_KEY)
        if (raw === null) return { seen: new Set(), initialized: false }
        return { seen: new Set(JSON.parse(raw)), initialized: true }
    } catch {
        return { seen: new Set(), initialized: false }
    }
}

function saveSeenFeatures(features: string[]) {
    try {
        localStorage.setItem(LS_KEY, JSON.stringify([...features].sort()))
    } catch {}
}

export function NewFeaturesBanner() {
    const [newFeatures, setNewFeatures] = useState<string[]>([])
    const [dismissed, setDismissed] = useState(false)

    useEffect(() => {
        fetch("/api/billing/profile")
            .then(r => r.ok ? r.json() : null)
            .then((data: any) => {
                const granted: string[] = data?.granted_features ?? []
                if (granted.length === 0) return

                const { seen, initialized } = getSeenFeatures()

                if (!initialized) {
                    // First visit — silently baseline, no banner
                    saveSeenFeatures(granted)
                    return
                }

                const added = granted.filter(f => !seen.has(f))
                if (added.length > 0) {
                    setNewFeatures(added)
                } else {
                    // Nothing new — keep seen list current silently
                    saveSeenFeatures(granted)
                }
            })
            .catch(() => null)
    }, [])

    function dismiss() {
        // Mark all currently granted features as seen
        fetch("/api/billing/profile")
            .then(r => r.ok ? r.json() : null)
            .then((data: any) => {
                saveSeenFeatures(data?.granted_features ?? [])
            })
            .catch(() => {})
        setDismissed(true)
    }

    if (newFeatures.length === 0 || dismissed) return null

    const labels = newFeatures
        .map(f => FEATURE_LABELS[f] ?? f)
        .join(", ")

    return (
        <div className="flex items-center justify-between px-4 py-2 text-xs font-semibold bg-emerald-500/10 border-b border-emerald-500/20 text-emerald-700 dark:text-emerald-400">
            <div className="flex items-center gap-2 min-w-0">
                <Sparkles className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">
                    <span className="font-black uppercase tracking-wider">New features unlocked</span>
                    {" — "}
                    {labels}.{" "}
                    <Link
                        href="/dashboard/settings?tab=license"
                        className="underline underline-offset-2 hover:opacity-80 transition-opacity"
                        onClick={dismiss}
                    >
                        View in License settings
                    </Link>
                </span>
            </div>
            <button
                onClick={dismiss}
                aria-label="Dismiss"
                className="ml-4 shrink-0 opacity-60 hover:opacity-100 transition-opacity"
            >
                <X className="h-3.5 w-3.5" />
            </button>
        </div>
    )
}
