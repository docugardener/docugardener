// SPDX-License-Identifier: AGPL-3.0-or-later
"use client"

import { useState, useEffect } from "react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2, Save, RotateCcw, MessageSquare, Info, AlertTriangle } from "lucide-react"

// SEC-02 AC-2 / AC-7 — client-side constants (server is the authoritative gate)
const MAX_PROMPT_LENGTH = 8_000

// Client-side warning patterns — non-blocking, advisory only.
// The server enforces the real blocklist.
const WARN_PATTERNS = [
    /ignore\s+(all\s+|your\s+)?(previous\s+|prior\s+)?instructions/i,
    /forget\s+(your\s+|all\s+)?instructions/i,
    /you\s+are\s+now/i,
    /act\s+as\s+a/i,
    /jailbreak/i,
    /override\s+(your\s+)?system\s+prompt/i,
]

interface PromptInfo {
    key: string
    content: string
    is_custom: boolean
}

export function PromptPlayground() {
    const [prompts, setPrompts] = useState<PromptInfo[]>([])
    const [selectedKey, setSelectedKey] = useState<string | null>(null)
    const [editContent, setEditContent] = useState("")
    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [isResetting, setIsResetting] = useState(false)
    const [domainWarning, setDomainWarning] = useState(false)

    const selectedPrompt = Array.isArray(prompts) ? prompts.find(p => p.key === selectedKey) : null
    const isDirty = selectedPrompt ? editContent !== selectedPrompt.content : false
    const charCount = editContent.length
    const overLimit = charCount > MAX_PROMPT_LENGTH

    // AC-7: live domain warning check
    const hasForbiddenPattern = WARN_PATTERNS.some(p => p.test(editContent))

    useEffect(() => { fetchPrompts() }, [])

    const fetchPrompts = async () => {
        setIsLoading(true)
        try {
            const res = await fetch("/api/prompts")
            if (!res.ok) throw new Error("Failed to fetch prompts")
            const data = await res.json()
            setPrompts(data)
            if (data.length > 0 && !selectedKey) {
                setSelectedKey(data[0].key)
                setEditContent(data[0].content)
            }
        } catch (error: any) {
            toast.error(error.message)
        } finally {
            setIsLoading(false)
        }
    }

    const handleSelectPrompt = (key: string) => {
        const p = prompts.find(p => p.key === key)
        if (p) {
            setSelectedKey(key)
            setEditContent(p.content)
            setDomainWarning(false)
        }
    }

    const handleSave = async () => {
        if (!selectedKey) return
        if (overLimit) {
            toast.error(`Prompt exceeds ${MAX_PROMPT_LENGTH.toLocaleString()} character limit.`)
            return
        }

        // AC-7: client-side advisory warning (non-blocking)
        if (hasForbiddenPattern) {
            setDomainWarning(true)
            const proceed = window.confirm(
                "This prompt may contain patterns that will be rejected by the server. Continue saving?"
            )
            if (!proceed) return
        }

        setIsSaving(true)
        try {
            const res = await fetch("/api/prompts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ key: selectedKey, content: editContent }),
            })
            const data = await res.json()
            if (!res.ok) {
                // AC-7: surface server error with specific message
                const reason = data?.reason ?? data?.error ?? "Failed to save prompt"
                toast.error(reason)
                return
            }
            toast.success("Prompt updated successfully")
            setDomainWarning(false)
            await fetchPrompts()
        } catch (error: any) {
            toast.error(error.message)
        } finally {
            setIsSaving(false)
        }
    }

    const handleReset = async () => {
        if (!selectedKey) return
        const confirmed = window.confirm(
            "Are you sure you want to revert this prompt to the system default? This cannot be undone."
        )
        if (!confirmed) return

        setIsResetting(true)
        try {
            const res = await fetch(`/api/prompts/reset?key=${selectedKey}`, { method: "POST" })
            if (!res.ok) {
                const data = await res.json()
                toast.error(data?.reason ?? "Failed to reset prompt")
                return
            }
            toast.success("Prompt reset to default")
            setDomainWarning(false)
            await fetchPrompts()
        } catch (error: any) {
            toast.error(error.message)
        } finally {
            setIsResetting(false)
        }
    }

    // AC-2: char counter colour
    const charCountColour =
        overLimit ? "text-red-400" :
        charCount > MAX_PROMPT_LENGTH * 0.9 ? "text-amber-400" :
        "text-muted-foreground"

    if (isLoading) {
        return (
            <div className="h-64 flex flex-col items-center justify-center text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin mb-4" />
                <p>Loading prompts configuration...</p>
            </div>
        )
    }

    return (
        <div className="grid gap-6 lg:grid-cols-3">
            {/* List Section */}
            <Card className="lg:col-span-1 border-border shadow-sm flex flex-col border-l-8 border-l-muted overflow-hidden">
                <CardHeader className="bg-muted/50 border-b border-border">
                    <CardTitle className="text-sm font-black uppercase tracking-widest text-muted-foreground">Prompt Keys</CardTitle>
                    <CardDescription className="text-[11px] font-bold text-muted-foreground/60">Select instructions to override.</CardDescription>
                </CardHeader>
                <CardContent className="p-0 flex-1 overflow-auto">
                    <div className="divide-y divide-border">
                        {prompts.map((p) => (
                            <button
                                key={p.key}
                                onClick={() => handleSelectPrompt(p.key)}
                                className={`w-full text-left p-4 transition-all duration-200 flex items-center justify-between group ${selectedKey === p.key
                                    ? "bg-primary/5 shadow-inner translate-x-1"
                                    : "hover:bg-muted/50 hover:translate-x-1"
                                    }`}
                            >
                                <div className="flex items-center space-x-3">
                                    <MessageSquare className={`h-4 w-4 transition-colors ${selectedKey === p.key ? "text-primary" : "text-muted-foreground group-hover:text-foreground"}`} />
                                    <span className={`text-[13px] font-bold transition-colors ${selectedKey === p.key ? "text-primary" : "text-muted-foreground group-hover:text-foreground"}`}>
                                        {p.key.replace(/_/g, " ").toLowerCase()}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    {p.is_custom && (
                                        <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-[9px] font-black uppercase tracking-tighter h-4 px-1">Custom</Badge>
                                    )}
                                    <div className={`w-1 h-4 rounded-full transition-all ${selectedKey === p.key ? "bg-primary" : "bg-transparent"}`} />
                                </div>
                            </button>
                        ))}
                    </div>
                </CardContent>
            </Card>

            {/* Editor Section */}
            <Card className="lg:col-span-2 border-border shadow-sm flex flex-col min-h-[500px] border-l-8 border-l-primary">
                {!selectedKey ? (
                    <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
                        Select a prompt to start editing
                    </div>
                ) : (
                    <>
                        <CardHeader className="flex flex-row items-center justify-between border-b border-border bg-muted/50 py-6">
                            <div>
                                <CardTitle className="text-sm font-black uppercase tracking-widest text-foreground">{selectedKey}</CardTitle>
                                <CardDescription className="flex items-center mt-1 text-[11px] font-bold">
                                    {selectedPrompt?.is_custom ? (
                                        <span className="text-primary uppercase tracking-tighter">Custom override active</span>
                                    ) : (
                                        <span className="text-muted-foreground uppercase tracking-tighter">Using system default instructions</span>
                                    )}
                                </CardDescription>
                            </div>
                            <div className="flex space-x-2">
                                {selectedPrompt?.is_custom && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={handleReset}
                                        disabled={isSaving || isResetting}
                                        className="text-[10px] font-bold uppercase tracking-widest border-border text-muted-foreground"
                                    >
                                        <RotateCcw className={`h-3 w-3 mr-2 ${isResetting ? "animate-spin" : ""}`} />
                                        {isResetting ? "Resetting..." : "Reset Defaults"}
                                    </Button>
                                )}
                                <Button
                                    size="sm"
                                    onClick={handleSave}
                                    disabled={isSaving || !isDirty || overLimit}
                                    className="btn-premium bg-primary hover:bg-primary/90 text-primary-foreground text-[10px] font-black uppercase tracking-widest h-10 px-6 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                                    {isSaving ? "Saving..." : "Save Instructions"}
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="flex-1 p-6 space-y-4">
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label className="flex items-center text-foreground">
                                        System Prompt Content
                                        <Info className="h-3 w-3 ml-2 text-muted-foreground" />
                                    </Label>
                                    {/* AC-2: live character counter */}
                                    <span className={`text-[11px] font-mono ${charCountColour}`}>
                                        {charCount.toLocaleString()} / {MAX_PROMPT_LENGTH.toLocaleString()} chars
                                    </span>
                                </div>
                                <Textarea
                                    value={editContent}
                                    onChange={(e) => setEditContent(e.target.value)}
                                    className={`font-mono text-sm min-h-[400px] leading-relaxed resize-none focus-visible:ring-primary shadow-inner ${overLimit ? "border-red-500 focus-visible:ring-red-500" : ""}`}
                                    placeholder="Enter prompt content..."
                                />
                                {/* AC-2: over-limit inline error */}
                                {overLimit && (
                                    <p className="text-[11px] text-red-400 font-semibold">
                                        Prompt exceeds the {MAX_PROMPT_LENGTH.toLocaleString()} character limit and cannot be saved.
                                    </p>
                                )}
                            </div>

                            {/* AC-7: advisory domain warning */}
                            {hasForbiddenPattern && (
                                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start space-x-3">
                                    <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
                                    <p className="text-xs text-red-300">
                                        This prompt may contain patterns that are not permitted. The server will validate and reject the save if a forbidden pattern is detected.
                                    </p>
                                </div>
                            )}

                            {/* Info box */}
                            <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-start space-x-3">
                                <Info className="h-5 w-5 text-amber-500 mt-0.5" />
                                <div className="text-xs text-amber-200/80 space-y-1">
                                    <p className="font-semibold text-amber-500">Pro Tip:</p>
                                    <p>You can use variables like <code className="bg-amber-500/20 px-1 rounded">{"{entity_name}"}</code> or <code className="bg-amber-500/20 px-1 rounded">{"{new_code}"}</code> if it&apos;s a template prompt. Ensure you don&apos;t remove required placeholders!</p>
                                    <p className="text-amber-400/80 mt-1">Prompts must relate to code review and documentation. Off-domain instructions will be rejected by the server.</p>
                                </div>
                            </div>
                        </CardContent>
                    </>
                )}
            </Card>
        </div>
    )
}
