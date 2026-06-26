// SPDX-License-Identifier: AGPL-3.0-or-later
import { Sidebar } from "@/components/layout/Sidebar"
import { SessionGuard } from "@/components/layout/SessionGuard"
import { Breadcrumbs } from "@/components/layout/Breadcrumbs"
import { Toaster } from "@/components/ui/sonner"
import { CommandPalette } from "@/components/layout/CommandPalette"
import { TrialBanner } from "@/components/dashboard/TrialBanner"
import { NewFeaturesBanner } from "@/components/dashboard/NewFeaturesBanner"

interface DashboardLayoutProps {
    children: React.ReactNode
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
    return (
        <div className="flex min-h-screen overflow-hidden">
            <SessionGuard />
            <Sidebar />
            <main className="flex-1 overflow-y-auto bg-background text-foreground page-stage">
                <div className="w-full">
                    <TrialBanner />
                    <NewFeaturesBanner />
                    <div className="app-container py-6">
                        <Breadcrumbs />
                    </div>
                    {children}
                </div>
            </main>
            <Toaster />
            <CommandPalette />
        </div>
    )
}
