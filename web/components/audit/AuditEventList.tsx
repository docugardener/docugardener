// SPDX-License-Identifier: AGPL-3.0-or-later
"use client"

/**
 * AuditEventList — client component that renders the audit log event rows
 * with an inline accordion detail panel.
 *
 * Collapsed row: actor avatar + event badge + human summary + timestamp
 * Expanded panel: Actor · Resource · Metadata · Security (full hash + copy)
 */

import { useState, useCallback } from "react"
import { formatDistanceToNow, format } from "date-fns"
import { ChevronRight, Copy, Check, Shield } from "lucide-react"
import { Badge } from "@/components/ui/badge"

// ── Types ──────────────────────────────────────────────────────────────────────

export interface AuditLogEntry {
    id: string
    actorEmail: string | null
    actorIp: string | null
    event: string
    resourceType: string | null
    resourceId: string | null
    metadata: Record<string, unknown> | null
    hash: string
    createdAt: string | Date
}

// ── Event display config ───────────────────────────────────────────────────────

const EVENT_LABELS: Record<string, string> = {
    USER_LOGIN:                  "User Login",
    USER_LOGIN_FAILED:           "Login Failed",
    SETTINGS_CHANGED:            "Settings Changed",
    TRIAGE_DECISION:             "Triage Decision",
    REPO_TOGGLED:                "Repo Toggled",
    USER_INVITED:                "User Invited",
    USER_ROLE_CHANGED:           "Role Changed",
    USER_REMOVED:                "User Removed",
    SSO_LOGIN:                   "SSO Login",
    SSO_CONFIG_CHANGED:          "SSO Config Changed",
    SESSIONS_REVOKED:            "Sessions Revoked",
    TRIAL_STARTED:               "Trial Started",
    TRIAL_EXPIRED:               "Trial Expired",
    SCIM_USER_CREATED:           "SCIM Provisioned",
    SCIM_USER_UPDATED:           "SCIM Updated",
    SCIM_USER_DEACTIVATED:       "SCIM Deprovisioned",
    SCIM_USER_REACTIVATED:       "SCIM Reactivated",
    SCIM_TOKEN_ROTATED:          "SCIM Token Rotated",
    POLICY_VIOLATION_DISMISSED:  "Policy Violation Dismissed",
    ACCOUNT_LINKED:              "Account Linked",
}

const EVENT_COLORS: Record<string, string> = {
    USER_LOGIN:                  "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800",
    USER_LOGIN_FAILED:           "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800",
    SETTINGS_CHANGED:            "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800",
    TRIAGE_DECISION:             "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950/40 dark:text-yellow-400 dark:border-yellow-800",
    REPO_TOGGLED:                "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-400 dark:border-purple-800",
    USER_INVITED:                "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-400 dark:border-teal-800",
    USER_ROLE_CHANGED:           "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-400 dark:border-orange-800",
    USER_REMOVED:                "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800",
    SSO_LOGIN:                   "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800",
    SSO_CONFIG_CHANGED:          "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800",
    SESSIONS_REVOKED:            "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800",
    TRIAL_STARTED:               "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-400 dark:border-teal-800",
    TRIAL_EXPIRED:               "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-400 dark:border-orange-800",
    SCIM_USER_CREATED:           "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-400 dark:border-violet-800",
    SCIM_USER_UPDATED:           "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-400 dark:border-violet-800",
    SCIM_USER_DEACTIVATED:       "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800",
    SCIM_USER_REACTIVATED:       "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800",
    SCIM_TOKEN_ROTATED:          "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950/40 dark:text-yellow-400 dark:border-yellow-800",
    POLICY_VIOLATION_DISMISSED:  "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800",
    ACCOUNT_LINKED:              "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-400 dark:border-sky-800",
}

// ── Human-readable summary per event ─────────────────────────────────────────

