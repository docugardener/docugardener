// SPDX-License-Identifier: AGPL-3.0-or-later
"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useSession } from "next-auth/react"
import { Suspense } from "react"
import { OnboardingProgress } from "@/components/onboarding/OnboardingProgress"
import { Button } from "@/components/ui/button"
import { Loader2, AlertTriangle, ExternalLink } from "lucide-react"
import { Analytics } from "@/lib/posthog"

interface Repo {
  id: string
  name: string
  enabled: boolean
  githubRepoId: string
}

function ReposInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { status } = useSession()

  const [repos, setRepos] = useState<Repo[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notInstalled, setNotInstalled] = useState(false)
  const [warnings, setWarnings] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const didSync = useRef(false)
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/auth/signin?callbackUrl=/onboarding/repos")
      return
    }
    if (status !== "authenticated") return
    if (didSync.current) return
    didSync.current = true

    const installationId = searchParams.get("installation_id")

    async function run() {
      try {
        // Save installationId if GitHub redirected here with one
        if (installationId) {
          const res = await fetch("/api/onboarding/installation", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ installationId }),
          })
          if (!res.ok) {
            const body = await res.json()
            setError(body.error ?? "Failed to save installation ID.")
            setLoading(false)
            return
          }
        }

        // Sync repos from GitHub App installation
        const syncRes = await fetch("/api/repos", { method: "POST" })
        const syncBody = await syncRes.json()
        if (!syncRes.ok) {
          if (syncBody.code === "APP_NOT_INSTALLED") {
            setNotInstalled(true)
            setLoading(false)
            // Poll every 5s until the installation webhook arrives
            pollRef.current = setTimeout(() => {
              didSync.current = false
              setLoading(true)
              setNotInstalled(false)
              run()
            }, 5000)
            return
          }
          setError(syncBody.error ?? "Failed to sync repositories.")
          setLoading(false)
          return
        }
        if (syncBody.warnings?.length) {
          setWarnings(syncBody.warnings)
          // Repo limit hit — user saw plan-gating during repo sync
          Analytics.repoLimitHit({ warning_count: syncBody.warnings.length })
        }

        // Fetch the list to display
        const listRes = await fetch("/api/repos")
        const listBody = await listRes.json()
        const repoList: Repo[] = Array.isArray(listBody) ? listBody : []
        setRepos(repoList)
        // Pre-select all enabled repos
        setSelected(new Set(repoList.filter((r) => r.enabled).map((r) => r.id)))
      } catch {
        setError("Network error. You can skip for now and configure repos in Settings.")
      } finally {
        setLoading(false)
      }
    }

    run()
    return () => { if (pollRef.current) clearTimeout(pollRef.current) }
  }, [status, searchParams, router])

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSkip = () => router.push("/dashboard")

  const handleEnable = async () => {
    setSaving(true)
    try {
      // Disable repos that were not selected
      const toDisable = repos.filter((r) => !selected.has(r.id))
      await Promise.all(
        toDisable.map((r) =>
          fetch(`/api/repos/${r.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ enabled: false }),
          })
        )
      )
      router.push("/dashboard")
    } catch {
      setError("Failed to save repo selection. Try again or skip.")
      setSaving(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-lg space-y-8">
        {/* Logo */}
        <div className="text-center">
          <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">DocuGardener</h1>
        </div>

        {/* Progress */}
        <div className="flex justify-center">
          <OnboardingProgress currentStep={2} />
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 space-y-6">
          <div>
            <h2 className="text-lg font-black text-gray-900">Which repos should DocuGardener watch?</h2>
            <p className="text-sm text-gray-500 mt-1">
              You can add or remove repos later in{" "}
              <a href="/dashboard/settings" className="underline text-gray-700">
                Settings → Repositories
              </a>
              .
            </p>
          </div>

          {loading && (
            <div role="status" className="flex items-center justify-center py-10 text-gray-400 gap-2">
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
              <span className="text-sm">Syncing repositories…</span>
            </div>
          )}

          {!loading && notInstalled && (
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-100 rounded-lg p-4">
              <Loader2 className="w-4 h-4 text-amber-500 shrink-0 mt-0.5 animate-spin" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-amber-800">Waiting for GitHub App installation…</p>
                <p className="text-xs text-amber-700">
                  Install your GitHub App on at least one repository, then this page will update automatically.
                </p>
                <a
                  href="https://github.com/settings/installations"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-amber-800 underline underline-offset-2 font-medium"
                >
                  Manage GitHub App installations <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          )}

          {!loading && !notInstalled && error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-lg p-4">
              <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {!loading && warnings.length > 0 && (
            <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 space-y-1">
              {warnings.map((w, i) => (
                <p key={i} className="text-xs text-amber-700">{w}</p>
              ))}
            </div>
          )}

          {!loading && !error && repos.length === 0 && (
            <div className="py-6 text-center text-sm text-gray-500">
              No repositories found. Make sure the GitHub App is installed on at least one repo.{" "}
              <a
                href="https://github.com/settings/installations"
                target="_blank"
                rel="noopener noreferrer"
                className="underline text-gray-700"
              >
                Manage installations →
              </a>
            </div>
          )}

          {!loading && repos.length > 0 && (
            <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg overflow-hidden">
              {repos.map((repo) => (
                <li key={repo.id}>
                  <label className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selected.has(repo.id)}
                      onChange={() => toggle(repo.id)}
                      className="w-4 h-4 accent-green-600"
                    />
                    <span className="text-sm font-medium text-gray-800">{repo.name}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}

          <p className="text-[11px] text-gray-400">
            DocuGardener analyses PRs on push. No changes are made to your code.
          </p>
        </div>

        <div className="flex justify-between items-center">
          <Button variant="ghost" onClick={handleSkip} disabled={saving}>
            Skip →
          </Button>
          <Button
            onClick={handleEnable}
            disabled={selected.size === 0 || loading || saving}
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Saving…
              </>
            ) : (
              "Enable selected →"
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function OnboardingReposPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-gray-50">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      }
    >
      <ReposInner />
    </Suspense>
  )
}
