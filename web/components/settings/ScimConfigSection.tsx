"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"

interface ScimConfigSectionProps {
    scimEnabled: boolean
    hasToken: boolean
    scimLastSyncAt: string | null
    scimBaseUrl: string
}

export function ScimConfigSection({
    scimEnabled: initialEnabled,
    hasToken: initialHasToken,
    scimLastSyncAt,
    scimBaseUrl,
}: ScimConfigSectionProps) {
    const [enabled, setEnabled] = useState(initialEnabled)
    const [hasToken, setHasToken] = useState(initialHasToken)
    const [newToken, setNewToken] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)

    async function handleToggle() {
        setLoading(true)
        try {
            const res = await fetch("/api/settings/scim", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ scimEnabled: !enabled }),
            })
            if (!res.ok) { toast.error("Failed to update SCIM"); return }
            setEnabled(!enabled)
            toast.success(`SCIM ${!enabled ? "enabled" : "disabled"}`)
        } finally {
            setLoading(false)
        }
    }

    async function handleGenerate() {
        setLoading(true)
        try {
            const res = await fetch("/api/settings/scim", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "generate" }),
            })
            const data = await res.json()
            if (!res.ok) { toast.error("Failed to generate token"); return }
            setNewToken(data.token)
            setHasToken(true)
            setEnabled(true)
            toast.success("SCIM token generated — copy it now, it won't be shown again")
        } finally {
            setLoading(false)
        }
    }

    async function handleRevoke() {
        if (!confirm("Revoke the SCIM token? Your IdP will stop syncing until you generate a new one.")) return
        setLoading(true)
        try {
            const res = await fetch("/api/settings/scim", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "revoke" }),
            })
            if (!res.ok) { toast.error("Failed to revoke token"); return }
            setHasToken(false)
            setEnabled(false)
            setNewToken(null)
            toast.success("SCIM token revoked")
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="space-y-6">
            {/* Enable toggle */}
            <div className="flex items-center justify-between">
                <div>
                    <p className="font-semibold text-sm text-foreground">Enable SCIM 2.0 Provisioning</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        Allow your Identity Provider to automatically provision and deprovision users.
                    </p>
                </div>
                <button
                    type="button"
                    role="switch"
                    aria-checked={enabled}
                    onClick={handleToggle}
                    disabled={loading}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70 disabled:opacity-50 ${enabled ? "bg-primary" : "bg-input"}`}
                >
                    <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${enabled ? "translate-x-6" : "translate-x-1"}`}
                    />
                </button>
            </div>

            {/* SCIM Base URL */}
            <div className="rounded-md bg-muted/50 border border-border p-4 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                    SCIM Endpoint — configure this in your IdP
                </p>
                <div className="grid grid-cols-[100px_1fr] gap-x-4 gap-y-2 text-sm">
                    <span className="text-muted-foreground">Base URL</span>
                    <code className="text-xs bg-muted px-2 py-0.5 rounded break-all">{scimBaseUrl}</code>
                    {scimLastSyncAt && (
                        <>
                            <span className="text-muted-foreground">Last sync</span>
                            <span className="text-xs">{new Date(scimLastSyncAt).toLocaleString()}</span>
                        </>
                    )}
                </div>
            </div>

            {/* Token management */}
            <div className={`space-y-3 ${!enabled ? "opacity-40 pointer-events-none select-none" : ""}`}>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Bearer Token
                    {!enabled && <span className="ml-2 font-normal normal-case tracking-normal text-muted-foreground">(enable SCIM to manage tokens)</span>}
                </p>
                {hasToken && !newToken && (
                    <p className="text-sm text-muted-foreground">
                        A token is configured.{" "}
                        <span className="text-xs text-muted-foreground">
                            The token value is not stored and cannot be retrieved — generate a new one to rotate.
                        </span>
                    </p>
                )}
                {newToken && (
                    <div className="rounded-md border border-amber-400 bg-amber-50 dark:bg-amber-950/30 p-4 space-y-2">
                        <p className="text-xs font-semibold text-amber-800 dark:text-amber-400">
                            Copy this token now — it will not be shown again.
                        </p>
                        <code className="block text-xs font-mono break-all bg-white dark:bg-black/30 rounded px-2 py-1.5 border border-amber-300">
                            {newToken}
                        </code>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => { navigator.clipboard.writeText(newToken); toast.success("Copied") }}
                        >
                            Copy to clipboard
                        </Button>
                    </div>
                )}
                <div className="flex gap-2">
                    <Button onClick={handleGenerate} disabled={loading} size="sm">
                        {hasToken ? "Rotate Token" : "Generate Token"}
                    </Button>
                    {hasToken && (
                        <Button onClick={handleRevoke} disabled={loading} variant="destructive" size="sm">
                            Revoke Token
                        </Button>
                    )}
                </div>
            </div>

            {/* Setup instructions */}
            <div className="rounded-md bg-muted/30 border border-border p-4 space-y-2 text-xs text-muted-foreground">
                <p className="font-semibold text-foreground">Okta setup</p>
                <ol className="list-decimal list-inside space-y-1">
                    <li>In Okta Admin: Applications → your app → Provisioning → Enable SCIM</li>
                    <li>SCIM connector base URL: <code className="bg-muted px-1 rounded">{scimBaseUrl}</code></li>
                    <li>Authentication: OAuth Bearer Token → paste the generated token above</li>
                    <li>Supported features: Push New Users, Push Profile Updates, Push User Deactivation</li>
                </ol>
            </div>
        </div>
    )
}