function buildSummary(log: AuditLogEntry): string {
    const actor = log.actorEmail ?? "System"
    const m = (log.metadata ?? {}) as Record<string, string>

    switch (log.event) {
        case "USER_LOGIN":
            return `${actor} signed in`
        case "USER_LOGIN_FAILED":
            return `Failed sign-in attempt for ${actor}`
        case "SETTINGS_CHANGED":
            return `${actor} updated workspace settings`
        case "TRIAGE_DECISION": {
            const action = m.action ?? "reviewed"
            const repo = m.repo ?? m.repositoryName ?? null
            return repo
                ? `${actor} ${action} a drift finding in ${repo}`
                : `${actor} ${action} a drift finding`
        }
        case "REPO_TOGGLED": {
            const repoName = log.resourceId ?? m.repo ?? "a repository"
            const state = m.enabled === "true" || m.enabled === true as unknown as string ? "enabled" : "disabled"
            return `${actor} ${state} ${repoName}`
        }
        case "USER_INVITED": {
            const invited = m.invitedEmail ?? log.resourceId ?? "a user"
            return `${actor} invited ${invited}`
        }
        case "USER_ROLE_CHANGED": {
            const target = m.targetEmail ?? log.resourceId ?? "a user"
            const role = m.newRole ?? m.role ?? "a new role"
            return `${actor} changed ${target}'s role to ${role}`
        }
        case "USER_REMOVED": {
            const target = m.targetEmail ?? log.resourceId ?? "a user"
            return `${actor} removed ${target} from the workspace`
        }
        case "SSO_LOGIN":
            return `${actor} signed in via SSO`
        case "SSO_CONFIG_CHANGED":
            return `${actor} updated SSO / SAML configuration`
        case "SESSIONS_REVOKED":
            return `${actor} revoked all active sessions`
        case "TRIAL_STARTED":
            return `Trial period started`
        case "TRIAL_EXPIRED":
            return `Trial period expired`
        case "SCIM_USER_CREATED": {
            const email = m.email ?? log.resourceId ?? "A user"
            return `${email} provisioned via SCIM`
        }
        case "SCIM_USER_UPDATED": {
            const email = m.email ?? log.resourceId ?? "A user"
            return `${email} updated via SCIM`
        }
        case "SCIM_USER_DEACTIVATED": {
            const email = m.email ?? log.resourceId ?? "A user"
            return `${email} deprovisioned via SCIM`
        }
        case "SCIM_USER_REACTIVATED": {
            const email = m.email ?? log.resourceId ?? "A user"
            return `${email} reactivated via SCIM`
        }
        case "SCIM_TOKEN_ROTATED":
            return `${actor} rotated the SCIM provisioning token`
        case "POLICY_VIOLATION_DISMISSED": {
            const rule = m.rule ?? m.policyRule ?? null
            const repo = m.repo ?? null
            if (rule && repo) return `${actor} dismissed policy violation "${rule}" in ${repo}`
            if (rule) return `${actor} dismissed policy violation "${rule}"`
            return `${actor} dismissed a policy violation`
        }
        case "ACCOUNT_LINKED": {
            const provider = m.provider ?? "an external provider"
            return `${m.provider ? capitalise(provider) : provider} account linked to ${actor}`
        }
        default:
            return `${actor} — ${log.event}`
    }
}

// ── Resource label — context-aware (no raw UUIDs) ─────────────────────────────

function buildResourceLabel(log: AuditLogEntry): string | null {
    if (!log.resourceType) return null
    const m = (log.metadata ?? {}) as Record<string, string>

    switch (log.event) {
        case "TRIAGE_DECISION":
            return `Analysis job${log.resourceId ? ` · ${log.resourceId.slice(0, 8)}` : ""}`
        case "REPO_TOGGLED":
            return `Repository · ${log.resourceId ?? "—"}`
        case "USER_INVITED":
        case "USER_ROLE_CHANGED":
        case "USER_REMOVED":
            return `User · ${m.targetEmail ?? (log.resourceId ? log.resourceId.slice(0, 8) : "—")}`
        case "SCIM_USER_CREATED":
        case "SCIM_USER_UPDATED":
        case "SCIM_USER_DEACTIVATED":
        case "SCIM_USER_REACTIVATED":
            return `SCIM user · ${m.email ?? log.resourceId ?? "—"}`
        case "ACCOUNT_LINKED":
            return `${m.provider ?? "Provider"} · ${m.providerAccountId ?? log.resourceId ?? "—"}`
        case "POLICY_VIOLATION_DISMISSED":
            return m.rule ? `Policy rule · ${m.rule}` : null
        default:
            if (!log.resourceId) return log.resourceType
            // Only show the resourceId if it looks like a repo slug (contains "/"), otherwise show type only
            if (log.resourceId.includes("/")) return `${log.resourceType} · ${log.resourceId}`
            return log.resourceType
    }
}

