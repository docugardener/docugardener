// SPDX-License-Identifier: AGPL-3.0-or-later
"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { StatusChip } from "@/components/ui/status-chip"
import { Play, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react"

export function DriftSimulator() {
    const [diff, setDiff] = useState("")
    const [filename, setFilename] = useState("")
    const [tone, setTone] = useState("Strict")
    const [isLoading, setIsLoading] = useState(false)
    const [result, setResult] = useState<any>(null)

    const handleSimulate = async () => {
        if (!diff) {
            toast.error("Please enter a diff")
            return
        }

        setIsLoading(true)
        setResult(null)

        try {
            const res = await fetch("/api/simulation", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ diff, filename: filename || "example.ts", tone }),
            })

            const data = await res.json()

            if (!res.ok) throw new Error(data.error || "Simulation failed")

            setResult(data)
            toast.success("Simulation complete")
        } catch (error: any) {
            toast.error(error.message)
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="grid gap-8 lg:grid-cols-2">
            {/* Input Section */}
            <Card className="border-border shadow-md h-full flex flex-col overflow-hidden">
                <CardHeader className="bg-muted/50 border-b border-border py-6">
                    <StatusChip variant="neutral" label="INPUT" className="mb-1" />
                    <CardTitle className="text-sm font-black uppercase tracking-widest text-muted-foreground">Simulation Payload</CardTitle>
                    <CardDescription className="text-[11px] font-bold text-muted-foreground/60">Paste a Git Diff or code snippet to analyze.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6 flex-1 flex flex-col p-8">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Filename (Optional)</Label>
                            <Input
                                value={filename}
                                onChange={(e) => setFilename(e.target.value)}
                                placeholder="src/core/auth.ts"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Tone Simulation</Label>
                            <select
                                className="flex h-12 w-full rounded-xl border border-border bg-card px-3 py-1 text-sm font-bold shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
                                value={tone}
                                onChange={(e) => setTone(e.target.value)}
                            >
                                <option value="Strict">Strict (Technical)</option>
                                <option value="Detailed">Detailed (Expanded)</option>
                                <option value="Friendly">Friendly (Approachable)</option>
                            </select>
                        </div>
                    </div>

                    <div className="space-y-2 flex-1 flex flex-col">
                        <Label>Git Diff / Code Change</Label>
                        <Textarea
                            value={diff}
                            onChange={(e) => setDiff(e.target.value)}
                            placeholder={`@@ -10,7 +10,7 @@\n function calculateTotal(items: Item[]) {\n-  return items.reduce((acc, item) => acc + item.price, 0);\n+  return items.reduce((acc, item) => acc + item.price * (item.qty || 1), 0);\n }`}
                            className="font-mono text-xs flex-1 min-h-[300px]"
                        />
                    </div>

                    <Button
                        onClick={handleSimulate}
                        disabled={isLoading}
                        className="btn-premium w-full bg-primary text-primary-foreground font-black uppercase tracking-widest text-[11px] h-14 shadow-xl shadow-primary/20"
                    >
                        {isLoading ? (
                            <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Analyzing Behavior...</>
                        ) : (
                            <><Play className="mr-2 h-5 w-5 fill-current" /> Run Drift Simulation</>
                        )}
                    </Button>
                </CardContent>
            </Card>

            {/* Output Section */}
            <Card className="border-border shadow-md h-full bg-card overflow-hidden">
                <CardHeader className="bg-muted/50 border-b border-border py-6">
                    <StatusChip variant="primary" label="RESULT" className="mb-1" />
                    <CardTitle className="text-sm font-black uppercase tracking-widest text-muted-foreground">Analysis Results</CardTitle>
                    <CardDescription className="text-[11px] font-bold text-muted-foreground/60">AI prediction based on current configuration.</CardDescription>
                </CardHeader>
                <CardContent className="p-8">
                    {!result ? (
                        <div className="h-64 flex items-center justify-center text-muted-foreground text-sm border-2 border-dashed border-border rounded-lg">
                            Run a simulation to see results
                        </div>
                    ) : (
                        <div className="space-y-6 animate-in fade-in-0 slide-in-from-bottom-2">
                            {/* Score Card */}
                            <div className="flex items-center justify-between p-4 bg-card rounded-lg border border-border shadow-sm">
                                <div>
                                    <div className="text-sm text-muted-foreground font-medium">Drift Score</div>
                                    <div className="text-3xl font-bold tracking-tight mt-1 text-foreground">{result.score}/100</div>
                                </div>
                                <div className={cn(
                                    "h-12 w-12 rounded-full flex items-center justify-center",
                                    result.score > 70 ? "bg-broken/10 text-broken" :
                                        result.score > 40 ? "bg-withered/10 text-withered" :
                                            "bg-fresh/10 text-fresh"
                                )}>
                                    {result.score > 70 ? <AlertTriangle className="h-6 w-6" /> : <CheckCircle2 className="h-6 w-6" />}
                                </div>
                            </div>

                            {/* Analysis Text */}
                            <div className="space-y-2">
                                <Label>Analysis Reasoning</Label>
                                138:                                 <div className="p-4 bg-muted/30 rounded-lg border border-border text-sm text-foreground whitespace-pre-wrap leading-relaxed shadow-sm">
                                    139:                                     {result.analysis}
                                    140:                                 </div>
                            </div>

                            {/* Raw Data Debug */}
                            <div className="space-y-2">
                                <Label className="text-xs text-muted-foreground">Raw Output</Label>
                                <pre className="p-4 bg-muted/50 text-muted-foreground rounded-xl border border-border text-[10px] font-mono overflow-auto max-h-40">
                                    {JSON.stringify(result, null, 2)}
                                </pre>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
