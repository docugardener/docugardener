// SPDX-License-Identifier: AGPL-3.0-or-later
"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
    Check, X, FileCode, Code2, ShieldAlert, ShieldCheck, AlertTriangle,
    GitPullRequest, Zap, Clock, CheckCircle2, XCircle, ExternalLink,
    CircleDashed, ChevronDown, ChevronRight, Loader2, UserCheck,
} from "lucide-react"
import { formatDistanceToNow } from "date-fns";
import { LiveCodeBlock, DriftStatus } from "@/components/editor/LiveCodeBlock";
import { SEVERITY_CONFIG, normaliseSeverity } from "@/lib/severity";
import { getUiStatus } from "@/lib/job-status";

interface SemanticDiffViewerProps {
    alert: {
        id: string;
        repositoryName: string;
        repoOwner: string;
        headSha: string | null;
        prNumber: number;
        driftScore: number;
        createdAt?: string;
        completedAt?: string | null;
        status?: string;
        triageStatus?: string;
        result: any;
        fixPrUrl?: string;
        aiAuthored?: boolean;
        autoFixEnqueued?: boolean;
        aiSignal?: string | null;
        autoMergeSkipReason?: string | null;
    };
    onAccept?: () => void;
    onIgnore?: (reason?: string) => void;
    isProcessing?: boolean;
}

/** Map file extension to a Shiki-compatible language identifier */
function detectLanguage(filePath: string): string {
    const ext = filePath.split(".").pop()?.toLowerCase() ?? ""
    const map: Record<string, string> = {
        ts: "typescript", tsx: "tsx", js: "javascript", jsx: "jsx",
        py: "python", md: "markdown", json: "json", yaml: "yaml",
        yml: "yaml", sh: "bash", css: "css", html: "html", rs: "rust",
        go: "go", java: "java", rb: "ruby", cs: "csharp", cpp: "cpp",
    }
    return map[ext] ?? "text"
}

