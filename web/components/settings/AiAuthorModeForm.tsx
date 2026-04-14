// SPDX-License-Identifier: AGPL-3.0-or-later
"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Bot, GitMerge, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            disabled={disabled}
            onClick={() => !disabled && onChange(!checked)}
            className={cn(
                "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent",
                "transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                checked ? "bg-violet-600" : "bg-muted",
                disabled && "opacity-40 cursor-not-allowed"
            )}
        >
            <span
                className={cn(
                    "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg",
                    "transform transition-transform duration-200",
                    checked ? "translate-x-5" : "translate-x-0"
                )}
            />
        </button>
    )
}

const DEFAULT_PATTERNS = ["*[bot]", "copilot/*", "devin/*", "cursor/*", "claude/*"]

interface AiAuthorModeFormProps {
    config?: {
        aiAuthorMode?: boolean
        aiAuthorPatterns?: string[]
        autoMergeAiDocs?: boolean
        autoMergeMethod?: string
        autoMergeWaitForCI?: boolean
    }
}

export function AiAuthorModeForm({ config }: AiAuthorModeFormProps) {
    const [isSaving, setIsSaving] = useState(false)

    const [aiAuthorMode, setAiAuthorMode] = useState<boolean>(config?.aiAuthorMode ?? false)
    const [patterns, setPatterns] = useState<string>(
        (config?.aiAuthorPatterns ?? DEFAULT_PATTERNS).join("\n")
    )
    const [autoMerge, setAutoMerge] = useState<boolean>(config?.autoMergeAiDocs ?? false)
    const [mergeMethod, setMergeMethod] = useState<string>(config?.autoMergeMethod ?? "squash")
    const [waitForCI, setWaitForCI] = useState<boolean>(config?.autoMergeWaitForCI ?? true)

    const handleSave = async () => {
        setIsSaving(true)
        try {
            const parsedPatterns = patterns
                .split("\n")
                .map(p => p.trim())
                .filter(Boolean)

            const res = await fetch("/api/settings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    workflowConfig: {
                        aiAuthorMode,
                        aiAuthorPatterns: parsedPatterns,
                        autoMergeAiDocs: autoMerge,
                        autoMergeMethod: mergeMethod,
                        autoMergeWaitForCI: waitForCI,
                    },
                }),
            })

            if (!res.ok) {
                const err = await res.json()
                throw new Error(err.error || "Save failed")
            }

            toast.success("AI Author Mode settings saved.")
        } catch (e: any) {
            toast.error(e.message || "Failed to save settings.")
        } finally {
            setIsSaving(false)
        }
    }

    return (
        <div className="space-y-6">
            {/* Master switch */}
            <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <Bot className="w-4 h-4 text-violet-500" />
                        <Label className="text-sm font-bold text-foreground">Enable AI Author Mode</Label>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed max-w-md">
                        When a PR is authored by an AI coding tool (Copilot, Cursor, Devin, Claude Code),
                        skip inbox triage and generate the documentation fix automatically.
                    </p>
                </div>
                <Toggle checked={aiAuthorMode} onChange={setAiAuthorMode} />
            </div>

            {/* Pattern config */}
            <div className="space-y-2">
                <Label className="text-xs uppercase font-black tracking-widest text-muted-foreground/60">
                    Detection Patterns
                </Label>
                <p className="text-xs text-muted-foreground">
                    One pattern per line. Supports <code className="font-mono text-xs bg-muted px-1 rounded">*[bot]</code> (suffix) and{" "}
                    <code className="font-mono text-xs bg-muted px-1 rounded">copilot/*</code> (prefix) wildcards, or exact login/branch matches.
                </p>
                <Textarea
                    value={patterns}
                    onChange={e => setPatterns(e.target.value)}
                    rows={5}
                    className="font-mono text-xs resize-none bg-muted/20 border-border"
                    placeholder={DEFAULT_PATTERNS.join("\n")}
                />
            </div>

            {/* Auto-merge section */}
            <div className="pt-2 border-t border-border space-y-4">
                <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2">
                            <GitMerge className="w-4 h-4 text-emerald-500" />
                            <Label className="text-sm font-bold text-foreground">Auto-merge Documentation Fix PRs</Label>
                        </div>
                        <p className="text-xs text-muted-foreground max-w-md">
                            Automatically merge the generated documentation fix PR.
                            When disabled, the fix PR is created but requires manual review.
                        </p>
                    </div>
                    <Toggle checked={autoMerge} onChange={setAutoMerge} disabled={!aiAuthorMode} />
                </div>

                {autoMerge && aiAuthorMode && (
                    <div className="pl-6 space-y-4 border-l-2 border-emerald-500/30">
                        <div className="flex items-center gap-4">
                            <Label className="text-xs font-bold text-muted-foreground w-28 shrink-0">Merge Method</Label>
                            <Select value={mergeMethod} onValueChange={setMergeMethod}>
                                <SelectTrigger className="w-40 h-8 text-xs bg-muted/20">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="squash">Squash and merge</SelectItem>
                                    <SelectItem value="merge">Create a merge commit</SelectItem>
                                    <SelectItem value="rebase">Rebase and merge</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="flex items-center justify-between gap-4">
                            <div className="space-y-0.5">
                                <Label className="text-xs font-bold text-foreground">Wait for CI Checks</Label>
                                <p className="text-xs text-muted-foreground">
                                    Only merge after all status checks pass. Strongly recommended.
                                </p>
                            </div>
                            <Toggle checked={waitForCI} onChange={setWaitForCI} />
                        </div>
                    </div>
                )}
            </div>

            <Button
                onClick={handleSave}
                disabled={isSaving}
                className="bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-500/20 border-b-4 border-violet-800 active:border-b-0 active:translate-y-1 transition-all"
            >
                {isSaving ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…</>
                ) : (
                    "Save AI Author Settings"
                )}
            </Button>
        </div>
    )
}
