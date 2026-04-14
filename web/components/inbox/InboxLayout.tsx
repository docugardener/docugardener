// SPDX-License-Identifier: AGPL-3.0-or-later
"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";

interface InboxLayoutProps {
    sidebar: React.ReactNode;
    content: React.ReactNode;
    sidebarWidth?: string;
}

export function InboxLayout({
    sidebar,
    content,
    sidebarWidth = "w-80",
}: InboxLayoutProps) {
    return (
        <div className="flex h-[calc(100vh-4rem)] overflow-hidden bg-card/60 backdrop-blur-2xl border-2 border-border shadow-2xl mx-4 my-2 rounded-2xl">
            {/* Sidebar - Alert List */}
            <div className={cn(
                "flex flex-col border-r-2 border-border bg-muted/20",
                sidebarWidth
            )}>
                <div className="p-4 border-b-2 border-border bg-card/30">
                    <h2 className="text-lg font-black tracking-tight text-foreground uppercase">Triage Inbox</h2>
                    <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Pending drift alerts</p>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {sidebar}
                </div>
            </div>

            {/* Main Content - Diff Viewer */}
            <div className="flex-1 flex flex-col bg-card/10 overflow-hidden">
                {content || (
                    <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8 text-center">
                        <div className="w-16 h-16 mb-4 rounded-full bg-muted flex items-center justify-center">
                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                        </div>
                        <h3 className="text-lg font-medium text-foreground">No Alert Selected</h3>
                        <p className="max-w-xs mt-2 text-muted-foreground">
                            Select a drift alert from the list on the left to review the semantic changes.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
