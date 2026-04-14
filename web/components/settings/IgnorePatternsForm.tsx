// SPDX-License-Identifier: AGPL-3.0-or-later
"use client"

import { useState, useEffect } from "react"
import { toast } from "sonner"
import ignore from "ignore"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Check, X } from "lucide-react"

export function IgnorePatternsForm() {
    const [content, setContent] = useState("")
    const [isSaving, setIsSaving] = useState(false)
    const [testPath, setTestPath] = useState("")
    const [isIgnored, setIsIgnored] = useState<boolean | null>(null)
    const [initialContent, setInitialContent] = useState("")

    const isDirty = content !== initialContent

    // Fetch initial content
    useEffect(() => {
        fetch("/api/settings/ignore")
            .then(res => res.json())
            .then(data => {
                setContent(data.content || "")
                setInitialContent(data.content || "")
            })
            .catch(console.error)
    }, [])

    // Real-time testing
    useEffect(() => {
        if (!testPath) {
            setIsIgnored(null)
            return
        }
        try {
            const ig = ignore().add(content)
            setIsIgnored(ig.ignores(testPath))
        } catch (e) {
            setIsIgnored(null)
        }
    }, [content, testPath])

    const handleSave = async () => {
        setIsSaving(true)
        try {
            const res = await fetch("/api/settings/ignore", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content }),
            })

            if (!res.ok) throw new Error("Failed to save")

            toast.success("Patterns saved", {
                description: ".dgignore file updated successfully."
            })
        } catch (error) {
            toast.error("Failed to save", {
                description: "Could not write to .dgignore file."
            })
        } finally {
            setIsSaving(false)
        }
    }

    const handleReset = () => {
        setContent(initialContent)
        toast.info("Changes discarded")
    }

    return (
        <div className="space-y-6">
            <div className="space-y-2">
                <Label>Patterns (.dgignore)</Label>
                <Textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder={"*.test.ts\nnode_modules/"}
                    className="font-mono min-h-[200px]"
                />
            </div>

            <div className="p-4 bg-muted/20 rounded-lg border border-border space-y-4">
                <div className="space-y-2">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Test Pattern Matching
                    </Label>
                    <div className="flex gap-2">
                        <Input
                            value={testPath}
                            onChange={(e) => setTestPath(e.target.value)}
                            placeholder="e.g. src/tests/utils.test.ts"
                            className="bg-card"
                        />
                        {testPath && isIgnored !== null && (
                            <Badge variant={isIgnored ? "destructive" : "default"} className={isIgnored ? "bg-broken" : "bg-fresh"}>
                                {isIgnored ? (
                                    <><X className="w-3 h-3 mr-1" /> Ignored</>
                                ) : (
                                    <><Check className="w-3 h-3 mr-1" /> Included</>
                                )}
                            </Badge>
                        )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Type a file path to see if your patterns would exclude it.
                    </p>
                </div>
            </div>

            <div className="flex justify-end gap-3 pt-6 border-t border-border mt-6">
                <Button
                    type="button"
                    variant="ghost"
                    onClick={handleReset}
                    disabled={!isDirty || isSaving}
                    className="text-muted-foreground hover:text-foreground hover:bg-muted"
                >
                    Reset
                </Button>
                <Button
                    onClick={handleSave}
                    disabled={!isDirty || isSaving}
                    className="btn-premium bg-primary hover:bg-primary/90 text-primary-foreground min-w-[120px]"
                >
                    {isSaving ? "Saving..." : "Save Patterns"}
                </Button>
            </div>
        </div>
    )
}
