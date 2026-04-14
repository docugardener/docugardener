// SPDX-License-Identifier: AGPL-3.0-or-later
"use client"

import { useState } from "react"
import { RepoImportWizard } from "@/components/repos/RepoImportWizard"

export function DashboardShell({
    children,
    initialRepoCount = 0,
    isAdmin = false,
}: {
    children: React.ReactNode,
    initialRepoCount?: number,
    isAdmin?: boolean,
}) {
    // Only ADMIN can set up repositories; other roles skip the wizard and see the dashboard
    const [showWizard, setShowWizard] = useState(isAdmin && initialRepoCount === 0)

    if (showWizard) {
        return (
            <div className="min-h-[80vh] flex items-center justify-center">
                <RepoImportWizard onComplete={() => setShowWizard(false)} />
            </div>
        )
    }

    return <div className="animate-entrance">{children}</div>
}
