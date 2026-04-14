"use client"

import { useRouter } from "next/navigation"
import { XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function CheckoutCancelPage() {
    const router = useRouter()

    return (
        <div className="min-h-screen bg-background flex items-center justify-center font-sans text-foreground">
            <div className="text-center max-w-md px-6 space-y-6">
                <div className="flex justify-center">
                    <XCircle className="h-12 w-12 text-muted-foreground" />
                </div>
                <div>
                    <h1 className="text-2xl font-black tracking-tight mb-2">Upgrade cancelled</h1>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                        No charges were made. You can upgrade whenever you're ready.
                    </p>
                </div>
                <div className="flex gap-3 justify-center">
                    <Button
                        variant="outline"
                        onClick={() => router.push("/dashboard")}
                        className="text-[10px] font-black uppercase tracking-widest"
                    >
                        Back to Dashboard
                    </Button>
                    <Button
                        onClick={() => router.push("/pricing")}
                        className="text-[10px] font-black uppercase tracking-widest"
                    >
                        View Plans
                    </Button>
                </div>
            </div>
        </div>
    )
}
