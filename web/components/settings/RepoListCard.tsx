// SPDX-License-Identifier: AGPL-3.0-or-later
"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { RefreshCw, GitBranch, Check, X, Loader2, AlertTriangle, Lock } from "lucide-react"
import Link from "next/link"
import { UpgradeContextCard } from "@/components/billing/UpgradeContextCard"

interface Repo {
    id: string
    name: string
    enabled: boolean
    githubRepoId: string
}

interface RepoListCardProps {
    initialRepos: Repo[]
    plan: string
}

export function RepoListCard({ initialRepos, plan }: RepoListCardProps) {
    const [repos, setRepos] = useState<Repo[]>(initialRepos)
    const [syncing, setSyncing] = useState(false)
    const [warnings, setWarnings] = useState<string[]>([])
    const [toggling, setToggling] = useState<string | null>(null)

    const isFree = plan === "FREE"

    async function handleSync() {
        setSyncing(true)
        setWarnings([])
        try {
            const res = await fetch("/api/repos", { method: "POST" })
            const data = await res.json()
            if (!res.ok) {
                toast.error("Sync failed", { description: data.error })
                return
            }
            setRepos(data.repositories ?? [])
            if (data.warnings?.length) setWarnings(data.warnings)
            toast.success(`${data.count} repo${data.count !== 1 ? "s" : ""} synced`)
        } catch {
            toast.error("Sync failed — check your GitHub App credentials")
        } finally {
            setSyncing(false)
        }
    }

    async function handleToggle(repo: Repo) {
        setToggling(repo.id)
        const newEnabled = !repo.enabled
        try {
            const res = await fetch(`/api/repos/${repo.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ enabled: newEnabled }),
            })
            if (!res.ok) {
                toast.error("Failed to update repository")
                return
            }
            setRepos(prev => prev.map(r => r.id === repo.id ? { ...r, enabled: newEnabled } : r))
            toast.success(`${repo.name} ${newEnabled ? "enabled" : "disabled"}`)
        } catch {
            toast.error("Failed to update repository")
        } finally {
            setToggling(null)
        }
    }

    return (
        <div className="space-y-4">
            {/* Header row */}
            <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                    {repos.length === 0
                        ? "No repositories synced yet."
                        : `${repos.length} repo${repos.length !== 1 ? "s" : ""} — ${repos.filter(r => r.enabled).length} active`}
                </p>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSync}
                    disabled={syncing}
                    className="gap-1.5"
                >
                    {syncing
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <RefreshCw className="w-3.5 h-3.5" />}
                    {syncing ? "Syncing…" : "Sync Repositories"}
                </Button>
            </div>

            {/* Plan warnings */}
            {warnings.map((w, i) => (
                <div key={i} className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-4 py-3 text-xs text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>{w}{" "}
                        <Link href="/dashboard/billing" className="underline font-semibold">Upgrade to Pro</Link>
                    </span>
                </div>
            ))}

            {/* FREE plan private-repo note */}
            {isFree && (
              <UpgradeContextCard
                title="Private Repository Monitoring"
                description="Monitor private repos on any branch — DocuGardener analyses PRs just like public repos, with all data scoped to your tenant."
                persona="Teams shipping proprietary products on GitHub"
                outcomes={[
                  "Catch documentation drift in private repos before it reaches production code reviews",
                  "Apply the same drift detection policies across public and private repos uniformly",
                ]}
                requiredPlan="PRO"
              />
            )}

            {/* Repo list */}
            {repos.length === 0 ? (
                <div className="rounded-md border border-dashed border-border bg-muted/30 py-10 text-center">
                    <GitBranch className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground font-medium">No repositories found</p>
                    <p className="text-xs text-muted-foreground mt-1">Click <span className="font-semibold">Sync Repositories</span> to import repos from GitHub.</p>
                </div>
            ) : (
                <div className="divide-y divide-border rounded-md border border-border overflow-hidden">
                    {repos.map(repo => (
                        <div key={repo.id} className="flex items-center justify-between px-4 py-3 bg-card hover:bg-muted/30 transition-colors">
                            <div className="flex items-center gap-3">
                                <GitBranch className="w-4 h-4 text-muted-foreground shrink-0" />
                                <span className="text-sm font-medium text-foreground">{repo.name}</span>
                                <span className={`inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                                    repo.enabled
                                        ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                                        : "bg-muted text-muted-foreground border-border"
                                }`}>
                                    {repo.enabled
                                        ? <><Check className="w-2.5 h-2.5" /> Connected</>
                                        : <><X className="w-2.5 h-2.5" /> Disabled</>}
                                </span>
                            </div>
                            <Button
                                variant={repo.enabled ? "outline" : "default"}
                                size="sm"
                                className="h-7 text-xs"
                                disabled={toggling === repo.id}
                                onClick={() => handleToggle(repo)}
                            >
                                {toggling === repo.id
                                    ? <Loader2 className="w-3 h-3 animate-spin" />
                                    : repo.enabled ? "Disable" : "Enable"}
                            </Button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
