// SPDX-License-Identifier: AGPL-3.0-or-later
"use client";

import React, { useState, useEffect } from "react";
import { InboxLayout } from "@/components/inbox/InboxLayout";
import { DriftAlertList, DriftAlert } from "@/components/inbox/DriftAlertList";
import { SemanticDiffViewer } from "@/components/inbox/SemanticDiffViewer";
import { GettingStartedBanner } from "@/components/onboarding/GettingStartedBanner";
import { DiscoverMoreChecklist } from "@/components/onboarding/DiscoverMoreChecklist";
import { useHotkeys } from "@/hooks/use-hotkeys";
import { toast } from "sonner";

interface InboxPageClientProps {
    tenantId: string;
    role?: string;
}

export function InboxPageClient({ tenantId, role }: InboxPageClientProps) {
    const [alerts, setAlerts] = useState<DriftAlert[]>([]);
    const [selectedAlert, setSelectedAlert] = useState<DriftAlert | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    const transformAlerts = (data: any[]): DriftAlert[] =>
        data.map((job: any) => ({
            id: job.id,
            repositoryName: job.repositoryName || "Unknown Repository",
            repoOwner: job.repoOwner || "",
            headSha: job.headSha || null,
            prNumber: job.prNumber,
            driftScore: job.result?.drift_score || 0,
            createdAt: job.createdAt,
            completedAt: job.completedAt ?? null,
            triageStatus: job.triageStatus ?? "PENDING",
            filesChanged: (job.result?.drift_analysis?.reasons ?? []).map((i: any) => i.file).filter(Boolean),
            result: job.result,
            fixPrUrl: job.fixPrUrl,
            aiAuthored: job.aiAuthored ?? false,
            autoFixEnqueued: job.autoFixEnqueued ?? false,
            aiSignal: job.aiSignal ?? null,
            autoMergeSkipReason: job.autoMergeSkipReason ?? null,
            policyViolations: job.result?.policy_violations ?? [],
        }));

    // Fetch alerts from API
    const fetchAlerts = async (silent = false) => {
        if (!silent) setIsLoading(true);
        try {
            const response = await fetch("/api/inbox");
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }
            const data = await response.json();

            if (!Array.isArray(data)) {
                console.error("Expected array from /api/inbox, got:", data);
                setAlerts([]);
                return;
            }

            const transformed = transformAlerts(data);
            setAlerts(transformed);
            setSelectedAlert(prev => {
                if (!prev) return transformed[0] ?? null;
                // Keep selection if still present (refresh its data), otherwise pick first
                const stillExists = transformed.find(a => a.id === prev.id);
                return stillExists ?? transformed[0] ?? null;
            });
        } catch (error) {
            console.error("Failed to fetch alerts:", error);
        } finally {
            if (!silent) setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchAlerts();
    }, []);

    // Background poll every 30 s — picks up external resolutions (fix PR merged, new webhooks)
    useEffect(() => {
        const id = setInterval(() => fetchAlerts(true), 30_000);
        return () => clearInterval(id);
    }, []);

    const handleTriage = async (status: "ACCEPTED" | "IGNORED", reason?: string) => {
        if (!selectedAlert || isProcessing) return;

        setIsProcessing(true);
        try {
            const response = await fetch(`/api/inbox/${selectedAlert.id}?status=${status}`, {
                method: "PATCH",
                headers: reason ? { "Content-Type": "application/json" } : {},
                body: reason ? JSON.stringify({ reason }) : undefined,
            });

            if (!response.ok) throw new Error("Failed to update status");

            if (status === "IGNORED") {
                toast("No Update Required", {
                    description: `Documentation drift for PR #${selectedAlert.prNumber} marked as not requiring changes.`,
                });

                // Remove from list and select next
                const currentIndex = alerts.findIndex(a => a.id === selectedAlert.id);
                const newAlerts = alerts.filter(a => a.id !== selectedAlert.id);
                setAlerts(newAlerts);

                if (newAlerts.length > 0) {
                    setSelectedAlert(newAlerts[Math.min(currentIndex, newAlerts.length - 1)]);
                } else {
                    setSelectedAlert(null);
                }
                setIsProcessing(false);
            } else {
                toast("Generating Auto-PR", {
                    description: `Creating fixes for PR #${selectedAlert.prNumber}...`,
                });
                // We leave isProcessing=true here to trigger the polling effect
            }
        } catch (error) {
            toast("Error", {
                description: "Failed to triage alert. Please try again.",
            });
            setIsProcessing(false);
        }
    };

    // Poll for the PR URL when processing an ACCEPTED alert
    useEffect(() => {
        if (!isProcessing || !selectedAlert) return;

        const interval = setInterval(async () => {
            try {
                const res = await fetch(`/api/inbox/${selectedAlert.id}`);
                const job = await res.json();

                if (job.fixPrUrl) {
                    toast.success("Auto-PR Created Successfully!", {
                        description: `Check the GitHub repository.`,
                    });

                    setSelectedAlert(prev => prev ? { ...prev, fixPrUrl: job.fixPrUrl } : null);
                    setAlerts(prev => prev.map(a => a.id === job.id ? { ...a, fixPrUrl: job.fixPrUrl } : a));
                    setIsProcessing(false);
                    clearInterval(interval);
                } else if (job.status === "FAILED") {
                    toast.error("Auto-PR Generation Failed", {
                        description: "Check the worker logs.",
                    });
                    setIsProcessing(false);
                    clearInterval(interval);
                }
            } catch (e) {
                console.error("Error polling for PR URL", e);
            }
        }, 3000);

        return () => clearInterval(interval);
    }, [isProcessing, selectedAlert]);

    // Keyboard Shortcuts
    useHotkeys({
        "j": () => {
            const idx = alerts.findIndex(a => a.id === selectedAlert?.id);
            if (idx < alerts.length - 1) setSelectedAlert(alerts[idx + 1]);
        },
        "k": () => {
            const idx = alerts.findIndex(a => a.id === selectedAlert?.id);
            if (idx > 0) setSelectedAlert(alerts[idx - 1]);
        },
        "a": () => role !== "VIEWER" && handleTriage("ACCEPTED"),
        "i": () => role !== "VIEWER" && handleTriage("IGNORED"),
    });

    if (isLoading || !isMounted) {
        return (
            <div className="flex items-center justify-center h-[calc(100vh-4rem)] bg-zinc-950/20">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full">
            {/* First-run banner — injected above the triage layout */}
            <div className="app-container pt-4">
                {role === "ADMIN" && <GettingStartedBanner tenantId={tenantId} />}
                {role === "ADMIN" && <DiscoverMoreChecklist tenantId={tenantId} />}
            </div>

            <InboxLayout
                sidebar={
                    <DriftAlertList
                        alerts={alerts}
                        selectedId={selectedAlert?.id}
                        onSelect={setSelectedAlert}
                    />
                }
                content={
                    selectedAlert ? (
                        <SemanticDiffViewer
                            alert={selectedAlert as any}
                            onAccept={role !== "VIEWER" ? () => handleTriage("ACCEPTED") : undefined}
                            onIgnore={role !== "VIEWER" ? (reason) => handleTriage("IGNORED", reason) : undefined}
                            isProcessing={isProcessing}
                        />
                    ) : null
                }
            />
        </div>
    );
}
