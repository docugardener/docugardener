// SPDX-License-Identifier: AGPL-3.0-or-later
"use client"

import { DashboardLayout } from "@/components/layout/DashboardLayout"

export default function Layout({ children }: { children: React.ReactNode }) {
    return <DashboardLayout>{children}</DashboardLayout>
}
