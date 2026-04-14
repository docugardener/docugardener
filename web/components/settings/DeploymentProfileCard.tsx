// SPDX-License-Identifier: AGPL-3.0-or-later
"use client"

/**
 * Deployment identity card — shown in Settings Intelligence tab.
 *
 * Displays tenant name, tenant ID, plan, deployment mode, license key
 * fingerprint, GitHub org, cloud service URL, and live license status.
 * Only rendered in client-installed mode.
 */

import { useEffect, useState } from "react"
import { Server, Copy, Check, RefreshCw } from "lucide-react"
import { toast } from "sonner"

interface ProfileData {
    tenant_id: string
    tenant_name: string | null
    plan: string
    deployment_mode: string
    github_org: string | null
    cloud_service_url: string | null
    license_key_fingerprint: string | null
    license_status: string | null
    cancel_at: string | null
}

const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
    active:    { label: "Active",    cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" },
    grace:     { label: "Grace",     cls: "bg-amber-500/10 text-amber-400 border-amber-500/30" },
    read_only: { label: "Read-only", cls: "bg-orange-500/10 text-orange-400 border-orange-500/30" },
    revoked:   { label: "Revoked",   cls: "bg-red-500/10 text-red-400 border-red-500/30" },
}

function CopyButton({ value }: { value: string }) {
    const [copied, setCopied] = useState(false)
    function copy() {
        navigator.clipboard.writeText(value).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
        })
    }
    return (
        <button onClick={copy} className="ml-1.5 text-muted-foreground hover:text-foreground transition-colors" aria-label="Copy">
            {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
        </button>
    )
}

function Row({ label, value, mono = false, copyable = false }: {
    label: string
    value: React.ReactNode
    mono?: boolean
    copyable?: boolean
}) {
    return (
        <div className="flex items-center justify-between gap-4 py-2.5 border-b border-border last:border-0">
            <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold shrink-0 w-40">{label}</span>
            <span className={`text-xs text-foreground flex items-center gap-1 min-w-0 ${mono ? "font-mono" : "font-medium"}`}>
                {value}
                {copyable && typeof value === "string" && <CopyButton value={value} />}
            </span>
        </div>
    )
}

export function DeploymentProfileCard() {
    const [data, setData] = useState<ProfileData | null>(null)
    const [loading, setLoading] = useState(true)

    function load() {
        setLoading(true)
        fetch("/api/billing/profile")
            .then(r => r.json())
            .then(setData)
            .catch(() => toast.error("Failed to load profile"))
            .finally(() => setLoading(false))
    }

    useEffect(() => { load() }, [])

    const status = data?.license_status ? STATUS_STYLE[data.license_status] : null

    return (
        <div className="bg-card rounded-card border border-border shadow-card-hover border-l-8 border-l-slate-500 overflow-hidden">
            <div className="p-8 border-b border-border bg-muted/50 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-muted border border-border shrink-0">
                        <Server className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div>
                        <h3 className="type-section-header text-muted-foreground">Deployment Profile</h3>
                        <p className="type-body font-bold text-foreground">
                            Tenant identity, license, and PlatformCloud connection details.
                        </p>
                    </div>
                </div>
                <button
                    onClick={load}
                    disabled={loading}
                    className="shrink-0 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
                    aria-label="Refresh"
                >
                    <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                </button>
            </div>

            <div className="px-8 py-4">
                {loading && !data ? (
                    <div className="space-y-3 py-2">
                        {[...Array(7)].map((_, i) => (
                            <div key={i} className="h-4 rounded bg-muted animate-pulse" style={{ width: `${60 + (i % 3) * 15}%` }} />
                        ))}
                    </div>
                ) : data ? (
                    <div>
                        <Row label="Tenant name" value={data.tenant_name ?? "—"} />
                        <Row label="Tenant ID" value={data.tenant_id} mono copyable />
                        <Row label="Plan" value={
                            <span className="uppercase font-black tracking-wider text-[11px] text-foreground">{data.plan}</span>
                        } />
                        <Row label="Deployment mode" value={
                            <span className="capitalize">{data.deployment_mode.replace(/-/g, " ")}</span>
                        } />
                        <Row label="License status" value={
                            status
                                ? <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-black uppercase tracking-wider ${status.cls}`}>{status.label}</span>
                                : <span className="text-muted-foreground">—</span>
                        } />
                        <Row label="License key" value={
                            data.license_key_fingerprint
                                ? `••••••••••••••••••••••••${data.license_key_fingerprint}`
                                : "—"
                        } mono />
                        {data.cancel_at && (
                            <Row label="Cancels on" value={
                                <span className="text-amber-500 font-semibold">
                                    {new Date(data.cancel_at).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
                                </span>
                            } />
                        )}
                        <Row label="GitHub org" value={data.github_org ?? "—"} mono copyable={!!data.github_org} />
                        <Row label="PlatformCloud URL" value={data.cloud_service_url ?? "—"} mono copyable={!!data.cloud_service_url} />
                    </div>
                ) : null}
            </div>
        </div>
    )
}
