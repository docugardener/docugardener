// SPDX-License-Identifier: AGPL-3.0-or-later
import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"
import { canAddUser, getPlanLimits } from "@/lib/billing"
import { writeAuditLog, getClientIp, AuditEvent } from "@/lib/audit"
import { sendInviteEmail } from "@/lib/email"
import { createHash, randomBytes } from "crypto"

export async function GET(req: NextRequest) {
    const session = await getServerSession(authOptions)
    if (!session || !(session.user as any).tenantId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { tenantId, role } = session.user as any

    if (role !== "ADMIN") {
        return NextResponse.json(
            { error: "forbidden", reason: "Requires ADMIN role." },
            { status: 403 }
        )
    }

    const users = await prisma.user.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'asc' }
    })

    const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { plan: true }
    })

    const limits = getPlanLimits(tenant?.plan || "FREE")

    return NextResponse.json({
        users,
        usage: {
            current: users.length,
            limit: limits.seats
        },
        currentUserRole: session.user.role,
        currentUserId: session.user.id,
        tenantPlan: tenant?.plan ?? "FREE",
    })
}

export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions)
    if (!session || !(session.user as any).tenantId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { tenantId, role: currentUserRole } = session.user as any
    if (currentUserRole !== "ADMIN") {
        return NextResponse.json({ error: "Only admins can invite members" }, { status: 403 })
    }

    // 1. Check Seat Limits
    const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        include: { _count: { select: { users: true } } }
    })

    if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 })

    if (!canAddUser(tenant._count.users, tenant.plan)) {
        const limit = getPlanLimits(tenant.plan).seats
        return NextResponse.json({
            error: `Seat limit reached. Your ${tenant.plan} plan allows up to ${limit} members.`
        }, { status: 403 })
    }

    const body = await req.json()
    const { email } = body

    if (!email) return NextResponse.json({ error: "Email required" }, { status: 400 })

    let user = await prisma.user.findUnique({ where: { email } })

    if (!user) {
        user = await prisma.user.create({
            data: {
                email,
                tenantId: tenantId,
                role: "VIEWER"
            }
        })
    } else {
        if (user.tenantId === tenantId) {
            return NextResponse.json({ error: "User is already in this team" }, { status: 400 })
        }
        await prisma.user.update({
            where: { id: user.id },
            data: { tenantId: tenantId, role: "VIEWER" }
        })
    }

    await writeAuditLog({
        tenantId,
        actorId: (session.user as any).id,
        actorEmail: session.user.email,
        actorIp: getClientIp(req),
        event: AuditEvent.USER_INVITED,
        resourceType: "user",
        resourceId: user.id,
        metadata: { email: user.email, role: user.role },
    })

    // Generate a magic link and email it to the invited user
    try {
        const appUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3001"
        const token = randomBytes(32).toString("hex")
        // NextAuth v4 verifies tokens with SHA256(token + NEXTAUTH_SECRET)
        const secret = process.env.NEXTAUTH_SECRET ?? ""
        const hashedToken = createHash("sha256").update(`${token}${secret}`).digest("hex")
        const expires = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes

        await prisma.verificationToken.create({
            data: {
                identifier: email,
                token: hashedToken,
                expires,
            },
        })

        const magicUrl = `${appUrl}/api/auth/callback/email?token=${token}&email=${encodeURIComponent(email)}`
        await sendInviteEmail(email, magicUrl, session.user.email)
    } catch (emailErr) {
        // Non-fatal — user record is created, admin can re-invite if email fails
        console.error("[invite] Failed to send invite email:", emailErr)
    }

    return NextResponse.json(user)
}
