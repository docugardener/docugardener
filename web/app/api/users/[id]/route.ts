// SPDX-License-Identifier: AGPL-3.0-or-later
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"
import { writeAuditLog, getClientIp, AuditEvent } from "@/lib/audit"
import { canAccessTenant } from "@/lib/features"

export async function PATCH(
    req: NextRequest,
    { params }: any
) {
    try {
        const resolvedParams = await params;
        const userId = resolvedParams.id;

        console.log(`[PATCH /api/users/${userId}] Starting request`);
        const session = await getServerSession(authOptions)

        if (!session) {
            console.error(`[PATCH] No session found`);
            return NextResponse.json({ error: "Unauthorized - No Session" }, { status: 401 })
        }

        console.log(`[PATCH] Session user:`, JSON.stringify(session.user));

        const { tenantId, role: currentUserRole } = session.user as any
        if (!tenantId) {
            console.error(`[PATCH] No tenantId in session`);
            return NextResponse.json({ error: "Unauthorized - No Tenant" }, { status: 401 })
        }

        if (currentUserRole !== "ADMIN") {
            return NextResponse.json({ error: `Only admins can change roles. You are: ${currentUserRole}` }, { status: 403 })
        }

        if (!userId) return NextResponse.json({ error: "User ID required" }, { status: 400 })

        // Prevent self-demotion
        if (userId === (session.user as any).id) {
            return NextResponse.json({ error: "You cannot change your own role. Ask another Admin to do it." }, { status: 400 })
        }

        const body = await req.json()
        const { role } = body
        const validRoles = ["ADMIN", "AUDITOR", "BILLING_ADMIN", "VIEWER"]
        if (!validRoles.includes(role)) {
            return NextResponse.json({ error: "Invalid role" }, { status: 400 })
        }

        // GTM-03 AC-3: AUDITOR and BILLING_ADMIN are PRO+ roles
        const PRO_ONLY_ROLES = ["AUDITOR", "BILLING_ADMIN"]
        if (PRO_ONLY_ROLES.includes(role)) {
            const tenantRecord = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { plan: true, workflowConfig: true } })
            const featureKey = role === "AUDITOR" ? "role_auditor" : "role_billing_admin"
            if (!canAccessTenant(tenantRecord!, featureKey)) {
                return NextResponse.json({ error: "role_unavailable", plan: tenantRecord?.plan ?? "FREE" }, { status: 400 })
            }
        }

        console.log(`[PATCH] Verifying target user ${userId} belongs to tenant ${tenantId}`);
        // First verify the user belongs to this tenant
        const existing = await prisma.user.findUnique({ where: { id: userId } })
        if (!existing || existing.tenantId !== tenantId) {
            console.error(`[PATCH] Target user not found or wrong tenant. DB record:`, existing);
            return NextResponse.json({ error: `User not found in your tenant` }, { status: 404 })
        }

        console.log(`[PATCH] Updating user ${userId} to role ${role}`);
        // Then update by primary key only (Prisma requirement)
        const user = await prisma.user.update({
            where: { id: userId },
            data: { role }
        })
        console.log(`[PATCH] Update successful`);
        await writeAuditLog({
            tenantId,
            actorId: (session.user as any).id,
            actorEmail: session.user.email,
            actorIp: getClientIp(req),
            event: AuditEvent.USER_ROLE_CHANGED,
            resourceType: "user",
            resourceId: userId,
            metadata: { previousRole: existing.role, newRole: role },
        })
        return NextResponse.json(user)
    } catch (e: any) {
        console.error("PATCH /api/users/[id] error:", e)
        return NextResponse.json({ error: `Server Error: ${e.message}` }, { status: 500 })
    }
}

export async function DELETE(
    req: NextRequest,
    { params }: any
) {
    try {
        const resolvedParams = await params;
        const userId = resolvedParams.id;

        const session = await getServerSession(authOptions)
        if (!session || !(session.user as any).tenantId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const { tenantId, role: currentUserRole } = session.user as any
        if (currentUserRole !== "ADMIN") {
            return NextResponse.json({ error: "Only admins can remove users" }, { status: 403 })
        }

        if (!userId) return NextResponse.json({ error: "User ID required" }, { status: 400 })

        if (userId === (session.user as any).id) {
            return NextResponse.json({ error: "You cannot remove yourself" }, { status: 400 })
        }

        // Verify ownership before update
        const existing = await prisma.user.findUnique({ where: { id: userId } })
        if (!existing || existing.tenantId !== tenantId) {
            return NextResponse.json({ error: "User not found in your tenant" }, { status: 404 })
        }
        const removed = await prisma.user.update({
            where: { id: userId },
            data: { tenantId: null, role: "VIEWER" }
        })
        await writeAuditLog({
            tenantId,
            actorId: (session.user as any).id,
            actorEmail: session.user.email,
            actorIp: getClientIp(req),
            event: AuditEvent.USER_REMOVED,
            resourceType: "user",
            resourceId: userId,
            metadata: { email: existing.email, previousRole: existing.role },
        })
        return NextResponse.json({ success: true, removed: true })
    } catch (e: any) {
        console.error("DELETE /api/users/[id] error:", e)
        return NextResponse.json({ error: `Server Error: ${e.message}` }, { status: 500 })
    }
}
