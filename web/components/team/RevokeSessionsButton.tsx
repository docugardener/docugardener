"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { ShieldOff } from "lucide-react"
import { toast } from "sonner"

/**
 * ENT-12: Revoke all active sessions for the tenant.
 * Sets Tenant.sessionsRevokedAt = now(). All existing JWTs
 * issued before that moment will be rejected on next use,
 * forcing every user (including the caller) to re-authenticate.
 */
export function RevokeSessionsButton() {
    const [loading, setLoading] = useState(false)

    async function handleRevoke() {
        const confirmed = window.confirm(
            "This will immediately sign out ALL team members. You will also be signed out. Continue?"
        )
        if (!confirmed) return

        setLoading(true)
        try {
            const res = await fetch("/api/admin/sessions", { method: "POST" })
            if (!res.ok) {
                const text = await res.text()
                toast.error("Failed to revoke sessions", { description: text })
                return
            }
            const data = await res.json()
            toast.success("All sessions revoked", {
                description: `Sessions issued before ${new Date(data.revokedAt).toLocaleString()} are invalidated. Signing you out…`,
            })
            // Sign the caller out after a short delay so they see the toast
            setTimeout(() => {
                window.location.href = "/api/auth/signout?callbackUrl=/"
            }, 2500)
        } catch (err: any) {
            toast.error("Error revoking sessions", { description: err.message })
        } finally {
            setLoading(false)
        }
    }

    return (
        <Button
            variant="outline"
            size="sm"
            onClick={handleRevoke}
            disabled={loading}
            className="gap-2 shrink-0 border-destructive/50 text-destructive hover:bg-destructive/10 hover:border-destructive"
        >
            <ShieldOff className="h-3.5 w-3.5" />
            {loading ? "Revoking…" : "Revoke All Sessions"}
        </Button>
    )
}
