// SPDX-License-Identifier: AGPL-3.0-or-later
// SEC-OWN-01: Owner access token challenge form.
// Rendered by /admin/owner/layout.tsx when the HMAC cookie is missing or invalid.
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Lock } from "lucide-react"

export default function OwnerChallenge() {
  const router = useRouter()
  const [token, setToken] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await fetch("/api/admin/owner/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      })
      if (res.ok) {
        router.refresh()
      } else {
        const json = (await res.json()) as { error?: string }
        setError(json.error === "invalid_token" ? "Invalid access token." : "Authentication failed.")
      }
    } catch {
      setError("Network error. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white border border-gray-200 rounded-xl p-8 w-full max-w-sm shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-lg bg-green-50 flex items-center justify-center">
            <Lock className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-gray-400">DocuGardener</p>
            <p className="text-sm font-bold text-gray-800">Owner Console</p>
          </div>
        </div>

        <p className="text-sm text-gray-600 mb-5">
          Enter your owner access token to continue. This token is separate from your login
          password and provides a second layer of protection.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="owner-token" className="block text-xs font-medium text-gray-700 mb-1">
              Access Token
            </label>
            <input
              id="owner-token"
              type="password"
              autoComplete="off"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="OWNER_ACCESS_TOKEN value"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent font-mono"
              disabled={loading}
              required
            />
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !token}
            className="w-full py-2 px-4 text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
          >
            {loading ? "Verifying…" : "Verify & Enter"}
          </button>
        </form>

        <p className="mt-4 text-xs text-gray-400 text-center">
          Set <code className="font-mono">OWNER_ACCESS_TOKEN</code> in your environment.
        </p>
      </div>
    </div>
  )
}
