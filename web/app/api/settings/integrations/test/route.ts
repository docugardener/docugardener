import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"
import { canAccessTenant } from "@/lib/features"
import { decrypt } from "@/lib/encryption"

const VALID_TYPES = ["slack", "jira", "linear"] as const
type IntegrationType = typeof VALID_TYPES[number]

/**
 * POST /api/settings/integrations/test?type=slack|jira|linear
 *
 * Sends a test ping to the named integration.
 * Always returns 200 — errors are surfaced in the body as { ok: false, error: string }
 * so the caller never sees a 5xx for a connectivity failure.
 */
export async function POST(req: Request) {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }

    const url = new URL(req.url)
    const type = url.searchParams.get("type") as IntegrationType | null
    if (!type || !(VALID_TYPES as readonly string[]).includes(type)) {
        return NextResponse.json({ error: "invalid_type", valid: VALID_TYPES }, { status: 400 })
    }

    const { tenantId } = session.user as any
    const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true, plan: true, trialExpiresAt: true, workflowConfig: true },
    })

    // DG-ALIGN-01: canonical keys match PlatformCloud PRODUCT_REGISTRY
    const INTEGRATION_FEATURE: Record<IntegrationType, string> = {
        slack:  "slack_integration",
        jira:   "integrations_jira",
        linear: "integrations_linear",
    }
    const featureKey = INTEGRATION_FEATURE[type]
    if (!canAccessTenant(tenant!, featureKey as any)) {
        return NextResponse.json({ error: "feature_not_granted", feature: featureKey }, { status: 403 })
    }

    const wc = (tenant?.workflowConfig as any) || {}

    try {
        if (type === "slack") {
            return await pingSlack(wc)
        }
        if (type === "jira") {
            return await pingJira(wc)
        }
        if (type === "linear") {
            return await pingLinear(wc)
        }
    } catch (err: any) {
        return NextResponse.json({ ok: false, error: err?.message ?? "Unknown error" })
    }

    return NextResponse.json({ ok: false, error: "Unknown type" })
}

async function pingSlack(wc: any): Promise<NextResponse> {
    if (!wc.slack?.webhookUrl) {
        return NextResponse.json({ ok: false, error: "Slack not configured" })
    }
    try {
        const url = decrypt(wc.slack.webhookUrl)
        const resp = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: "✅ DocuGardener integration test — everything looks good!" }),
        })
        if (resp.ok) return NextResponse.json({ ok: true })
        return NextResponse.json({ ok: false, error: `Slack returned HTTP ${resp.status}` })
    } catch (err: any) {
        return NextResponse.json({ ok: false, error: err?.message ?? "Connection failed" })
    }
}

async function pingJira(wc: any): Promise<NextResponse> {
    if (!wc.jira?.host || !wc.jira?.email || !wc.jira?.apiToken) {
        return NextResponse.json({ ok: false, error: "Jira not configured" })
    }
    try {
        const token = decrypt(wc.jira.apiToken)
        const credentials = Buffer.from(`${wc.jira.email}:${token}`).toString("base64")
        const resp = await fetch(`${wc.jira.host}/rest/api/2/myself`, {
            headers: { Authorization: `Basic ${credentials}`, Accept: "application/json" },
        })
        if (resp.ok) return NextResponse.json({ ok: true })
        return NextResponse.json({ ok: false, error: `Jira returned HTTP ${resp.status}` })
    } catch (err: any) {
        return NextResponse.json({ ok: false, error: err?.message ?? "Connection failed" })
    }
}

async function pingLinear(wc: any): Promise<NextResponse> {
    if (!wc.linear?.apiToken) {
        return NextResponse.json({ ok: false, error: "Linear not configured" })
    }
    try {
        const token = decrypt(wc.linear.apiToken)
        const resp = await fetch("https://api.linear.app/graphql", {
            method: "POST",
            headers: { Authorization: token, "Content-Type": "application/json" },
            body: JSON.stringify({ query: "{ viewer { id name } }" }),
        })
        if (resp.ok) {
            const data = await resp.json()
            if (data?.data?.viewer?.id) return NextResponse.json({ ok: true })
            return NextResponse.json({ ok: false, error: "Linear authentication failed" })
        }
        return NextResponse.json({ ok: false, error: `Linear returned HTTP ${resp.status}` })
    } catch (err: any) {
        return NextResponse.json({ ok: false, error: err?.message ?? "Connection failed" })
    }
}
