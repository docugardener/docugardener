// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * HYB-06 / DG-BIL-01: LicenseStatusCard
 *
 * Replaces the Stripe subscription card on the billing page when
 * DEPLOYMENT_MODE is "client-installed" or "air-gap".
 *
 * DG-BIL-01: upgrade/manage buttons call /api/billing/checkout and
 * /api/billing/portal which proxy to PlatformCloud in client_installed mode.
 */
"use client"

import { Key, ShieldCheck } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

interface LicenseStatusCardProps {
    plan: string
    expiresAt: string | null
    keyFingerprint: string | null
    /** @deprecated portalUrl is no longer used; portal is accessed via onManageSubscription */
    portalUrl: string | null
    deploymentMode: string
    // DG-BIL-01: handlers wired to /api/billing/checkout and /api/billing/portal
    onUpgrade?: (plan: "pro" | "team") => void
    onManageSubscription?: () => void
    checkoutLoading?: boolean
    portalLoading?: boolean
    stripeError?: string | null
    stripeSuccess?: string | null
}

const PLAN_LABELS: Record<string, string> = {
    FREE: "Free",
    PRO: "Pro",
    TEAM: "Team",
}

export function LicenseStatusCard({
    plan,
    expiresAt,
    keyFingerprint,
    deploymentMode,
    onUpgrade,
    onManageSubscription,
    checkoutLoading = false,
    portalLoading = false,
    stripeError,
    stripeSuccess,
}: LicenseStatusCardProps) {
    const isAirGap = deploymentMode === "air-gap"
    const normalizedPlan = plan?.toUpperCase() ?? "FREE"

    return (
        <Card data-testid="license-status-card">
            <CardContent className="p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <ShieldCheck className="h-5 w-5 text-primary shrink-0" />
                    <div>
                        <p className="text-sm font-black text-foreground">
                            License Plan:{" "}
                            <span className="text-primary">{PLAN_LABELS[normalizedPlan] ?? plan}</span>
                        </p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <Badge variant="outline" className="text-[10px] font-mono">
                                <Key className="h-3 w-3 mr-1" />
                                {keyFingerprint ? `···${keyFingerprint}` : "No key configured"}
                            </Badge>
                            {expiresAt && (
                                <span className="text-xs text-muted-foreground">
                                    Expires {new Date(expiresAt).toLocaleDateString()}
                                </span>
                            )}
                            {isAirGap && (
                                <Badge variant="secondary" className="text-[10px]">
                                    Air-Gap
                                </Badge>
                            )}
                        </div>
                        {stripeError && (
                            <p className="text-xs text-destructive mt-1">{stripeError}</p>
                        )}
                        {stripeSuccess && (
                            <p className="text-xs text-emerald-500 font-semibold mt-1">{stripeSuccess}</p>
                        )}
                    </div>
                </div>

                {/* DG-BIL-01: upgrade / manage CTAs (client_installed mode, not air-gap) */}
                {!isAirGap && onUpgrade && (
                    <div className="flex gap-2 shrink-0">
                        {normalizedPlan === "FREE" && (
                            <Button
                                size="sm"
                                disabled={checkoutLoading}
                                onClick={() => onUpgrade("pro")}
                                className="text-[10px] font-black uppercase tracking-widest h-9 px-4"
                            >
                                {checkoutLoading ? "Redirecting..." : "Upgrade to Pro"}
                            </Button>
                        )}
                        {normalizedPlan === "PRO" && (
                            <>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={checkoutLoading}
                                    onClick={() => onUpgrade("team")}
                                    className="text-[10px] font-black uppercase tracking-widest h-9 px-4"
                                >
                                    {checkoutLoading ? "Redirecting..." : "Upgrade to Team"}
                                </Button>
                                {onManageSubscription && (
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        disabled={portalLoading}
                                        onClick={onManageSubscription}
                                        className="text-[10px] font-black uppercase tracking-widest h-9 px-4"
                                    >
                                        {portalLoading ? "Opening..." : "Manage Subscription"}
                                    </Button>
                                )}
                            </>
                        )}
                        {normalizedPlan === "TEAM" && onManageSubscription && (
                            <Button
                                size="sm"
                                variant="ghost"
                                disabled={portalLoading}
                                onClick={onManageSubscription}
                                className="text-[10px] font-black uppercase tracking-widest h-9 px-4"
                            >
                                {portalLoading ? "Opening..." : "Manage Subscription"}
                            </Button>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
