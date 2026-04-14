// SPDX-License-Identifier: AGPL-3.0-or-later
"use client";

import React from "react";
import { LiveCodeBlock } from "@/components/editor/LiveCodeBlock";
import { Building2 } from "lucide-react";

export default function ComponentPlaygroundPage() {
    return (
        <div className="flex-1 space-y-8 p-8 pt-6">
            <div className="flex items-center justify-between space-y-2">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Component Sandbox</h2>
                    <p className="text-muted-foreground">
                        Live previews of the DocuGardener unified design system and core blocks.
                    </p>
                </div>
            </div>

            <div className="grid gap-8 mt-12">
                <section className="space-y-4">
                    <div className="flex items-center gap-2 pb-2 border-b">
                        <Building2 className="w-5 h-5 text-emerald-500" />
                        <h3 className="text-xl font-semibold">LiveCodeBlock [NEW-02]</h3>
                    </div>

                    <p className="text-sm text-zinc-400 max-w-2xl mb-6">
                        The LiveCodeBlock queries the GitHub API via the Python Backend to fetch raw code perfectly coupled to a SHA. It evaluates the provided driftStatus prop to decorate the block with the corresponding aesthetic context.
                    </p>

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                        {/* Synced State */}
                        <div className="space-y-3">
                            <h4 className="text-sm font-medium text-emerald-400">Status: Synced (Current)</h4>
                            <LiveCodeBlock
                                owner="DocuGardener"
                                repo="docugardener-demo"
                                filePath="src/api/auth.ts"
                                refSha="main"
                                language="typescript"
                                driftStatus="synced"
                            />
                        </div>

                        {/* Drifted State */}
                        <div className="space-y-3">
                            <h4 className="text-sm font-medium text-amber-500">Status: Drifted (Needs Attention)</h4>
                            <LiveCodeBlock
                                owner="DocuGardener"
                                repo="docugardener-demo"
                                filePath="src/api/auth.ts"
                                refSha="main"
                                language="typescript"
                                driftStatus="drifted"
                            />
                        </div>

                        {/* Unknown/Standard State */}
                        <div className="space-y-3">
                            <h4 className="text-sm font-medium text-zinc-400">Status: Unknown / Standard Block</h4>
                            <LiveCodeBlock
                                owner="DocuGardener"
                                repo="docugardener-demo"
                                filePath="src/api/auth.ts"
                                refSha="main"
                                language="typescript"
                                driftStatus="unknown"
                            />
                        </div>

                        {/* Error Handling State */}
                        <div className="space-y-3">
                            <h4 className="text-sm font-medium text-rose-500">Status: Path Error</h4>
                            <LiveCodeBlock
                                owner="DocuGardener"
                                repo="docugardener-demo"
                                filePath="src/non_existent_file.ts"
                                refSha="main"
                                language="typescript"
                                driftStatus="unknown"
                            />
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
}
