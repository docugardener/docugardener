import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"
import { randomBytes } from "crypto"

export const dynamic = "force-dynamic"

const KEY_PREFIX = "dg_"

export async function GET() {
    const session = await getServerSession(authOptions)
    if (!session || !(session.user as any).tenantId) {
        return new NextResponse("Unauthorized", { status: 401 })
    }
    const tenantId = (session.user as any).tenantId

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } })
    if (!tenant) return new NextResponse("Not Found", { status: 404 })

    const config = (tenant.workflowConfig as any) || {}
    const key: string | undefined = config.pluginApiKey

    if (key) {
        const visible = key.slice(0, KEY_PREFIX.length + 8)
        const masked = visible + "..." + key.slice(-4)
        return NextResponse.json({ pluginApiKey: masked, isSet: true })
    }
    return NextResponse.json({ pluginApiKey: null, isSet: false })
}

export async function POST() {
    const session = await getServerSession(authOptions)
    if (!session || !(session.user as any).tenantId) {
        return new NextResponse("Unauthorized", { status: 401 })
    }
    const tenantId = (session.user as any).tenantId

    if ((session.user as any).role !== "ADMIN") {
        return new NextResponse("Forbidden", { status: 403 })
    }

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } })
    if (!tenant) return new NextResponse("Not Found", { status: 404 })

    const newKey = KEY_PREFIX + randomBytes(24).toString("hex")
    const currentConfig = (tenant.workflowConfig as any) || {}

    await prisma.tenant.update({
        where: { id: tenantId },
        data: {
            workflowConfig: { ...currentConfig, pluginApiKey: newKey },
        },
    })

    return NextResponse.json({ pluginApiKey: newKey, isSet: true })
}

export async function DELETE() {
    const session = await getServerSession(authOptions)
    if (!session || !(session.user as any).tenantId) {
        return new NextResponse("Unauthorized", { status: 401 })
    }
    const tenantId = (session.user as any).tenantId

    if ((session.user as any).role !== "ADMIN") {
        return new NextResponse("Forbidden", { status: 403 })
    }

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } })
    if (!tenant) return new NextResponse("Not Found", { status: 404 })

    const currentConfig = (tenant.workflowConfig as any) || {}
    const { pluginApiKey: _removed, ...rest } = currentConfig

    await prisma.tenant.update({
        where: { id: tenantId },
        data: { workflowConfig: rest },
    })

    return NextResponse.json({ pluginApiKey: null, isSet: false })
}
