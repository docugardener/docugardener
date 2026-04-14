// SPDX-License-Identifier: AGPL-3.0-or-later
"use client"

/**
 * ENT-12: SAML SSO completion page.
 *
 * FastAPI redirects here after successfully validating the SAML assertion:
 *   /auth/saml-complete?token=<exchange_token>&tenant_id=<id>
 *
 * This page calls NextAuth signIn("saml-sso") with the exchange token.
 * NextAuth calls the saml-sso CredentialsProvider which validates the token
 * against FastAPI /auth/saml/exchange and returns the user.
 */

import { useEffect, useState, Suspense } from "react"
import { signIn } from "next-auth/react"
import { useSearchParams, useRouter } from "next/navigation"
import Link from "next/link"

function SamlCompleteInner() {
    const searchParams = useSearchParams()
    const router = useRouter()
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const token = searchParams.get("token")
        if (!token) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setError("Missing exchange token — SAML sign-in failed.")
            return
        }

        signIn("saml-sso", {
            token,
            redirect: false,
            callbackUrl: "/dashboard",
        }).then((result) => {
            if (result?.ok) {
                router.replace("/dashboard")
            } else {
                setError(result?.error ?? "SAML sign-in failed. Please try again.")
            }
        })
    }, [searchParams, router])

    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="max-w-sm w-full rounded-lg border border-destructive/50 bg-destructive/10 p-8 text-center space-y-4">
                    <p className="text-sm font-semibold text-destructive">SSO Error</p>
                    <p className="text-xs text-muted-foreground">{error}</p>
                    <Link href="/auth/signin" className="text-xs underline text-primary">
                        Back to sign in
                    </Link>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-background">
            <div className="text-center space-y-3">
                <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-sm text-muted-foreground">Completing sign-in…</p>
            </div>
        </div>
    )
}

export default function SamlCompletePage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
        }>
            <SamlCompleteInner />
        </Suspense>
    )
}
