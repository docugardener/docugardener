export const dynamic = "force-dynamic"
// SPDX-License-Identifier: AGPL-3.0-or-later
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { NextResponse } from "next/server"
import { writeAuditLog, getClientIp, AuditEvent } from "@/lib/audit"

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000"

/** GET /api/inbox/[id] — poll a single job for fixPrUrl after accepting */
export async function GET(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getServerSession(authOptions)
    if (!session || !session.user || !session.user.tenantId) {
        return new NextResponse("Unauthorized", { status: 401 })
    }

    const role = (session.user as any).role
    if (!["ADMIN", "VIEWER"].includes(role)) {
        return new NextResponse(
            JSON.stringify({ error: "forbidden", reason: "Requires ADMIN or VIEWER role." }),
            { status: 403 }
        )
    }

    const { id } = await params

    const tenantId = session.user.tenantId
    try {
        const res = await fetch(`${BACKEND_URL}/inbox/${id}`, {
            headers: { "X-Tenant-ID": tenantId },
        })
        if (!res.ok) {
            return NextResponse.json(
                { error: `Backend returned ${res.status}` },
                { status: res.status }
            )
        }
        const data = await res.json()
        return NextResponse.json(data)
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

/** PATCH /api/inbox/[id]?status=ACCEPTED|IGNORED — update triage status */
export async function PATCH(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getServerSession(authOptions)
    if (!session || !session.user || !session.user.tenantId) {
        return new NextResponse("Unauthorized", { status: 401 })
    }

    const patchRole = (session.user as any).role
    if (patchRole !== "ADMIN") {
        return new NextResponse(
            JSON.stringify({ error: "forbidden", reason: "Requires ADMIN role." }),
            { status: 403 }
        )
    }

    const { id } = await params
    const { searchParams } = new URL(req.url)
    const status = searchParams.get("status")

    if (!status) {
        return NextResponse.json({ error: "Status is required" }, { status: 400 })
    }

    let reason: string | undefined
    try {
        const body = await req.json()
        reason = body?.reason
    } catch { /* body absent — fine */ }

    try {
        // DOCPOL-01: fetch current job result before patching so we can check
        // for blocking-with-reason violations and emit the correct audit event.
        // @ts-ignore
        const tenantId = session.user.tenantId
        const tenantHeaders = { "X-Tenant-ID": tenantId }

        let policyViolations: any[] = []
        try {
            const jobRes = await fetch(`${BACKEND_URL}/inbox/${id}`, { headers: tenantHeaders })
            if (jobRes.ok) {
                const jobData = await jobRes.json()
                policyViolations = jobData?.result?.policy_violations ?? []
            }
        } catch { /* non-fatal — audit event simply won't fire */ }

        const backendUrl = new URL(`${BACKEND_URL}/inbox/${id}`)
        backendUrl.searchParams.set("status", status!)
        if (reason) backendUrl.searchParams.set("dismiss_reason", reason)

        const res = await fetch(backendUrl.toString(), { method: "PATCH", headers: tenantHeaders })

        if (res.ok) {
            const actorId = session.user.id as string | undefined
            await writeAuditLog({
                tenantId,
                actorId,
                actorEmail: session.user.email,
                actorIp: getClientIp(req),
                event: AuditEvent.TRIAGE_DECISION,
                resourceType: "job",
                resourceId: id,
                metadata: { status, reason: reason ?? null },
            })

            // DOCPOL-01: emit extra audit event when dismissing a blocking-with-reason policy
            if (status === "IGNORED") {
                const bwrViolations = policyViolations.filter(
                    (v: any) => v.enforcement === "blocking-with-reason"
                )
                if (bwrViolations.length > 0) {
                    await writeAuditLog({
                        tenantId,
                        actorId,
                        actorEmail: session.user.email,
                        actorIp: getClientIp(req),
                        event: AuditEvent.POLICY_VIOLATION_DISMISSED,
                        resourceType: "job",
                        resourceId: id,
                        metadata: {
                            policy_rules: bwrViolations.map((v: any) => v.rule_name),
                            dismiss_reason: reason ?? null,
                        },
                    })
                }
            }
        }

        const data = await res.json()
        return NextResponse.json(data, { status: res.status })
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
