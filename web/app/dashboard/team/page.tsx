// SPDX-License-Identifier: AGPL-3.0-or-later
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import Link from "next/link"
import { UserList } from "@/components/user-list"
import { RevokeSessionsButton } from "@/components/team/RevokeSessionsButton"
import { Users, Lock, Zap } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { StatusChip } from "@/components/ui/status-chip"
import { PageHeader } from "@/components/layout/PageHeader"
import { DashboardShell } from "@/components/dashboard/DashboardShell"

export const metadata = {
    title: "Team | DocuGardener",
}

export default async function TeamPage() {
    const session = await getServerSession(authOptions)
    if (!session?.user || !(session.user as any).tenantId) {
        redirect(session ? "/onboarding" : "/auth/signin")
    }

    const tenantId = (session.user as any).tenantId
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { plan: true } })

    return (
        <div className="w-full min-h-screen bg-background pb-20 font-sans text-foreground">
            <PageHeader
                title="TEAM"
                description="Manage workspace members and their roles."
                subtitle={
                    <div className="flex items-center gap-2 text-primary mb-2 font-black text-[11px] uppercase tracking-[0.3em]">
                        <Users className="h-4 w-4" />
                        Access Control
                    </div>
                }
            />
            <div className="app-container">
                <DashboardShell>
                    {tenant?.plan === "FREE" ? (
                        <Card>
                            <CardContent className="p-10 flex flex-col sm:flex-row items-center gap-8">
                                <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-muted shrink-0">
                                    <Lock className="h-7 w-7 text-muted-foreground" />
                                </div>
                                <div className="flex-1 space-y-2 text-center sm:text-left">
                                    <p className="text-sm font-black uppercase tracking-widest text-foreground">Team Management — Pro Feature</p>
                                    <p className="text-xs text-muted-foreground leading-relaxed">
                                        Upgrade to <strong>Pro</strong> or <strong>Team</strong> to invite members, assign roles, and manage access.
                                        On the Free plan you are the sole workspace member.
                                    </p>
                                </div>
                                <Link href="/dashboard/billing" className="shrink-0">
                                    <button className="inline-flex items-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors px-5 py-2.5 rounded-lg text-sm font-medium">
                                        <Zap className="w-4 h-4" />
                                        Upgrade to Pro
                                    </button>
                                </Link>
                            </CardContent>
                        </Card>
                    ) : (
                        <Card className="rounded-card border-border bg-card shadow-card-hover flex flex-col overflow-hidden animate-entrance">
                            <CardHeader className="border-b border-border pb-4 bg-muted/50">
                                <StatusChip variant="primary" label="TEAM" className="mb-2" />
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <CardTitle className="type-section-header">Team Members</CardTitle>
                                        <CardDescription className="type-body text-muted-foreground mt-1">
                                            Invite members, manage roles, and track seat usage.
                                        </CardDescription>
                                    </div>
                                    <RevokeSessionsButton />
                                </div>
                            </CardHeader>
                            <CardContent className="p-8">
                                <UserList />
                            </CardContent>
                        </Card>
                    )}
                </DashboardShell>
            </div>
        </div>
    )
}
