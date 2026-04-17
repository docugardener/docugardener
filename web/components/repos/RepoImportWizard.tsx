// SPDX-License-Identifier: AGPL-3.0-or-later
"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { GitBranch, RefreshCw, CheckCircle2, ArrowRight } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { StatusChip } from "@/components/ui/status-chip"

export function RepoImportWizard({ onComplete }: { onComplete: () => void }) {
    const [syncing, setSyncing] = useState(false)
    const [repos, setRepos] = useState<any[]>([])

    const handleSync = async () => {
        setSyncing(true)
        try {
            const res = await fetch("/api/repos", { method: "POST" })
            const data = await res.json()
            if (data.repositories) {
                setRepos(data.repositories)
            }
        } catch (err) {
            console.error(err)
        } finally {
            setSyncing(false)
        }
    }

    return (
        <div className="flex flex-col items-center justify-center py-20 animate-entrance">
            <Card className="w-full max-w-2xl border-border bg-card shadow-card-hover overflow-hidden">
                <CardHeader className="bg-muted/30 border-b border-border pb-6">
                    <StatusChip variant="primary" label="IMPORT" className="mb-2" />
                    <div className="flex items-center gap-3 mb-2">
                        <div className="h-10 w-10 bg-primary/10 rounded-xl flex items-center justify-center border border-primary/20">
                            <GitBranch className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <CardTitle className="type-section-header">Garden Discovery</CardTitle>
                            <CardDescription className="type-body text-muted-foreground mt-1">
                                Let's find your repositories and start the semantic analysis.
                            </CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-8 pt-10 px-8 pb-10">
                    {repos.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-10 text-center space-y-8">
                            <div className="relative">
                                <div className="absolute inset-0 bg-primary/10 blur-[100px] rounded-full scale-[2]" />
                                <div className="h-24 w-24 rounded-3xl bg-card border border-border flex items-center justify-center shadow-2xl relative">
                                    <RefreshCw className={`h-10 w-10 text-primary ${syncing ? 'animate-spin' : ''}`} />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <h3 className="text-2xl font-black text-foreground tracking-tighter">Connect your repositories</h3>
                                <p className="text-sm text-muted-foreground max-w-xs mx-auto font-medium">
                                    DocuGardener will scan your GitHub installation to discover all accessible codebases.
                                </p>
                            </div>
                            <Button
                                onClick={handleSync}
                                disabled={syncing}
                                size="lg"
                                className="btn-premium h-16 px-12 gap-3 bg-primary text-primary-foreground font-black uppercase tracking-widest text-[11px] hover:bg-primary/90 transition-all shadow-xl shadow-primary/20"
                            >
                                {syncing ? 'Scanning GitHub...' : 'Start Discovery Scan'}
                                {!syncing && <ArrowRight className="w-4 h-4" />}
                            </Button>
                        </div>
                    ) : (
                        <div className="space-y-8">
                            <div className="space-y-3">
                                <div className="type-metadata font-black uppercase tracking-widest text-muted-foreground mb-4">
                                    Discovered {repos.length} Repositories
                                </div>
                                <div className="grid gap-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                                    {repos.map((repo) => (
                                        <div key={repo.id} className="flex items-center justify-between p-5 border border-border rounded-2xl bg-muted/20 hover:bg-muted/40 transition-colors">
                                            <div className="flex items-center gap-4">
                                                <div className="h-10 w-10 bg-card border border-border rounded-xl flex items-center justify-center font-black text-[12px] shadow-sm">
                                                    {repo.name.slice(0, 2).toUpperCase()}
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="font-bold text-sm text-foreground">{repo.name}</span>
                                                    <span className="text-[10px] text-muted-foreground font-black uppercase tracking-tighter">GitHub Repo</span>
                                                </div>
                                            </div>
                                            <Badge variant="outline" className="rounded-md border-fresh/30 bg-fresh/5 text-fresh font-black text-[9px] px-3 py-1 uppercase tracking-wider">
                                                CONNECTED
                                            </Badge>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="pt-6">
                                <Button
                                    onClick={onComplete}
                                    className="btn-premium w-full h-18 bg-foreground text-background font-black uppercase tracking-[0.2em] text-[12px] hover:bg-foreground/90 transition-all shadow-2xl"
                                >
                                    Enter Research Dashboard
                                    <CheckCircle2 className="w-5 h-5 ml-4" />
                                </Button>
                                <p className="text-center text-[10px] font-black text-muted-foreground mt-4 uppercase tracking-widest">
                                    All repositories are now monitored for semantic drift
                                </p>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
