"use client";

import React, { useEffect, useState, useMemo } from "react";
import { codeToHtml } from "shiki";
import { CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export type DriftStatus = "synced" | "drifted" | "unknown";

export interface LiveCodeBlockProps {
    owner: string;
    repo: string;
    filePath: string;
    refSha: string;
    driftStatus?: DriftStatus;
    language?: string;
    className?: string;
}

export function LiveCodeBlock({
    owner,
    repo,
    filePath,
    refSha,
    driftStatus = "unknown",
    language = "typescript",
    className = "",
}: LiveCodeBlockProps) {
    const [rawContent, setRawContent] = useState<string | null>(null);
    const [htmlContent, setHtmlContent] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isComponentMounted, setIsComponentMounted] = useState(false);

    useEffect(() => {
        setIsComponentMounted(true);
    }, []);

    // Fetch the raw string content through our FastAPI proxy
    useEffect(() => {
        let isMounted = true;

        async function fetchContent() {
            try {
                setIsLoading(true);
                setError(null);
                const response = await fetch(`/api/repos/content/${owner}/${repo}/contents/${filePath}?ref=${refSha}`);

                if (!response.ok) {
                    throw new Error(`Failed to load code snippet (${response.status})`);
                }

                const data = await response.json();
                if (isMounted) {
                    setRawContent(data.content);
                }
            } catch (err: any) {
                if (isMounted) {
                    setError(err.message || "Failed to load code snippet.");
                }
            } finally {
                if (isMounted) {
                    setIsLoading(false);
                }
            }
        }

        fetchContent();

        return () => {
            isMounted = false;
        };
    }, [owner, repo, filePath, refSha]);

    // Syntax highlight the fetched code string using shiki
    useEffect(() => {
        if (!rawContent) return;

        let isMounted = true;

        async function highlight() {
            try {
                const html = await codeToHtml(rawContent as string, {
                    lang: language,
                    theme: "github-dark-dimmed",
                });
                if (isMounted) {
                    setHtmlContent(html);
                }
            } catch (e) {
                console.error("Shiki generic error: ", e);
                // Fallback to unhighlighted text gracefully
                if (isMounted) {
                    setHtmlContent(`<pre><code>${rawContent}</code></pre>`);
                }
            }
        }

        highlight();

        return () => {
            isMounted = false;
        };
    }, [rawContent, language]);

    const borderClass = useMemo(() => {
        if (driftStatus === "synced") return "border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.15)]";
        if (driftStatus === "drifted") return "border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.15)]";
        return "border-slate-800";
    }, [driftStatus]);

    const badgeContent = useMemo(() => {
        const tooltipText = driftStatus === "synced"
            ? `Documentation is passing sync verification against commit ${refSha.substring(0, 7)} (Current HEAD)`
            : `Documentation has drifted from the actual code at commit ${refSha.substring(0, 7)} (Current HEAD)`;

        if (driftStatus === "synced") {
            return (
                <Badge variant="outline" title={tooltipText} className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 gap-1 absolute -top-3 right-4 shadow-sm z-10 backdrop-blur-md cursor-help">
                    <CheckCircle2 className="w-3 h-3" />
                    Synced
                </Badge>
            );
        }
        if (driftStatus === "drifted") {
            return (
                <Badge variant="outline" title={tooltipText} className="bg-amber-500/10 text-amber-500 border-amber-500/30 gap-1 absolute -top-3 right-4 shadow-sm z-10 backdrop-blur-md cursor-help">
                    <AlertTriangle className="w-3 h-3" />
                    Drifted
                </Badge>
            );
        }
        return null;
    }, [driftStatus, refSha]);

    // Construct the direct Github URL
    const githubLink = `https://github.com/${owner}/${repo}/blob/${refSha}/${filePath}`;

    if (!isComponentMounted) {
        return <div className={`w-full min-h-[150px] rounded-lg border bg-zinc-950/50 animate-pulse ${className}`} />;
    }

    return (
        <div className={`relative group w-full rounded-lg border bg-zinc-950 font-mono text-sm transition-all duration-300 ${borderClass} ${className}`}>
            {/* Header portion */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-900 bg-zinc-900/50">
                <a
                    href={githubLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-zinc-400 hover:text-zinc-200 transition-colors flex items-center gap-2 text-xs truncate"
                    title={`View ${filePath} on GitHub`}
                >
                    <span className="font-semibold text-zinc-300">{repo}</span>
                    <span className="text-zinc-600">/</span>
                    <span>{filePath}</span>
                    <span className="bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-500 text-[10px] ml-2">
                        {refSha.substring(0, 7)}
                    </span>
                </a>
            </div>

            {badgeContent}

            {/* Code Body */}
            <div className="p-4 overflow-x-auto min-h-[100px] flex max-h-[500px] custom-scrollbar">
                {isLoading && (
                    <div className="w-full flex items-center gap-2 text-zinc-500 m-auto justify-center">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Fetching live code...</span>
                    </div>
                )}

                {error && !isLoading && (
                    <div className="w-full text-rose-500 bg-rose-500/10 p-4 rounded text-sm m-auto text-center border border-rose-500/20">
                        {error}
                    </div>
                )}

                {htmlContent && !isLoading && !error && (
                    <div
                        className="w-full [&>pre]:!bg-transparent [&>pre]:!m-0 text-[13px] leading-relaxed"
                        dangerouslySetInnerHTML={{ __html: htmlContent }}
                    />
                )}
            </div>
        </div>
    );
}
