"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
    HoverCard,
    HoverCardContent,
    HoverCardTrigger,
} from "@/components/ui/hover-card";
import { LiveCodeBlock, DriftStatus } from "@/components/editor/LiveCodeBlock";
import { cn } from "@/lib/utils";
import { Code2 } from "lucide-react";

export interface LiveBlockToken {
    owner: string;
    repo: string;
    filePath: string;
    refSha: string;
    driftStatus: DriftStatus;
}

interface MarkdownViewerProps {
    content: string;
    liveTokens?: Record<string, LiveBlockToken>;
    className?: string;
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

export function MarkdownViewer({ content, liveTokens = {}, className }: MarkdownViewerProps) {
    return (
        <div className={cn("prose prose-invert max-w-none text-sm leading-relaxed", className)}>
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    p: ({ children }) => <p className="mb-4 last:mb-0">{children}</p>,
                    a: ({ href, children }) => (
                        <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                            {children}
                        </a>
                    ),
                    code({ node, inline, className, children, ...props }: any) {
                        const text = String(children).replace(/\n$/, "");

                        // Match the AST token to a known Live Block (case-insensitive filename match or exact match)
                        // First try exact match
                        let matchedToken = liveTokens[text];

                        // If no exact match, try matching strictly against the filename part
                        if (!matchedToken) {
                            const possibleKey = Object.keys(liveTokens).find(k => k.split('/').pop() === text);
                            if (possibleKey) matchedToken = liveTokens[possibleKey];
                        }

                        if (inline && matchedToken) {
                            const tokenState = matchedToken.driftStatus === "drifted" ? "border-amber-500/50 text-amber-500 bg-amber-500/10" : "border-emerald-500/50 text-emerald-400 bg-emerald-500/10";

                            return (
                                <HoverCard openDelay={200} closeDelay={100}>
                                    <HoverCardTrigger asChild>
                                        <span className={cn(
                                            "cursor-pointer border-b-2 border-dashed font-mono px-1.5 py-0.5 rounded transition-all",
                                            tokenState,
                                            "hover:bg-opacity-20 hover:shadow-[0_0_10px_currentColor]"
                                        )}>
                                            {text}
                                        </span>
                                    </HoverCardTrigger>
                                    <HoverCardContent side="top" align="center" className="w-[600px] p-0 border-0 shadow-2xl bg-transparent relative z-50">
                                        <div className="absolute -top-6 left-0 right-0 flex justify-center pointer-events-none">
                                            <div className="bg-background/80 backdrop-blur border border-border text-foreground text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-t-lg flex items-center gap-2 shadow-lg">
                                                <Code2 className="w-3 h-3 text-primary" />
                                                Live AST Block Linked
                                            </div>
                                        </div>
                                        <LiveCodeBlock
                                            owner={matchedToken.owner}
                                            repo={matchedToken.repo}
                                            filePath={matchedToken.filePath}
                                            refSha={matchedToken.refSha}
                                            driftStatus={matchedToken.driftStatus}
                                            language={detectLanguage(matchedToken.filePath)}
                                            className="max-h-[400px]"
                                        />
                                    </HoverCardContent>
                                </HoverCard>
                            );
                        }

                        // Render standard code block if it is not a matched AST token
                        return (
                            <code className={cn("bg-muted px-1.5 py-0.5 rounded font-mono text-xs", className)} {...props}>
                                {children}
                            </code>
                        );
                    },
                    ul: ({ children }) => <ul className="list-disc pl-5 mb-4 space-y-1">{children}</ul>,
                    ol: ({ children }) => <ol className="list-decimal pl-5 mb-4 space-y-1">{children}</ol>,
                    blockquote: ({ children }) => <blockquote className="border-l-4 border-primary/50 pl-4 py-1 italic bg-muted/20 my-4 rounded-r">{children}</blockquote>,
                }}
            >
                {content}
            </ReactMarkdown>
        </div>
    );
}
