// SPDX-License-Identifier: AGPL-3.0-or-later
"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { OnboardingProgress } from "@/components/onboarding/OnboardingProgress"
import { WebhookUrlWarning } from "@/components/onboarding/WebhookUrlWarning"
import { Check, ArrowRight, Plug, Upload, ChevronDown } from "lucide-react"
import { Analytics } from "@/lib/posthog"

export default function Onboarding() {
    const formRef = useRef<HTMLFormElement>(null)
    const router = useRouter()
    const { update: updateSession, status } = useSession()
    const [showManual, setShowManual] = useState(false)
    const prefillFetched = useRef(false)

    // Manual Form State — hooks must precede any early return
    const [appId, setAppId] = useState("")
    const [privateKey, setPrivateKey] = useState("")
    const [webhookSecret, setWebhookSecret] = useState("")
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState("")
    const fileInputRef = useRef<HTMLInputElement>(null)

    // Generate a random 4-char hex string to avoid globally unique name collisions
    const randomHex = useRef(Math.floor(Math.random() * 65535).toString(16).padStart(4, '0')).current

    // Redirect to sign-in if not authenticated
    if (status === "unauthenticated") {
        router.replace("/auth/signin?callbackUrl=/onboarding")
        return null
    }
    if (status === "loading") {
        return <div className="flex min-h-screen items-center justify-center text-sm text-gray-500">Loading…</div>
    }

    async function fetchPrefill() {
        if (prefillFetched.current) return
        prefillFetched.current = true
        try {
            const res = await fetch("/api/onboarding/github-app-prefill")
            if (!res.ok) return
            const data = await res.json()
            if (data.appId && !appId) setAppId(data.appId)
            if (data.webhookSecret && !webhookSecret) setWebhookSecret(data.webhookSecret)
            if (data.privateKey && !privateKey) setPrivateKey(data.privateKey)
        } catch {
            // ignore — pre-fill is best-effort
        }
    }

    function handlePemFile(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = (ev) => setPrivateKey((ev.target?.result as string) ?? "")
        reader.readAsText(file)
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000')
    const webhookUrl = process.env.NEXT_PUBLIC_WEBHOOK_URL || `${appUrl}/api/webhooks/github`

    const manifest = {
        name: `DocuGardener-${randomHex}`,
        url: appUrl,
        hook_attributes: {
            url: webhookUrl,
            active: true,
        },
        redirect_url: `${appUrl}/api/github/manifest/callback`,
        // After installation GitHub redirects back here with ?installation_id=
        setup_url: `${appUrl}/onboarding/repos`,
        setup_on_update: true,
        public: false,
        default_permissions: {
            contents: "read",
            pull_requests: "write",
            checks: "write",
            metadata: "read"
        },
        default_events: ["pull_request", "check_run"]
    }

    const handleManualConnect = async () => {
        Analytics.installStarted({ method: "manual" })
        setLoading(true)
        setError("")
        try {
            const res = await fetch("/api/onboarding/connect", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ appId, privateKey, webhookSecret })
            })

            if (res.ok) {
                await updateSession()
                // Go to repo selection (step 2) instead of dashboard
                router.push("/onboarding/repos")
                router.refresh()
            } else {
                const txt = await res.text()
                setError(txt || "Connection failed")
            }
        } catch {
            setError("Internal Error")
        } finally {
            setLoading(false)
        }
    }

    const errorParam = typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get("error")
        : null

    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-6">
            <div className="w-full max-w-lg space-y-8">
                {/* Logo */}
                <div className="text-center">
                    <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">DocuGardener</h1>
                    <p className="mt-2 text-sm text-gray-500">Automated Documentation Drift Detection</p>
                </div>

                {/* Progress */}
                <div className="flex justify-center">
                    <OnboardingProgress currentStep={1} />
                </div>

                <div className="space-y-2">
                    <h2 className="text-base font-black text-gray-900">Connect your GitHub App</h2>
                    <p className="text-sm text-gray-500">
                        DocuGardener needs a GitHub App to watch pull requests and post drift analysis as check runs.
                    </p>
                </div>

                {/* Error from callback redirect */}
                {errorParam && (
                    <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm border border-red-100">
                        {errorParam}
                    </div>
                )}

                {/* Wizard card — primary path */}
                <Card className="border-2 border-primary/10 shadow-xl">
                    <CardHeader>
                        <div className="flex items-center gap-2 mb-2">
                            <Badge variant="outline" className="bg-primary/10 text-primary border-0">Recommended</Badge>
                            <Badge variant="outline" className="text-gray-400 border-gray-200">~2 min</Badge>
                        </div>
                        <CardTitle>Auto-setup</CardTitle>
                        <CardDescription>
                            We pre-configure all permissions, webhook events, and redirect URLs.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 space-y-1">
                            {["Read code", "Write PRs & check runs", "Webhook routing"].map((item) => (
                                <div key={item} className="flex items-center gap-2 text-sm text-blue-800">
                                    <Check className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                                    {item}
                                </div>
                            ))}
                        </div>
                    </CardContent>
                    <CardFooter className="flex-col gap-3">
                        <WebhookUrlWarning />
                        <form
                            ref={formRef}
                            action="https://github.com/settings/apps/new"
                            method="post"
                            className="w-full"
                            onSubmit={() => Analytics.installStarted({ method: "auto" })}
                        >
                            <input type="hidden" name="manifest" value={JSON.stringify(manifest)} />
                            <Button type="submit" size="lg" className="w-full group">
                                Create &amp; Install GitHub App
                                <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                            </Button>
                        </form>
                    </CardFooter>
                </Card>

                {/* Manual mode — collapsed by default */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <button
                        type="button"
                        onClick={() => { setShowManual((v) => !v); fetchPrefill() }}
                        className="w-full flex items-center justify-between px-5 py-3 text-sm text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition-colors"
                        aria-expanded={showManual}
                    >
                        <span className="flex items-center gap-2 font-medium">
                            <Plug className="w-4 h-4" />
                            Already have a GitHub App?
                        </span>
                        <ChevronDown className={`w-4 h-4 transition-transform ${showManual ? "rotate-180" : ""}`} />
                    </button>

                    {showManual && (
                        <div className="border-t border-gray-100 px-5 py-5 space-y-4">
                            <p className="text-xs text-gray-400">
                                Enter credentials from an existing GitHub App — found in GitHub Developer Settings › GitHub Apps.
                            </p>
                            {error && (
                                <div className="bg-red-50 text-red-600 p-3 rounded text-sm">{error}</div>
                            )}
                            <div className="space-y-2">
                                <Label>App ID</Label>
                                <Input
                                    value={appId}
                                    onChange={(e) => setAppId(e.target.value)}
                                    placeholder="e.g. 1029384"
                                />
                            </div>
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label>Private Key (.pem)</Label>
                                    <button
                                        type="button"
                                        onClick={() => fileInputRef.current?.click()}
                                        className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900"
                                    >
                                        <Upload className="w-3 h-3" />
                                        Choose file
                                    </button>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept=".pem,.key"
                                        className="hidden"
                                        onChange={handlePemFile}
                                    />
                                </div>
                                <textarea
                                    className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                    rows={5}
                                    placeholder="-----BEGIN RSA PRIVATE KEY-----&#10;Paste key content or use Choose file above&#10;-----END RSA PRIVATE KEY-----"
                                    value={privateKey}
                                    onChange={(e) => setPrivateKey(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Webhook Secret <span className="text-gray-400 font-normal">(optional)</span></Label>
                                <Input
                                    type="password"
                                    value={webhookSecret}
                                    onChange={(e) => setWebhookSecret(e.target.value)}
                                    placeholder="From GitHub App → Webhook settings"
                                />
                            </div>
                            <Button onClick={handleManualConnect} disabled={loading} size="lg" className="w-full">
                                {loading ? "Verifying..." : "Connect App"}
                            </Button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