// ── Actor avatar ───────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
    "bg-blue-500", "bg-violet-500", "bg-amber-500",
    "bg-emerald-500", "bg-rose-500", "bg-teal-500", "bg-orange-500",
]

function avatarColor(email: string | null): string {
    if (!email) return "bg-muted"
    return AVATAR_COLORS[email.charCodeAt(0) % AVATAR_COLORS.length]
}

function avatarInitials(email: string | null): string {
    if (!email) return "SY"
    const [local] = email.split("@")
    const parts = local.split(/[._-]/).filter(Boolean)
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
    return local.slice(0, 2).toUpperCase()
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function capitalise(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1)
}

function toLabel(key: string): string {
    return key.replace(/([A-Z])/g, " $1").replace(/_/g, " ").trim()
}

// ── CopyButton ─────────────────────────────────────────────────────────────────

function CopyButton({ value }: { value: string }) {
    const [copied, setCopied] = useState(false)
    const copy = useCallback(() => {
        navigator.clipboard.writeText(value).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 1800)
        })
    }, [value])

    return (
        <button
            onClick={(e) => { e.stopPropagation(); copy() }}
            className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors px-1.5 py-0.5 rounded border border-border hover:border-primary/30"
        >
            {copied
                ? <><Check className="w-2.5 h-2.5 text-emerald-400" />Copied</>
                : <><Copy className="w-2.5 h-2.5" />Copy</>}
        </button>
    )
}

// ── Detail panel sections ──────────────────────────────────────────────────────

function DetailSection({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="space-y-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/50">{label}</p>
            {children}
        </div>
    )
}

// ── Main component ─────────────────────────────────────────────────────────────

