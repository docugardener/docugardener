"use client"

import { useEffect, useState } from "react"
import { PauseCircle, PlayCircle, Trash2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"

interface Repo {
    id: string
    name: string
    enabled: boolean
    config: any
    updatedAt: string
}

import { RepoConfigModal } from "@/components/repos/RepoConfigModal"

export function RepoList() {
    const [repos, setRepos] = useState<Repo[]>([])
    const [loading, setLoading] = useState(true)
    const [toggling, setToggling] = useState<string | null>(null)

    useEffect(() => {
        fetch("/api/repos")
            .then((res) => res.json())
            .then((data) => {
                if (Array.isArray(data)) setRepos(data)
                setLoading(false)
            })
            .catch((err) => {
                console.error(err)
                setLoading(false)
            })
    }, [])

    const handleSync = async () => {
        setLoading(true)
        // GAP-E: capture POST response to surface plan warnings
        const postRes = await fetch("/api/repos", { method: "POST" })
        const postData = await postRes.json().catch(() => ({}))
        if (Array.isArray(postData?.warnings) && postData.warnings.length > 0) {
            for (const warning of postData.warnings) {
                toast.warning(warning, { duration: 8000 })
            }
        }

        // Re-fetch source of truth
        const res = await fetch("/api/repos")
        const data = await res.json()

        if (Array.isArray(data)) {
            // Deduplicate by ID to prevent backend mock issues
            const unique = Array.from(new Map(data.map((item: any) => [item.id, item])).values()) as Repo[]
            setRepos(unique)
        }
        setLoading(false)
    }

    const handleUpdate = (id: string, updates: any) => {
        setRepos(repos.map(r => r.id === id ? { ...r, ...updates } : r))
    }

    const handleDelete = async (repo: Repo) => {
        if (!confirm(`Remove "${repo.name}" from DocuGardener? This cannot be undone.`)) return
        try {
            const res = await fetch(`/api/repos/${repo.id}`, { method: "DELETE" })
            if (res.ok) {
                setRepos(prev => prev.filter(r => r.id !== repo.id))
            }
        } catch (err) {
            console.error("Failed to delete repo", err)
        }
    }

    const handleToggle = async (repo: Repo) => {
        setToggling(repo.id)
        try {
            const res = await fetch(`/api/repos/${repo.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ enabled: !repo.enabled }),
            })
            if (res.ok) {
                const updated = await res.json()
                setRepos(prev => prev.map(r => r.id === repo.id ? { ...r, enabled: updated.enabled } : r))
            }
        } catch (err) {
            console.error("Failed to toggle repo", err)
        } finally {
            setToggling(null)
        }
    }

    if (loading) return (
        <div className="bg-card p-6 rounded-card shadow-card-hover border border-border flex justify-center py-12 animate-pulse">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
    )

    return (
        <div className="space-y-6">
            <div className="flex flex-row items-center justify-between">
                <div>
                    <h2 className="type-table-header">Repositories</h2>
                    <p className="type-body text-muted-foreground">Manage analysis settings per repository.</p>
                </div>
                <Button onClick={handleSync} variant="outline" size="sm" className="btn-premium border-border text-foreground hover:bg-muted font-bold">
                    Sync Repositories
                </Button>
            </div>

            <div className="space-y-4">
                {repos.length === 0 ? (
                    <div className="text-center py-12 bg-muted/30 rounded-lg border border-dashed border-border text-muted-foreground">
                        No repositories connected.<br />
                        <span className="text-sm">Install the GitHub App to import repositories.</span>
                    </div>
                ) : (
                    repos.map((repo) => (
                        <div key={repo.id} className="flex items-center justify-between p-4 border border-border rounded-card hover:border-fresh/50 transition-colors bg-card">
                            <div className="flex flex-col">
                                <span className="font-medium text-foreground flex items-center gap-2">
                                    {repo.name}
                                    {!repo.enabled && <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded">Paused</span>}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                    Threshold: {(repo.config as any)?.threshold || 70} | Last updated: {new Date(repo.updatedAt).toLocaleDateString()}
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={toggling === repo.id}
                                    onClick={() => handleToggle(repo)}
                                    className={
                                        repo.enabled
                                            ? "text-muted-foreground hover:text-broken hover:bg-broken/10 font-bold"
                                            : "text-fresh hover:text-fresh/80 hover:bg-fresh/10 font-bold"
                                    }
                                    title={repo.enabled ? "Pause analysis for this repo" : "Resume analysis"}
                                >
                                    {toggling === repo.id ? (
                                        <span className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full inline-block" />
                                    ) : repo.enabled ? (
                                        <><PauseCircle className="w-4 h-4 mr-1" />Pause</>
                                    ) : (
                                        <><PlayCircle className="w-4 h-4 mr-1" />Resume</>
                                    )}
                                </Button>
                                <RepoConfigModal repo={repo} onUpdate={handleUpdate} />
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleDelete(repo)}
                                    className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                    title="Remove repository"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    )
}
