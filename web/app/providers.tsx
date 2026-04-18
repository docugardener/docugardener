// SPDX-License-Identifier: AGPL-3.0-or-later
"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"
import { SessionProvider } from "next-auth/react"
import { initPostHog, captureEvent } from "@/lib/posthog"

function PostHogPageView() {
    const pathname = usePathname()

    // Initialise once on mount
    useEffect(() => {
        initPostHog()
    }, [])

    // Capture pageview on every route change
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
