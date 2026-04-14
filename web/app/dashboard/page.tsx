// SPDX-License-Identifier: AGPL-3.0-or-later
import { getServerSession } from "next-auth"
import { authOptions } from "../api/auth/[...nextauth]/route"
import { redirect } from "next/navigation"

export const dynamic = 'force-dynamic'

export default async function Dashboard() {
    const session = await getServerSession(authOptions)
    if (!session?.user || !(session.user as any).tenantId) {
        redirect(session ? "/onboarding" : "/api/auth/signin")
    }
    const role = (session.user as any).role
    if (role === "AUDITOR") redirect("/dashboard/audit")
    if (role === "BILLING_ADMIN") redirect("/dashboard/billing")
    redirect("/dashboard/inbox")
}
