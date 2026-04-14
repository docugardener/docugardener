"use client"

import { useState, Suspense } from "react"
import { signIn } from "next-auth/react"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Github, Mail, ArrowRight, Loader2, Building2 } from "lucide-react"

const IS_DEV = process.env.NEXT_PUBLIC_DEV_LOGIN === "true"

function DevLoginPanel({ callbackUrl }: { callbackUrl: string }) {
    const [devEmail, setDevEmail] = useState("")
    return (
        <div className="mt-6 border-t border-dashed border-gray-300 pt-4">
            <p className="text-xs text-center text-amber-600 font-medium mb-2">⚠️ Dev login — local only</p>
            <div className="flex gap-2">
                <Input
                    id="dev-login-email"
                    type="email"
                    placeholder="user@test.local"
                    value={devEmail}
                    onChange={e => setDevEmail(e.target.value)}
                    className="text-sm"
                />
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => signIn("dev-login", { email: devEmail, callbackUrl })}
                    disabled={!devEmail.trim()}
                >
                    Dev Login
                </Button>
            </div>
        </div>
    )
}

function SignInInner() {
    const searchParams = useSearchParams()
    const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard"
    const error = searchParams.get("error")
    const isSignup = searchParams.get("signup") === "1"

    const [email, setEmail] = useState("")
    const [emailSent, setEmailSent] = useState(false)
    const [emailLoading, setEmailLoading] = useState(false)
    const [emailError, setEmailError] = useState("")

    const [ssoEmail, setSsoEmail] = useState("")
    const [ssoLoading, setSsoLoading] = useState(false)
    const [ssoError, setSsoError] = useState("")
    const [showSso, setShowSso] = useState(false)

    const handleSsoSignIn = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!ssoEmail.trim()) return
        setSsoLoading(true)
        setSsoError("")
        try {
            const res = await fetch(`/api/auth/sso-lookup?email=${encodeURIComponent(ssoEmail.trim())}`)
            const data = await res.json()
            if (!res.ok) {
                setSsoError(data.error ?? "SSO not configured for this domain.")
                return
            }
            window.location.href = data.loginUrl
        } catch {
            setSsoError("Something went wrong. Please try again.")
        } finally {
            setSsoLoading(false)
        }
    }

    const handleEmailSignIn = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!email.trim()) return
        setEmailLoading(true)
        setEmailError("")
        try {
            const res = await signIn("email", {
                email: email.trim(),
                callbackUrl,
                redirect: false,
            })
            if (res?.error) {
                setEmailError("Could not send the magic link. Please try again.")
            } else {
                setEmailSent(true)
            }
        } catch {
            setEmailError("Something went wrong. Please try again.")
        } finally {
            setEmailLoading(false)
        }
    }

    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-6">
            <div className="w-full max-w-sm space-y-8">
                {/* Logo */}
                <div className="text-center">
                    <h1 className="text-4xl font-extrabold tracking-tight text-gray-900">DocuGardener</h1>
                    <p className="mt-2 text-sm text-gray-500">Automated Documentation Drift Detection</p>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 space-y-6">
                    <h2 className="text-lg font-semibold text-gray-900 text-center">
                      {isSignup ? "Create your free account" : "Sign in to your workspace"}
                    </h2>
                    {isSignup && (
                      <p className="text-xs text-center text-gray-400">Free plan · No credit card needed</p>
                    )}

                    {error && (
                        <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg border border-red-100">
                            {error === "OAuthAccountNotLinked"
                                ? "This email is already linked to a different sign-in method."
                                : "Sign in failed. Please try again."}
                        </div>
                    )}

                    {/* GitHub */}
                    <Button
                        onClick={() => signIn("github", { callbackUrl })}
                        className="w-full flex items-center gap-2 justify-center"
                        size="lg"
                    >
                        <Github className="w-4 h-4" />
                        Continue with GitHub
                    </Button>

                    {/* Divider */}
                    <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-gray-200" />
                        </div>
                        <div className="relative flex justify-center text-xs text-gray-400 uppercase tracking-wide">
                            <span className="bg-white px-3">or</span>
                        </div>
                    </div>

                    {/* Email magic link */}
                    {emailSent ? (
                        <div className="text-center space-y-2">
                            <div className="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center mx-auto">
                                <Mail className="w-5 h-5 text-green-600" />
                            </div>
                            <p className="text-sm font-medium text-gray-900">Check your email</p>
                            <p className="text-xs text-gray-500">
                                We sent a magic link to <strong>{email}</strong>.<br />
                                It expires in 10 minutes.
                            </p>
                            <button
                                onClick={() => { setEmailSent(false); setEmail("") }}
                                className="text-xs text-gray-400 hover:text-gray-600 underline mt-2"
                            >
                                Use a different email
                            </button>
                        </div>
                    ) : (
                        <form onSubmit={handleEmailSignIn} className="space-y-3">
                            <div className="space-y-1.5">
                                <Label htmlFor="email" className="text-sm">Email address</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    placeholder="you@company.com"
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    required
                                    autoComplete="email"
                                />
                            </div>
                            {emailError && (
                                <p className="text-xs text-red-600">{emailError}</p>
                            )}
                            <Button
                                type="submit"
                                variant="outline"
                                size="lg"
                                className="w-full flex items-center gap-2 justify-center"
                                disabled={emailLoading || !email.trim()}
                            >
                                {emailLoading ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Mail className="w-4 h-4" />
                                )}
                                {emailLoading ? "Sending..." : "Send magic link"}
                                {!emailLoading && <ArrowRight className="w-3 h-3 ml-auto" />}
                            </Button>
                        </form>
                    )}
                </div>

                {/* SSO — demoted below card; Team plan enterprise feature */}
                {showSso ? (
                    <form onSubmit={handleSsoSignIn} className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-3">
                        <p className="text-xs font-medium text-gray-500 text-center">Enterprise SSO — Team plan</p>
                        <div className="space-y-1.5">
                            <Label htmlFor="sso-email" className="text-sm">Work email</Label>
                            <Input
                                id="sso-email"
                                type="email"
                                placeholder="you@company.com"
                                value={ssoEmail}
                                onChange={e => setSsoEmail(e.target.value)}
                                required
                                autoFocus
                                autoComplete="email"
                            />
                        </div>
                        {ssoError && <p className="text-xs text-red-600">{ssoError}</p>}
                        <div className="flex gap-2">
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="flex-1"
                                onClick={() => { setShowSso(false); setSsoError("") }}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                size="sm"
                                className="flex-1 flex items-center gap-2 justify-center"
                                disabled={ssoLoading || !ssoEmail.trim()}
                            >
                                {ssoLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
                                {ssoLoading ? "Looking up..." : "Continue"}
                            </Button>
                        </div>
                    </form>
                ) : (
                    <p className="text-center text-xs text-gray-400">
                        <button
                            type="button"
                            onClick={() => setShowSso(true)}
                            className="inline-flex items-center gap-1 hover:text-gray-600 underline underline-offset-2"
                        >
                            <Building2 className="w-3 h-3" />
                            Enterprise SSO
                        </button>
                    </p>
                )}

                {/* Dev-only login — visible only when NEXT_PUBLIC_DEV_LOGIN=true */}
                {IS_DEV && <DevLoginPanel callbackUrl={callbackUrl} />}

                <p className="text-center text-xs text-gray-400">
                    By signing in you agree to our{" "}
                    <a href="/terms" className="underline hover:text-gray-600">Terms of Service</a>
                    {" "}and{" "}
                    <a href="/privacy" className="underline hover:text-gray-600">Privacy Policy</a>.
                </p>
            </div>
        </div>
    )
}

export default function SignInPage() {
    return (
        <Suspense fallback={
            <div className="flex min-h-screen items-center justify-center bg-gray-50">
                <div className="h-8 w-8 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
            </div>
        }>
            <SignInInner />
        </Suspense>
    )
}
