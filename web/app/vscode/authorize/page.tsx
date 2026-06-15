// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * UX-VSCODE-ONBOARD-01 — GET /vscode/authorize
 *
 * Entry point for the VS Code sign-in flow. Requires a NextAuth session (bounces
 * through sign-in if absent, returning here), validates the redirect_uri, and shows
 * a minimal consent screen. Approving mints a one-time code (via /api/vscode/grant)
 * and hands back to the editor.
 */
import { redirect } from "next/navigation"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { isAllowedRedirectUri } from "@/lib/vscode-auth-codes"
import { AuthorizeConsent } from "./AuthorizeConsent"

export const dynamic = "force-dynamic"

export default async function VscodeAuthorizePage({
    searchParams,
}: {
    searchParams: Promise<{ state?: string; redirect_uri?: string }>
}) {
    const sp = await searchParams
    const state = sp.state ?? ""
    const redirectUri = sp.redirect_uri ?? ""

    const session = await getServerSession(authOptions)
    if (!session) {
        const cb =
            `/vscode/authorize?state=${encodeURIComponent(state)}` +
            `&redirect_uri=${encodeURIComponent(redirectUri)}`
        redirect(`/api/auth/signin?callbackUrl=${encodeURIComponent(cb)}`)
    }

    // Reject unknown editor callback targets before showing consent (defense in depth;
    // the grant route enforces the same allowlist).
    if (!isAllowedRedirectUri(redirectUri) || !state) {
        return (
            <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
                <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
                    <h1 className="mb-2 text-xl font-bold text-gray-900">Invalid sign-in request</h1>
                    <p className="text-sm leading-relaxed text-gray-600">
                        This authorization link is malformed. Start the sign-in again from VS Code
                        (Command Palette → <strong>DocuGardener: Sign In</strong>).
                    </p>
                </div>
            </main>
        )
    }

    return (
        <AuthorizeConsent
            state={state}
            redirectUri={redirectUri}
            userEmail={(session.user as any)?.email ?? ""}
        />
    )
}
