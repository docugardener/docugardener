// SPDX-License-Identifier: AGPL-3.0-or-later
"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"
import { SessionProvider } from "next-auth/react"
import { initPostHog, captureEvent } from "@/lib/posthog"

const CONSENT_KEY = "dg-cookie-consent"

function PostHogPageView() {
    const pathname = usePathname()

    // Initialise only after cookie consent is given.
    // The CookieBanner sets dg-cookie-consent in localStorage when the user
    // clicks "Got it". We poll once on mount; if consent was already given
    // in a previous session PostHog starts immediately.
    useEffect(() => {
        if (localStorage.getItem(CONSENT_KEY)) {
            initPostHog()
        }
    }, [])

    // Capture pageview on every route change (no-op if not yet initialised)
    useEffect(() => {
        if (!pathname) return
        captureEvent("$pageview", { $current_url: window.location.href })
    }, [pathname])

    return null
}

export function Providers({ children }: { children: React.ReactNode }) {
    return (
        <SessionProvider>
            <PostHogPageView />
            {children}
        </SessionProvider>
    )
}
