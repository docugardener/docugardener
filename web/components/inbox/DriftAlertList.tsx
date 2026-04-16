// SPDX-License-Identifier: AGPL-3.0-or-later
"use client";

import React from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { SEVERITY_CONFIG, normaliseSeverity } from "@/lib/severity";
import { Loader2, UserCheck, CheckCircle2, GitMerge } from "lucide-react";
import { getUiStatus } from "@/lib/job-status";
import { GettingStartedEmpty } from "@/components/onboarding/GettingStartedEmpty";

export interface PolicyViolation {
    rule_name: string;
    enforcement: "advisory" | "blocking" | "blocking-with-reason";
    paths_matched: string[];
    require_docs: string[];
    docs_present: string[];
    docs_missing: string[];
}

export interface DriftAlert {
    id: string;
    repositoryName: string;
    repoOwner: string;
    headSha: string | null;
    prNumber: number;
    driftScore: number;
    createdAt: string;
    completedAt?: string | null;
    status?: string;
    triageStatus?: string;
    filesChanged: string[];
    result?: any;
    fixPrUrl?: string;
    aiAuthored?: boolean;
    autoFixEnqueued?: boolean;
    aiSignal?: string | null;
    autoMergeSkipReason?: string | null;
    policyViolations?: PolicyViolation[];
}

interface DriftAlertListProps {
    alerts: DriftAlert[];
    selectedId?: string;
    onSelect: (alert: DriftAlert) => void;
    hasRepos?: boolean;
}

/** Status chip driven by getUiStatus() — single source of truth for all states. */
function AlertStatusChip({ alert }: { alert: DriftAlert }) {
    const uiStatus = getUiStatus({
        status: alert.status ?? "COMPLETED",
        triageStatus: alert.triageStatus,
        result: alert.result,
    })

    if (uiStatus === "QUEUED") return (
        <span data-testid="status-chip-queued"
            className="inline-flex items-center gap-0.5 text-[9px] font-black uppercase tracking-widest text-muted-foreground bg-muted border border-border px-1.5 py-px rounded-full">
            <Loader2 className="w-2 h-2 animate-spin" />
            Queued
        </span>
    )
    if (uiStatus === "ANALYZING") return (
        <span data-testid="status-chip-analyzing"
            className="inline-flex items-center gap-0.5 text-[9px] font-black uppercase tracking-widest text-blue-600 dark:text-blue-400 bg-blue-500/10 border border-blue-500/30 px-1.5 py-px rounded-full">
            <Loader2 className="w-2 h-2 animate-spin" />
            Analyzing
        </span>
    )
    if (uiStatus === "AI_FIXING") return (
        <span data-testid="status-chip-ai-fixing"
            className="inline-flex items-center gap-0.5 text-[9px] font-black uppercase tracking-widest text-violet-600 dark:text-violet-400 bg-violet-500/10 border border-violet-500/30 px-1.5 py-px rounded-full">
            <Loader2 className="w-2 h-2 animate-spin" />
            AI fixing
        </span>
    )
    if (uiStatus === "FIX_PR_OPEN") return (
        <span data-testid="status-chip-fix-pr-open"
            className="inline-flex items-center gap-0.5 text-[9px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-1.5 py-px rounded-full">
            <GitMerge className="w-2 h-2" />
            Fix PR open
        </span>
    )
    if (uiStatus === "NEEDS_REVIEW") return (
        <span data-testid="status-chip-review"
            className="inline-flex items-center gap-0.5 text-[9px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/30 px-1.5 py-px rounded-full">
            <UserCheck className="w-2 h-2" />
            Review
        </span>
    )
    if (uiStatus === "NO_DRIFT") return (
        <span data-testid="status-chip-no-drift"
            className="inline-flex items-center gap-0.5 text-[9px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-1.5 py-px rounded-full">
            <CheckCircle2 className="w-2 h-2" />
            No drift
        </span>
    )
    // RESOLVED / DISMISSED shouldn't normally appear in Inbox (filtered server-side)
    // but render a neutral chip just in case
    return (
        <span data-testid="status-chip-other"
            className="inline-flex items-center gap-0.5 text-[9px] font-black uppercase tracking-widest text-muted-foreground bg-muted border border-border px-1.5 py-px rounded-full">
            {uiStatus.toLowerCase().replace(/_/g, " ")}
        </span>
    )
}

function getSeverity(alert: DriftAlert) {
    const raw = alert.result?.drift_analysis?.severity;
    if (raw) return normaliseSeverity(raw);
    // Derive from score as fallback
    if (alert.driftScore >= 80) return normaliseSeverity("critical");
    if (alert.driftScore >= 60) return normaliseSeverity("significant");
    if (alert.driftScore >= 35) return normaliseSeverity("moderate");
    return normaliseSeverity("minor");
}

export function DriftAlertList({
    alerts,
    selectedId,
    onSelect,
    hasRepos = false,
}: DriftAlertListProps) {
    if (alerts.length === 0) {
        return <GettingStartedEmpty hasRepos={hasRepos} context="inbox" />;
    }

    return (
        <div className="flex flex-col">
            {alerts.map((alert) => {
                const severity = getSeverity(alert);
                const config = SEVERITY_CONFIG[severity];
                return (
                    <button
                        key={alert.id}
                        onClick={() => onSelect(alert)}
                        className={cn(
                            "relative flex flex-col px-3 py-2 text-left border-b border-border border-l-2 transition-all hover:bg-muted/40 group",
                            config.border,
                            selectedId === alert.id ? "bg-muted/60 ring-1 ring-inset ring-primary/20" : "bg-transparent"
                        )}
                    >
                        {/* Row 1: repo name + score */}
                        <div className="flex justify-between items-center">
                            <h4 className="text-xs font-semibold text-foreground truncate pr-2">
                                {alert.repositoryName}
                            </h4>
                            <div className="flex items-center gap-1 shrink-0">
                                <span className={cn("inline-block w-1.5 h-1.5 rounded-full", config.dot)} />
                                <Badge
                                    variant="outline"
                                    className={cn("font-bold text-[10px] px-1 py-0", config.badge)}
                                >
                                    {alert.driftScore}
                                </Badge>
                            </div>
                        </div>

                        {/* Row 2: PR # · time · files · policy · status chip — all on one line */}
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1 rounded">
                                #{alert.prNumber}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                                {formatDistanceToNow(new Date(alert.createdAt), { addSuffix: true })}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                                · {alert.filesChanged.length}f
                            </span>
                            {(alert.policyViolations?.length ?? 0) > 0 && (
                                <span className="text-[9px] font-black uppercase text-orange-500">🛡️</span>
                            )}
                            <span className="ml-auto">
                                <AlertStatusChip alert={alert} />
                            </span>
                        </div>
                    </button>
                );
            })}
        </div>
    );
}
