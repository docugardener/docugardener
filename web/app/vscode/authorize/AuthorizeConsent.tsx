// SPDX-License-Identifier: AGPL-3.0-or-later
"use client"

import { useState } from "react"

interface Props {
    state: string
    redirectUri: string
    userEmail: string
}

/**
 * Minimal consent screen for the VS Code sign-in flow. On "Authorize" it asks the
 * server to mint a one-time code and then navigates to the editor's vscode:// URL.
 */
export function AuthorizeConsent({ state, redirectUri, userEmail }: Props) {
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState("")
    const [done, setDone] = useState(false)

    async function authorize() {
        setBusy(true)
        setError("")
        try {
            const res = await fetch("/api/vscode/grant", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ state, redirect_uri: redirectUri }),
            })
            if (!res.ok) {
                setError("Authorization failed. Please try again from VS Code.")
                setBusy(false)
                return
            }
            const data = await res.json()
            setDone(true)
            // Hand control back to the editor (opens VS Code via the vscode:// scheme).
            window.location.href = data.redirectUrl as string
        } catch {
            setError("Authorization failed. Please try again from VS Code.")
            setBusy(false)
        }
    }

    return (
        <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
            <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
                <div className="mb-6 flex items-center gap-2">
                    <span className="text-2xl">🌱</span>
                    <span className="text-lg font-black tracking-tight text-gray-900">DocuGardener</span>
                </div>

                {done ? (
                    <>
                        <h1 className="mb-2 text-xl font-bold text-gray-900">You&apos;re all set</h1>
                        <p className="text-sm leading-relaxed text-gray-600">
                            Returning you to VS Code… If it didn&apos;t open, switch back to your editor —
                            the extension is now signed in.
                        </p>
                    </>
                ) : (
                    <>
                        <h1 className="mb-2 text-xl font-bold text-gray-900">
                            Authorize DocuGardener for VS Code
                        </h1>
                        <p className="mb-6 text-sm leading-relaxed text-gray-600">
                            The VS Code extension is requesting access to run documentation drift
                            checks on your account
                            {userEmail ? (
                                <>
                                    {" "}(<span className="font-medium text-gray-800">{userEmail}</span>)
                                </>
                            ) : null}
                            . It will receive a plugin API key scoped to your workspace.
                        </p>

                        {error && (
                            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                                {error}
                            </div>
                        )}

                        <div className="flex gap-3">
                            <button
                                onClick={authorize}
                                disabled={busy}
                                className="flex-1 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-green-700 disabled:opacity-60"
                            >
                                {busy ? "Authorizing…" : "Authorize"}
                            </button>
                            <a
                                href="/dashboard"
                                className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-center text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                            >
                                Cancel
                            </a>
                        </div>
                    </>
                )}
            </div>
        </main>
    )
}
