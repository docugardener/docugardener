// SPDX-License-Identifier: AGPL-3.0-or-later
import { getServerSession } from "next-auth"
import { authOptions } from "../../api/auth/[...nextauth]/route"
import { redirect } from "next/navigation"
import { Suspense } from "react"
import { prisma } from "@/lib/prisma"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PageHeader } from "@/components/layout/PageHeader"
import { TablePagination } from "@/components/ui/TablePagination"
import { AuditControls } from "@/components/audit/AuditControls"
import { AuditEventList, type AuditLogEntry } from "@/components/audit/AuditEventList"
import { ShieldCheck, Lock, Zap } from "lucide-react"
import Link from "next/link"
import { canAccessTenant } from "@/lib/features"

export const dynamic = "force-dynamic"

const PAGE_SIZE = 25

export default async function AuditPage({
    searchParams,
}: {
    searchParams: Promise<{ q?: string; page?: string; events?: string }>
}) {
    const { q: rawQ, page: rawPage, events: rawEvents } = await searchParams
    const session = await getServerSession(authOptions)
    const user = session?.user as any

    if (!session || !user?.tenantId) {
        redirect(session ? "/onboarding" : "/api/auth/signin")
    }

    if (user.role !== "ADMIN" && user.role !== "AUDITOR") {
        redirect("/dashboard")
    }

    // GTM-03 AC-2: audit log is a PRO+ feature
    const tenant = await prisma.tenant.findUnique({ where: { id: user.tenantId }, select: { plan: true, workflowConfig: true } })
    if (!canAccessTenant(tenant ?? { plan: "FREE" }, "audit_log")) {
        return (
            <div className="flex flex-col gap-6 p-6">
                <PageHeader
                    title="Audit Log"
                    description="Tamper-evident log of all security-relevant events in your tenant."
                />
                <Card>
                    <CardContent className="p-10 flex flex-col sm:flex-row items-center gap-8">
                        <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-muted shrink-0">
                            <Lock className="h-7 w-7 text-muted-foreground" />
                        </div>
                        <div className="flex-1 space-y-2 text-center sm:text-left">
                            <p className="text-sm font-black uppercase tracking-widest text-foreground">Audit Log — Pro Feature</p>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                                Upgrade to <strong>Pro</strong> or <strong>Team</strong> to access the tamper-evident audit log.
                                Track every login, settings change, and triage decision with SHA-256 hash chaining for compliance evidence.
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
            </div>
        )
    }

    const q = rawQ?.trim() ?? ""
    const eventList = rawEvents?.split(",").filter(Boolean) ?? []
    const page = Math.max(1, Number(rawPage ?? 1))

    const where = {
        tenantId: user.tenantId,
        ...(q !== "" && { actorEmail: { contains: q, mode: "insensitive" as const } }),
        ...(eventList.length > 0 && { event: { in: eventList } }),
    } as any

    const [totalCount, filteredCount, logs] = await Promise.all([
        prisma.auditLog.count({ where: { tenantId: user.tenantId } }),
        prisma.auditLog.count({ where }),
        prisma.auditLog.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip: (page - 1) * PAGE_SIZE,
            take: PAGE_SIZE,
            select: {
                id: true,
                actorEmail: true,
                actorIp: true,
                event: true,
                resourceType: true,
                resourceId: true,
                metadata: true,
                hash: true,
                createdAt: true,
            },
        }),
    ])

    const totalPages = Math.max(1, Math.ceil(filteredCount / PAGE_SIZE))

    return (
        <div className="flex flex-col gap-6 p-6">
            <PageHeader
                title="Audit Log"
                description="Tamper-evident log of all security-relevant events in your tenant."
            />

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
                        Events
                        <Badge variant="outline" className="ml-1 text-xs">{totalCount} total</Badge>
                    </CardTitle>
                    <div className="pt-1">
                        <Suspense>
                            <AuditControls showExport={canAccessTenant(tenant ?? { plan: "FREE" }, "audit_log_export")} />
                        </Suspense>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    {logs.length === 0 ? (
                        <div className="py-12 text-center text-sm text-muted-foreground">
                            {q || eventList.length > 0 ? "No events match your filters." : "No audit events recorded yet."}
                        </div>
                    ) : (
                        <>
                            <AuditEventList logs={logs as unknown as AuditLogEntry[]} />
                            <Suspense>
                                <TablePagination
                                    page={page}
                                    totalPages={totalPages}
                                    totalCount={filteredCount}
                                    pageSize={PAGE_SIZE}
                                />
                            </Suspense>
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