export function AuditEventList({ logs }: { logs: AuditLogEntry[] }) {
    const [expandedId, setExpandedId] = useState<string | null>(null)

    const toggle = (id: string) =>
        setExpandedId(prev => prev === id ? null : id)

    return (
        <div className="divide-y divide-border">
            {logs.map((log) => {
                const isExpanded = expandedId === log.id
                const summary = buildSummary(log)
                const resourceLabel = buildResourceLabel(log)
                const meta = (log.metadata ?? {}) as Record<string, unknown>
                const hasMetadata = Object.keys(meta).length > 0
                const createdAt = new Date(log.createdAt)

                return (
                    <div key={log.id}>
                        {/* ── Collapsed row ── */}
                        <button
                            className="w-full text-left flex items-start gap-3 px-6 py-4 hover:bg-muted/30 transition-colors group"
                            onClick={() => toggle(log.id)}
                            aria-expanded={isExpanded}
                        >
                            {/* Actor avatar */}
                            <div className={`w-8 h-8 rounded-lg shrink-0 flex items-center justify-center text-white text-[11px] font-black mt-0.5 ${avatarColor(log.actorEmail)}`}>
                                {avatarInitials(log.actorEmail)}
                            </div>

                            {/* Main content */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <Badge
                                        variant="outline"
                                        className={`text-[10px] px-1.5 py-0 h-4 rounded-sm shrink-0 ${EVENT_COLORS[log.event] ?? "bg-muted text-muted-foreground border-border"}`}
                                    >
                                        {EVENT_LABELS[log.event] ?? log.event}
                                    </Badge>
                                    {resourceLabel && (
                                        <span className="text-[11px] text-muted-foreground/60 font-mono truncate">
                                            {resourceLabel}
                                        </span>
                                    )}
                                </div>
                                <p className="mt-1 text-sm font-medium text-foreground leading-snug">
                                    {summary}
                                </p>
                                <div className="mt-0.5 flex items-center gap-2 flex-wrap">
                                    <span className="text-xs text-muted-foreground">
                                        {log.actorEmail ?? "System"}
                                    </span>
                                    {log.actorIp && (
                                        <>
                                            <span className="text-muted-foreground/30 text-xs">·</span>
                                            <span className="text-xs text-muted-foreground/60 font-mono">{log.actorIp}</span>
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Right: time + hash indicator + chevron */}
                            <div className="shrink-0 flex flex-col items-end gap-1 min-w-[72px]">
                                <span className="text-xs text-muted-foreground">
                                    {formatDistanceToNow(createdAt, { addSuffix: true })}
                                </span>
                                <div className="flex items-center gap-1.5">
                                    <Shield className="w-2.5 h-2.5 text-muted-foreground/30" />
                                    <span className="font-mono text-[9px] text-muted-foreground/30">
                                        {log.hash.slice(0, 6)}
                                    </span>
                                </div>
                                <ChevronRight className={`w-3.5 h-3.5 text-muted-foreground/40 transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`} />
                            </div>
                        </button>

                        {/* ── Expanded detail panel (accordion) ── */}
                        <div className={`grid transition-all duration-200 ease-in-out ${isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                            <div className="overflow-hidden">
                                <div className="mx-6 mb-4 rounded-xl border border-border bg-muted/20 divide-y divide-border">

                                    {/* Row 1: Actor + Resource */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-border">

                                        {/* Actor */}
                                        <div className="p-4">
                                            <DetailSection label="Actor">
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-9 h-9 rounded-lg shrink-0 flex items-center justify-center text-white text-xs font-black ${avatarColor(log.actorEmail)}`}>
                                                        {avatarInitials(log.actorEmail)}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-semibold text-foreground truncate">
                                                            {log.actorEmail ?? "System"}
                                                        </p>
                                                        {log.actorIp && (
                                                            <p className="text-xs text-muted-foreground font-mono mt-0.5">
                                                                IP: {log.actorIp}
                                                            </p>
                                                        )}
                                                        {(meta.provider as string) && (
                                                            <p className="text-xs text-muted-foreground mt-0.5">
                                                                via {capitalise(meta.provider as string)}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            </DetailSection>
                                        </div>

                                        {/* Resource */}
                                        {(log.resourceType || log.resourceId) && (
                                            <div className="p-4">
                                                <DetailSection label="Resource">
                                                    <div className="space-y-1.5">
                                                        {log.resourceType && (
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/50 w-16 shrink-0">Type</span>
                                                                <span className="text-xs font-mono text-foreground">{log.resourceType}</span>
                                                            </div>
                                                        )}
                                                        {log.resourceId && (
                                                            <div className="flex items-start gap-2">
                                                                <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/50 w-16 shrink-0 pt-0.5">ID</span>
                                                                <span className="text-xs font-mono text-foreground break-all">{log.resourceId}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </DetailSection>
                                            </div>
                                        )}
                                    </div>

                                    {/* Row 2: Metadata (only if present) */}
                                    {hasMetadata && (
                                        <div className="p-4">
                                            <DetailSection label="Context">
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1.5">
                                                    {Object.entries(meta).map(([key, val]) => (
                                                        <div key={key} className="flex items-start gap-2">
                                                            <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/50 shrink-0 min-w-[100px] pt-0.5">
                                                                {toLabel(key)}
                                                            </span>
                                                            <span className="text-xs font-mono text-foreground break-all">
                                                                {String(val ?? "—")}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </DetailSection>
                                        </div>
                                    )}

                                    {/* Row 3: Security — hash + timestamp */}
                                    <div className="p-4">
                                        <DetailSection label="Security">
                                            <div className="space-y-2">
                                                <div className="flex items-center gap-3 flex-wrap">
                                                    <div className="flex items-center gap-1.5 min-w-0">
                                                        <Shield className="w-3 h-3 text-muted-foreground/40 shrink-0" />
                                                        <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/50 shrink-0">SHA-256</span>
                                                        <span className="text-xs font-mono text-muted-foreground break-all">
                                                            {log.hash}
                                                        </span>
                                                    </div>
                                                    <CopyButton value={log.hash} />
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/50 shrink-0">Recorded</span>
                                                    <span className="text-xs font-mono text-muted-foreground">
                                                        {format(createdAt, "yyyy-MM-dd HH:mm:ss 'UTC'")}
                                                    </span>
                                                </div>
                                            </div>
                                        </DetailSection>
                                    </div>

                                </div>
                            </div>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}
