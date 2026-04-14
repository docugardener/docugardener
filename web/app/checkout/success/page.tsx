"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function CheckoutSuccessPage() {
    const router = useRouter()

    // Redirect to billing after a short delay so the user sees the confirmation
    useEffect(() => {
        const timer = setTimeout(() => {
            router.push("/dashboard/billing?upgraded=true")
        }, 4000)
        return () => clearTimeout(timer)
    }, [router])

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
                <Button
                    onClick={() => router.push("/dashboard/billing?upgraded=true")}
                    className="text-[10px] font-black uppercase tracking-widest"
                >
                    Go to Billing
                </Button>
            </div>
        </div>
    )
}
