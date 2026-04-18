// SPDX-License-Identifier: AGPL-3.0-or-later
"use client"

import { Suspense, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { CheckCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Analytics } from "@/lib/posthog"

// useSearchParams must be inside a Suspense boundary for static generation
function CheckoutSuccessInner() {
    const router = useRouter()
    const searchParams = useSearchParams()

    // Fire subscription_started once on mount — this page is only reached after
    // a successful Stripe Checkout session, so it's the canonical conversion point.
    useEffect(() => {
        const sessionId = searchParams.get("session_id")
        Analytics.subscriptionStarted({ stripe_session_id: sessionId ?? undefined })
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Redirect to billing after a short delay so the user sees the confirmation
    useEffect(() => {
        const timer = setTimeout(() => {
            router.push("/dashboard/billing?upgraded=true")
        }, 4000)
        return () => clearTimeout(timer)
    }, [router])

    return (
        <Button
            onClick={() => router.push("/dashboard/billing?upgraded=true")}
            className="text-[10px] font-black uppercase tracking-widest"
        >
            Go to Billing
        </Button>
    )
}

export default function CheckoutSuccessPage() {
    return (
        <div className="min-h-screen bg-background flex items-center justify-center font-sans text-foreground">
            <div className="text-center max-w-md px-6 space-y-6">
                <div className="flex justify-center">
                    <CheckCircle className="h-16 w-16 text-emerald-500" />
                </div>
                <div>
                    <h1 className="text-2xl font-black tracking-tight mb-2">Subscription activated!</h1>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                        Your plan has been upgraded. It may take a few seconds for your new limits to apply.
                        You'll be redirected to your billing page shortly.
                    </p>
                </div>
                <Suspense fallback={null}>
                    <CheckoutSuccessInner />
                </Suspense>
            </div>
        </div>
    )
}
