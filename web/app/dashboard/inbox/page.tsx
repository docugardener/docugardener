import { getServerSession } from "next-auth"
import { authOptions } from "../../api/auth/[...nextauth]/route"
import { redirect } from "next/navigation"
import { InboxPageClient } from "./InboxPageClient"

export const dynamic = 'force-dynamic'

export default async function InboxPage() {
    const session = await getServerSession(authOptions)
    if (!session?.user || !(session.user as any).tenantId) {
        redirect(session ? "/onboarding" : "/api/auth/signin")
    }
    const tenantId = (session.user as any).tenantId
    const role = (session.user as any).role
    return <InboxPageClient tenantId={tenantId} role={role} />
}