export function SemanticDiffViewer({
    alert,
    onAccept,
    onIgnore,
    isProcessing = false,
}: SemanticDiffViewerProps) {
    const [dismissState, setDismissState] = useState<"idle" | "confirming">("idle")
    const [dismissReason, setDismissReason] = useState("")
    const [expandedIdx, setExpandedIdx] = useState<number | null>(null)
    const [showCode, setShowCode] = useState<Record<number, boolean>>({})
    const [lineageOpen, setLineageOpen] = useState(false)

    const uiStatus = getUiStatus({
        status: alert.status ?? "COMPLETED",
        triageStatus: alert.triageStatus,
        result: alert.result,
    })
    const severity = normaliseSeverity(alert.result?.drift_analysis?.severity)
    const policyViolations: any[] = alert.result?.policy_violations ?? []
    // All dismissals require a reason for auditability — not just critical/blocking ones
    const requiresReason = true

    const driftItems = alert.result?.drift_analysis?.items || alert.result?.drift_analysis?.reasons || [];

    return (
        <div className="flex flex-col h-full bg-background/50 backdrop-blur-md">
            {/* Header Controls */}
            <div className="p-6 border-b border-border bg-card/40 flex items-center justify-between">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-xl font-black tracking-tight text-foreground uppercase">
                            {alert.repositoryName}
                        </h3>
                        <Badge variant="outline" className="border-border bg-muted/50 text-[10px] font-bold">
                            PR #{alert.prNumber}
                        </Badge>
                    </div>
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                        Drift Score: <span className="text-foreground">{alert.driftScore}/100</span>
                        {alert.headSha && (
                            <span className="ml-3 font-mono text-[10px] text-muted-foreground/60 bg-muted px-1.5 py-0.5 rounded border border-border">
                                @ {alert.headSha.substring(0, 7)}
                            </span>
                        )}
                    </p>
                    {/* FIX-01: confidence + recheck badges */}
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        {(() => {
                            const conf: number | undefined = alert.result?.drift_analysis?.confidence_score
                            if (conf === undefined) return null
                            const pct = Math.round(conf * 100)
                            const cls = pct >= 80
                                ? "border-emerald-500/50 text-emerald-600 bg-emerald-500/10"
                                : pct >= 50
                                    ? "border-amber-500/50 text-amber-600 bg-amber-500/10"
                                    : "border-rose-500/50 text-rose-500 bg-rose-500/10"
                            return (
                                <Badge variant="outline" className={cn("text-[9px] font-black uppercase px-1.5 py-0", cls)}
                                    title="LLM verifier confidence in this drift analysis">
                                    Confidence {pct}%
                                </Badge>
                            )
                        })()}
                        {(() => {
                            const rs: string | undefined = alert.result?.recheck_status
                            if (!rs || rs === "skipped") return null
                            const cfg = rs === "passed"
                                ? { label: "Recheck Passed", cls: "border-emerald-500/50 text-emerald-600 bg-emerald-500/10", Icon: ShieldCheck }
                                : { label: "Recheck Failed", cls: "border-rose-500/50 text-rose-500 bg-rose-500/10", Icon: AlertTriangle }
                            return (
                                <Badge variant="outline" className={cn("text-[9px] font-black uppercase px-1.5 py-0 flex items-center gap-1", cfg.cls)}
                                    title="Second verification pass on the generated documentation fix">
                                    <cfg.Icon className="w-2.5 h-2.5" />
                                    {cfg.label}
                                </Badge>
                            )
                        })()}
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {/* ── In-flight spinners (no user action available) ── */}
                    {uiStatus === "QUEUED" && (
                        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground bg-muted border border-border px-2 py-1 rounded-full">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Queued for analysis&hellip;
                        </span>
                    )}
                    {uiStatus === "ANALYZING" && (
                        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400 bg-blue-500/10 border border-blue-500/30 px-2 py-1 rounded-full">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Analyzing PR&hellip;
                        </span>
                    )}
                    {uiStatus === "AI_FIXING" && (
                        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/40 border border-violet-200 dark:border-violet-800 px-2 py-1 rounded-full">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            AI generating fix PR&hellip;
                        </span>
                    )}

                    {/* ── Fix PR open — awaiting merge (auto-merge skipped or manual) ── */}
                    {uiStatus === "FIX_PR_OPEN" && alert.fixPrUrl && alert.autoMergeSkipReason && (
                        <div className="flex flex-col gap-1.5">
                            <div className="flex items-center gap-2">
                                <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 px-2 py-0.5 rounded-full">
                                    <AlertTriangle className="w-3 h-3" />
                                    {alert.autoMergeSkipReason === "method_not_allowed"
                                        ? "Merge Method Mismatch — Action Required"
                                        : alert.autoMergeSkipReason === "ci_timeout"
                                            ? "CI Timed Out — Action Required"
                                            : "CI Failed — Action Required"}
                                </span>
                                <Button asChild variant="default"
                                    className="bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/20 border-b-4 border-amber-700 active:border-b-0 active:translate-y-1 transition-all">
                                    <a href={alert.fixPrUrl} target="_blank" rel="noopener noreferrer">
                                        <FileCode className="w-4 h-4 mr-2" />
                                        Review Fix PR
                                    </a>
                                </Button>
                            </div>
                            <p className="text-[11px] text-muted-foreground pl-0.5">
                                {alert.autoMergeSkipReason === "method_not_allowed"
                                    ? "Auto-merge method not allowed by repo settings. Update Settings → Intelligence or repo merge settings, then merge manually."
                                    : "Fix CI on the fix PR, then merge it manually — this alert will resolve automatically."}
                            </p>
                        </div>
                    )}
                    {uiStatus === "FIX_PR_OPEN" && alert.fixPrUrl && !alert.autoMergeSkipReason && (
                        <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/40 border border-violet-200 dark:border-violet-800 px-2 py-0.5 rounded-full">
                                <Zap className="w-3 h-3" />
                                Fix PR open — awaiting merge
                            </span>
                            <Button asChild variant="default"
                                className="bg-fresh hover:bg-fresh/90 text-white shadow-lg shadow-fresh/20 border-b-4 border-fresh-dark active:border-b-0 active:translate-y-1 transition-all">
                                <a href={alert.fixPrUrl} target="_blank" rel="noopener noreferrer">
                                    <FileCode className="w-4 h-4 mr-2" />
                                    View Fix PR
                                </a>
                            </Button>
                        </div>
                    )}

                    {/* ── Needs review — show Accept / Dismiss only here ── */}
                    {uiStatus === "NEEDS_REVIEW" && (onAccept || onIgnore) && (
                        <div className="flex flex-col items-end gap-2">
                            <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-full">
                                <UserCheck className="w-2.5 h-2.5" />
                                Review required
                            </span>
                            <div className="flex items-center gap-2">
                                {dismissState === "confirming" ? (
                                    <div className="flex items-center gap-2">
                                        <Textarea
                                            autoFocus
                                            rows={1}
                                            placeholder="Explain why no documentation update is needed..."
                                            value={dismissReason}
                                            onChange={e => setDismissReason(e.target.value)}
                                            className="h-9 min-h-0 resize-none text-xs w-64"
                                        />
                                        <Button size="sm" variant="destructive"
                                            disabled={!dismissReason.trim() || isProcessing}
                                            onClick={() => {
                                                onIgnore?.(dismissReason.trim())
                                                setDismissState("idle")
                                                setDismissReason("")
                                            }}>
                                            Confirm
                                        </Button>
                                        <Button size="sm" variant="ghost"
                                            onClick={() => { setDismissState("idle"); setDismissReason("") }}>
                                            Cancel
                                        </Button>
                                    </div>
                                ) : (
                                    onIgnore && (
                                        <Button variant="outline"
                                            onClick={() => requiresReason ? setDismissState("confirming") : onIgnore?.()}
                                            disabled={isProcessing}
                                            className="border-border text-muted-foreground hover:bg-rose-500/10 hover:text-rose-500 hover:border-rose-500/50 transition-colors">
                                            <X className="w-4 h-4 mr-2" />
                                            No Update Required
                                        </Button>
                                    )
                                )}
                                {onAccept && (
                                    <Button onClick={onAccept} disabled={isProcessing}
                                        className="bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20 border-b-4 border-primary-dark active:border-b-0 active:translate-y-1 transition-all">
                                        <Check className="w-4 h-4 mr-2" />
                                        {isProcessing ? "Generating PR..." : "Accept Changes"}
                                    </Button>
                                )}
                            </div>
                        </div>
                    )}
                    {uiStatus === "NEEDS_REVIEW" && !onAccept && !onIgnore && (
                        <span className="text-xs text-muted-foreground italic">Read-only view</span>
                    )}
                </div>
            </div>

            {/* EVID-01: Drift Event Timeline — compact expandable */}
            {(() => {
                const ts = alert.triageStatus ?? "PENDING"
                const fixUrl: string | undefined = alert.fixPrUrl || alert.result?.fixPrUrl

                // Duration between detection and analysis completion
                const durationMs = alert.completedAt && alert.createdAt
                    ? new Date(alert.completedAt).getTime() - new Date(alert.createdAt).getTime()
                    : null
                const durationStr = durationMs
                    ? durationMs < 1000 ? `${durationMs}ms` : `${(durationMs / 1000).toFixed(1)}s`
                    : null

                const llmUsage = alert.result?.llm_usage
                const model = llmUsage?.model
                const totalTokens = llmUsage
                    ? (llmUsage.prompt_tokens ?? 0) + (llmUsage.completion_tokens ?? 0)
                    : null

                const steps = [
                    {
                        icon: Zap,
                        label: "Detected",
                        sub: alert.createdAt ? formatDistanceToNow(new Date(alert.createdAt), { addSuffix: true }) : null,
                        done: true,
                        active: false,
                        href: undefined as string | undefined,
                        detail: `Webhook received${alert.createdAt ? ` · ${new Date(alert.createdAt).toLocaleTimeString()}` : ""}`,
                    },
                    {
                        icon: Clock,
                        label: "Analyzed",
                        sub: alert.completedAt ? formatDistanceToNow(new Date(alert.completedAt), { addSuffix: true }) : null,
                        done: !!alert.completedAt,
                        active: !alert.completedAt,
                        href: undefined as string | undefined,
                        detail: [
                            durationStr,
                            alert.driftScore !== undefined ? `drift score ${alert.driftScore}` : null,
                            model,
                            totalTokens ? `${totalTokens.toLocaleString()} tokens` : null,
                        ].filter(Boolean).join(" · ") || (alert.completedAt ? "Analysis complete" : "In progress…"),
                    },
                    {
                        icon: ts === "IGNORED" ? XCircle : ts === "ACCEPTED" || ts === "RESOLVED" ? CheckCircle2 : Clock,
                        label: ts === "PENDING" ? "Awaiting Triage" : ts === "IGNORED" ? "Dismissed" : ts === "ACCEPTED" ? "Accepted" : "Resolved",
                        sub: null,
                        done: ts !== "PENDING",
                        active: ts === "PENDING",
                        href: undefined as string | undefined,
                        detail: ts === "PENDING"
                            ? "Pending review — use Accept or Dismiss above"
                            : ts === "IGNORED" ? "Marked as no update required"
                            : "Documentation update accepted",
                    },
                    ...(fixUrl ? [{
                        icon: GitPullRequest,
                        label: "Fix PR Created",
                        sub: null,
                        done: true,
                        active: false,
                        href: fixUrl,
                        detail: "Automated fix pull request generated",
                    }] : []),
                ]

                return (
                    <div className="px-6 pt-2.5 pb-0 border-b border-border bg-muted/20">
                        {/* Compact pill strip + expand toggle */}
                        <div className="flex items-center pb-2.5">
                            <div className="flex items-center gap-0 flex-1 overflow-x-auto min-w-0">
                                {steps.map((step, i) => (
                                    <React.Fragment key={i}>
                                        {step.href ? (
                                            <a
                                                href={step.href}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="rounded-full px-2 py-0.5 flex items-center gap-1 text-[9px] font-black uppercase tracking-widest border bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20 transition-colors shrink-0"
                                            >
                                                <step.icon className="h-2.5 w-2.5 shrink-0" />
                                                {step.label}
                                                <ExternalLink className="h-2 w-2 shrink-0" />
                                            </a>
                                        ) : (
                                            <span className={cn(
                                                "rounded-full px-2 py-0.5 flex items-center gap-1 text-[9px] font-black uppercase tracking-widest border shrink-0",
                                                step.done
                                                    ? "bg-primary/10 text-primary border-primary/20"
                                                    : step.active
                                                        ? "bg-muted/40 text-foreground border-border"
                                                        : "opacity-40 bg-muted/20 text-muted-foreground border-border/30"
                                            )}>
                                                {step.done
                                                    ? <CheckCircle2 className="h-2.5 w-2.5 shrink-0" />
                                                    : step.active
                                                        ? <Clock className="h-2.5 w-2.5 shrink-0" />
                                                        : <CircleDashed className="h-2.5 w-2.5 shrink-0" />
                                                }
                                                {step.label}
                                            </span>
                                        )}
                                        {i < steps.length - 1 && (
                                            <div className={cn(
                                                "h-px flex-1 min-w-[8px] max-w-[36px] mx-1 shrink-0",
                                                step.done ? "bg-primary/40" : "bg-border/30"
                                            )} />
                                        )}
                                    </React.Fragment>
                                ))}
                            </div>
                            <button
                                onClick={() => setLineageOpen(o => !o)}
                                className="ml-3 shrink-0 flex items-center gap-1 text-[9px] font-bold text-muted-foreground/60 hover:text-foreground transition-colors"
                                aria-label={lineageOpen ? "Collapse step details" : "Expand step details"}
                            >
                                <span className="hidden sm:inline">{lineageOpen ? "Less" : "Details"}</span>
                                <ChevronDown className={cn("h-3 w-3 transition-transform duration-200", lineageOpen && "rotate-180")} />
                            </button>
                        </div>

                        {/* Expandable step detail panel */}
                        <div className={cn(
                            "grid transition-all duration-200",
                            lineageOpen ? "grid-rows-[1fr] pb-3" : "grid-rows-[0fr]"
                        )}>
                            <div className="overflow-hidden">
                                <div className="border border-border/50 rounded-lg bg-background/40 divide-y divide-border/30">
                                    {steps.map((step, i) => (
                                        <div key={i} className="flex items-start gap-3 px-3 py-2">
                                            <div className={cn(
                                                "mt-1 w-1.5 h-1.5 rounded-full shrink-0",
                                                step.done ? "bg-primary" : step.active ? "bg-foreground/50" : "bg-muted-foreground/25"
                                            )} />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className={cn(
                                                        "text-[10px] font-black uppercase tracking-widest",
                                                        step.done ? "text-foreground" : step.active ? "text-foreground/70" : "text-muted-foreground/40"
                                                    )}>
                                                        {step.label}
                                                    </span>
                                                    {step.sub && (
                                                        <span className="text-[9px] text-muted-foreground/50 shrink-0">{step.sub}</span>
                                                    )}
                                                </div>
                                                <p className="text-[10px] text-muted-foreground/60 mt-0.5">{step.detail}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <p className="text-[9px] text-muted-foreground/40 pt-1.5">
                                    Full run history →{" "}
                                    <a href={`/dashboard/jobs/${alert.id}`} className="underline underline-offset-2 hover:text-muted-foreground/70 transition-colors">
                                        Jobs queue
                                    </a>
                                </p>
                            </div>
                        </div>
                    </div>
                )
            })()}

            {/* Diff Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar bg-background/30">
                {/* DOCPOL-01: Policy violations — collapsible details */}
                {policyViolations.length > 0 && (
                    <details className="group">
                        <summary className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-orange-500/8 border border-orange-500/20 text-orange-400 text-xs font-semibold cursor-pointer select-none list-none">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                            <span className="flex-1">{policyViolations.length} policy violation{policyViolations.length !== 1 ? "s" : ""}</span>
                            <ChevronDown className="chevron w-3.5 h-3.5 transition-transform group-open:rotate-180" />
                        </summary>
                        <div className="mt-2 rounded-xl border-2 border-orange-500/40 bg-orange-500/5 overflow-hidden">
                            <div className="p-4 space-y-3">
                                {policyViolations.map((v: any, idx: number) => {
                                    const enforcementConfig: Record<string, { label: string; className: string }> = {
                                        "blocking":             { label: "Blocking",              className: "border-red-500/50 text-red-500 bg-red-500/10" },
                                        "blocking-with-reason": { label: "Blocking — Reason Req.", className: "border-orange-500/50 text-orange-500 bg-orange-500/10" },
                                        "advisory":             { label: "Advisory",              className: "border-yellow-500/50 text-yellow-600 bg-yellow-500/10" },
                                    }
                                    const cfg = enforcementConfig[v.enforcement] ?? enforcementConfig["advisory"]
                                    return (
                                        <div key={idx} className="rounded-xl border border-orange-500/20 bg-background/40 p-3 space-y-2">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-black text-foreground font-mono">{v.rule_name}</span>
                                                <Badge variant="outline" className={cn("text-[9px] font-black uppercase px-1.5 py-0", cfg.className)}>
                                                    {cfg.label}
                                                </Badge>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2 text-xs">
                                                <div>
                                                    <span className="text-[10px] uppercase font-bold text-red-500/70 block mb-1">Missing Docs</span>
                                                    <ul className="space-y-0.5">
                                                        {v.docs_missing?.map((d: string, i: number) => (
                                                            <li key={i} className="font-mono text-red-400 bg-red-500/10 px-2 py-0.5 rounded">{d}</li>
                                                        ))}
                                                    </ul>
                                                </div>
                                                {v.docs_present?.length > 0 && (
                                                    <div>
                                                        <span className="text-[10px] uppercase font-bold text-green-500/70 block mb-1">Present Docs</span>
                                                        <ul className="space-y-0.5">
                                                            {v.docs_present.map((d: string, i: number) => (
                                                                <li key={i} className="font-mono text-green-400 bg-green-500/10 px-2 py-0.5 rounded">{d}</li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )
                                })}
                                {policyViolations.some((v: any) => v.enforcement === "blocking-with-reason") && (
                                    <p className="text-xs text-orange-500/80 bg-orange-500/5 border border-orange-500/20 rounded-lg px-3 py-2">
                                        This policy violation requires a written reason to dismiss — use the <strong>No Update Required</strong> button above.
                                    </p>
                                )}
                            </div>
                        </div>
                    </details>
                )}

                {/* Drift items — compact table + accordion */}
                {driftItems.length > 0 ? (
                    <div className="rounded-xl border border-border overflow-hidden">
                        {/* Header row */}
                        <div className="grid grid-cols-[auto_1fr_1fr_auto] gap-3 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground border-b border-border bg-muted/20">
                            <span />
                            <span>File</span>
                            <span>Required Action</span>
                            <span />
                        </div>

                        {driftItems.map((item: any, idx: number) => {
                            const itemSeverity = normaliseSeverity(
                                item.severity ?? alert.result?.drift_analysis?.severity
                            )
                            const severityStyle = SEVERITY_CONFIG[itemSeverity]
                            // Display label: doc file or entity targeted by this drift item
                            const itemFilePath = item.file_path || item.file || item.entity || "Repository Code"
                            // LiveCodeBlock shows the changed source file when available, falling back to the doc path
                            const sourceFilePath =
                                alert.result?.changed_files?.[idx] ??
                                alert.result?.changed_files?.[0] ??
                                item.file_path ??
                                null
                            const driftStatus: DriftStatus = (itemSeverity === "critical" || itemSeverity === "significant") ? "drifted" : "synced"
                            const canRenderLiveBlock =
                                !!alert.repoOwner &&
                                !!alert.repositoryName &&
                                !!sourceFilePath &&
                                !!alert.headSha
                            const isExpanded = expandedIdx === idx

                            const firstActionText = item.required_updates?.[0]?.description
                                ?? item.required_updates?.[0]
                                ?? item.summary
                                ?? item.reason
                                ?? "Review required"

                            return (
                                <React.Fragment key={idx}>
                                    {/* Clickable row */}
                                    <div
                                        onClick={() => setExpandedIdx(isExpanded ? null : idx)}
                                        className="grid grid-cols-[auto_1fr_1fr_auto] gap-3 items-center px-4 py-2.5 hover:bg-muted/30 cursor-pointer border-b border-border/50 transition-colors"
                                    >
                                        <div className={cn("w-2 h-2 rounded-full shrink-0", severityStyle?.dot ?? "bg-muted-foreground")} />
                                        <span className="font-mono text-xs text-foreground truncate">{itemFilePath}</span>
                                        <span className="text-xs text-muted-foreground truncate">{firstActionText}</span>
                                        <ChevronRight className={cn("h-3.5 w-3.5 text-muted-foreground/50 transition-transform shrink-0", isExpanded && "rotate-90")} />
                                    </div>

                                    {/* Accordion panel */}
                                    {isExpanded && (
                                        <div className={cn("border-l-2 mx-4 mb-1 rounded-r-lg bg-muted/10", severityStyle?.border ?? "border-muted")}>
                                            <div className="p-4 space-y-3">
                                                {/* File context */}
                                                <div className="text-xs bg-muted/20 rounded-md px-3 py-2">
                                                    <span className="text-muted-foreground">File: </span>
                                                    <span className="font-mono text-foreground">{itemFilePath}</span>
                                                    {(item.file || item.target_doc) && (
                                                        <>
                                                            <span className="text-muted-foreground mx-2">→</span>
                                                            <span className="font-mono text-fresh">{item.file || item.target_doc}</span>
                                                        </>
                                                    )}
                                                </div>

                                                {/* Analysis / reasoning */}
                                                {(item.reason || item.reasoning) && (
                                                    <p className="text-sm text-foreground/80 leading-relaxed">
                                                        {item.reasoning || item.reason}
                                                    </p>
                                                )}

                                                {/* Required updates list */}
                                                {item.required_updates?.length > 0 && (
                                                    <ol className="space-y-1 text-xs text-muted-foreground list-decimal list-inside">
                                                        {item.required_updates.map((u: any, j: number) => (
                                                            <li key={j}>{u.description ?? u}</li>
                                                        ))}
                                                    </ol>
                                                )}

                                                {/* Show code toggle */}
                                                <button
                                                    onClick={e => { e.stopPropagation(); setShowCode(prev => ({ ...prev, [idx]: !prev[idx] })) }}
                                                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                                                >
                                                    <Code2 className="h-3.5 w-3.5" />
                                                    {showCode[idx] ? "Hide code" : "Show code"}
                                                </button>

                                                {showCode[idx] && !canRenderLiveBlock && (
                                                    <p className="text-xs text-muted-foreground/60 italic px-1">
                                                        {!alert.headSha
                                                            ? "Code preview unavailable — commit SHA not recorded for this analysis."
                                                            : !alert.repoOwner
                                                                ? "Code preview unavailable — GitHub owner could not be resolved."
                                                                : "Code preview unavailable — no changed source file recorded."}
                                                    </p>
                                                )}
                                                {showCode[idx] && canRenderLiveBlock && (
                                                    <LiveCodeBlock
                                                        owner={alert.repoOwner}
                                                        repo={alert.repositoryName}
                                                        filePath={sourceFilePath!}
                                                        refSha={alert.headSha!}
                                                        driftStatus={driftStatus}
                                                        language={detectLanguage(sourceFilePath!)}
                                                        className="max-h-[500px] border-2 shadow-2xl"
                                                    />
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </React.Fragment>
                            )
                        })}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center h-64 text-muted-foreground py-12">
                        <FileCode className="w-16 h-16 mb-4 opacity-20" />
                        <p className="text-sm font-bold uppercase tracking-widest opacity-40">No semantic drift items detected</p>
                    </div>
                )}

                {/* DOCPOL-02: Policy next steps — actionable guidance for violations */}
                {policyViolations.length > 0 && (
                    <div className="rounded-xl border border-orange-500/30 bg-orange-500/5 p-4 space-y-2">
                        <p className="text-[11px] font-black uppercase tracking-widest text-orange-500/80 flex items-center gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                            Recommended Next Steps
                        </p>
                        <ol className="space-y-1 list-decimal list-inside">
                            {Array.from(new Set(policyViolations.flatMap((v: any) => v.docs_missing ?? []))).map((doc: unknown, i: number) => (
                                <li key={i} className="text-xs text-foreground/80">
                                    Create or update{" "}
                                    <code className="font-mono text-orange-400 bg-orange-500/10 px-1 py-0.5 rounded">{String(doc)}</code>
                                </li>
                            ))}
                            <li className="text-xs text-foreground/80">Commit the docs to your default branch, then re-open this PR.</li>
                        </ol>
                    </div>
                )}
            </div>
        </div>
    );
}
