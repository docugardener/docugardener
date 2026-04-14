"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

export function GitHubAppForm({ initialAppId }: { initialAppId: string }) {
    const [currentInitialAppId, setCurrentInitialAppId] = useState(initialAppId || "")
    const [appId, setAppId] = useState(currentInitialAppId)
    const [privateKey, setPrivateKey] = useState("")
    const [loading, setLoading] = useState(false)

    const isDirty = appId !== currentInitialAppId || privateKey !== ""

    const handleSave = async () => {
        setLoading(true)
        try {
            await fetch("/api/settings", {
                method: "POST",
                body: JSON.stringify({
                    githubAppId: appId,
                    githubPrivateKey: privateKey
                })
            })
            setCurrentInitialAppId(appId)
            setPrivateKey("")
            toast.success("Credentials updated!")
        } catch (error) {
            console.error(error)
            alert("Failed to update credentials")
        } finally {
            setLoading(false)
        }
    }
    const handleReset = () => {
        setAppId(currentInitialAppId)
        setPrivateKey("")
        toast.info("Changes discarded")
    }

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-start">
                <div className="md:col-span-1 space-y-2">
                    <Label className="text-xs uppercase tracking-widest font-bold text-muted-foreground">App ID</Label>
                    <Input
                        value={appId}
                        onChange={(e) => setAppId(e.target.value)}
                        placeholder="123456"
                        className="font-mono"
                    />
                </div>
                <div className="md:col-span-3 space-y-2">
                    <Label className="text-xs uppercase tracking-widest font-bold text-muted-foreground">Private Key (.pem content)</Label>
                    <textarea
                        className="flex min-h-[120px] w-full rounded-xl border border-border bg-card px-3 py-2 text-sm font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 text-foreground"
                        rows={6}
                        placeholder="-----BEGIN RSA PRIVATE KEY-----..."
                        value={privateKey}
                        onChange={(e) => setPrivateKey(e.target.value)}
                    />
                    <p className="text-[10px] text-muted-foreground italic">Leave blank to keep existing key.</p>
                </div>
            </div>

            <div className="flex flex-col md:flex-row justify-between items-center gap-4 pt-6 border-t border-border mt-6">
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-fresh animate-pulse" />
                    <a href="/onboarding" className="text-[10px] font-bold uppercase tracking-widest text-primary hover:underline">Re-run Installation Wizard</a>
                </div>
                <div className="flex gap-3 w-full md:w-auto">
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={handleReset}
                        disabled={!isDirty || loading}
                        className="text-muted-foreground hover:text-foreground hover:bg-muted flex-1 md:flex-none"
                    >
                        Reset
                    </Button>
                    <Button
                        onClick={handleSave}
                        disabled={!isDirty || loading}
                        className="btn-premium bg-primary hover:bg-primary/90 text-primary-foreground min-w-[150px] flex-1 md:flex-none font-bold uppercase tracking-widest text-[10px]"
                    >
                        {loading ? "Saving..." : "Update Credentials"}
                    </Button>
                </div>
            </div>
        </div>
    )
}
