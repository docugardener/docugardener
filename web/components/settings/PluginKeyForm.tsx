// SPDX-License-Identifier: AGPL-3.0-or-later
"use client"

import { useState } from "react"
import { KeyRound, RotateCcw, Copy, Check, Trash2, Eye, EyeOff } from "lucide-react"
import { Button } from "@/components/ui/button"

interface PluginKeyFormProps {
    maskedKey: string | null
    isSet: boolean
}

export function PluginKeyForm({ maskedKey: initialMasked, isSet: initialIsSet }: PluginKeyFormProps) {
    const [maskedKey, setMaskedKey] = useState(initialMasked)
    const [isSet, setIsSet] = useState(initialIsSet)
    const [fullKey, setFullKey] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const [copied, setCopied] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [confirmRevoke, setConfirmRevoke] = useState(false)

    const handleGenerate = async () => {
        setLoading(true)
        setError(null)
        setConfirmRevoke(false)
        try {
            const res = await fetch("/api/plugin-key", { method: "POST" })
            if (!res.ok) {
                const d = await res.json().catch(() => ({}))
                setError(d.error || "Failed to generate key")
                return
            }
            const data = await res.json()
            setFullKey(data.pluginApiKey)
            setMaskedKey(null)
            setIsSet(true)
        } finally {
            setLoading(false)
        }
    }

    const handleRevoke = async () => {
        if (!confirmRevoke) {
            setConfirmRevoke(true)
            return
        }
        setLoading(true)
        setError(null)
        setConfirmRevoke(false)
        try {
            const res = await fetch("/api/plugin-key", { method: "DELETE" })
            if (!res.ok) {
                setError("Failed to revoke key")
                return
            }
            setFullKey(null)
            setMaskedKey(null)
            setIsSet(false)
        } finally {
            setLoading(false)
        }
    }

    const handleCopy = async () => {
        if (!fullKey) return
        await navigator.clipboard.writeText(fullKey)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    const handleDismissKey = () => {
        const visible = fullKey!.slice(0, 6 + 8)
        setMaskedKey(visible + "..." + fullKey!.slice(-4))
        setFullKey(null)
    }

    return (
        <div className="space-y-6">
            <p className="text-sm text-muted-foreground">
                Generate a secret key for the DocuGardener VS Code extension. The extension uses
                this key to authenticate pre-push drift checks against your workspace.
            </p>

            {/* Current key display */}
            {isSet && !fullKey && (
                <div className="flex items-center gap-3 bg-muted/40 border border-border rounded-lg px-4 py-3">
                    <KeyRound className="h-4 w-4 text-muted-foreground shrink-0" />
                    <code className="text-sm font-mono text-foreground flex-1 break-all">{maskedKey}</code>
                    <span className="text-xs text-emerald-500 font-bold uppercase tracking-widest">Active</span>
                </div>
            )}

            {/* Full key — shown once after generation */}
            {fullKey && (
                <div className="space-y-2">
                    <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/40 rounded-lg px-4 py-3">
                        <Eye className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                            <p className="text-xs text-amber-600 font-bold uppercase tracking-widest mb-1">
                                Copy this key now — it won&apos;t be shown again
                            </p>
                            <code className="text-sm font-mono text-foreground break-all">{fullKey}</code>
                        </div>
                        <Button
                            size="icon"
                            variant="ghost"
                            className="shrink-0"
                            onClick={handleCopy}
                            title="Copy to clipboard"
                        >
                            {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                        </Button>
                    </div>
                    <Button size="sm" variant="ghost" className="text-xs text-muted-foreground" onClick={handleDismissKey}>
                        <EyeOff className="h-3 w-3 mr-1.5" />
                        I&apos;ve saved it — hide the key
                    </Button>
                </div>
            )}

            {!isSet && (
                <p className="text-xs text-muted-foreground italic">No plugin API key configured.</p>
            )}

            {/* Actions */}
            <div className="flex flex-wrap gap-3">
                <Button
                    size="sm"
                    onClick={handleGenerate}
                    disabled={loading}
                    className="gap-2"
                >
                    <RotateCcw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                    {isSet ? "Rotate Key" : "Generate Key"}
                </Button>

                {isSet && (
                    <Button
                        size="sm"
                        variant={confirmRevoke ? "destructive" : "outline"}
                        onClick={handleRevoke}
                        disabled={loading}
                        className="gap-2"
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                        {confirmRevoke ? "Click again to confirm" : "Revoke Key"}
                    </Button>
                )}
            </div>

            {/* Setup hint */}
            <div className="rounded-lg bg-muted/30 border border-border p-4 space-y-2 text-xs text-muted-foreground">
                <p className="font-bold uppercase tracking-widest text-[10px]">VS Code Setup</p>
                <p>1. Install the <strong className="text-foreground">DocuGardener</strong> extension from the VS Code Marketplace.</p>
                <p>2. Open <strong className="text-foreground">Settings → DocuGardener → API Key</strong> and paste the key above.</p>
                <p>3. Use <strong className="text-foreground">DocuGardener: Check Drift Now</strong> from the Command Palette before pushing.</p>
                <p className="text-muted-foreground/60 italic">Self-hosted? Also set <code className="text-foreground">docugardener.backendUrl</code> to your instance URL.</p>
            </div>

            {error && (
                <p className="text-xs text-destructive font-semibold">{error}</p>
            )}
        </div>
    )
}
