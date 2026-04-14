// SPDX-License-Identifier: AGPL-3.0-or-later
import { notFound } from "next/navigation"
import { getServerSession } from "next-auth"
import { cookies } from "next/headers"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { isOwnerTokenConfigured, verifyOwnerToken, OWNER_COOKIE_NAME } from "@/lib/owner-auth"
import OwnerChallenge from "@/components/admin/OwnerChallenge"
import Link from "next/link"
import { LayoutDashboard, Users, Zap, Activity } from "lucide-react"

const OWNER_EMAIL = process.env.OWNER_EMAIL

const NAV = [
  { href: "/admin/owner",          label: "Overview",  icon: LayoutDashboard },
  { href: "/admin/owner/tenants",  label: "Tenants",   icon: Users },
  { href: "/admin/owner/overrides",label: "Overrides", icon: Zap },
  { href: "/admin/owner/events",   label: "Events",    icon: Activity },
]

export default async function OwnerLayout({ children }: { children: React.ReactNode }) {
  // Gate 1: OWNER_EMAIL must be set
  if (!OWNER_EMAIL) notFound()

  // Gate 2: OWNER_ACCESS_TOKEN must be configured (SEC-OWN-01)
  if (!isOwnerTokenConfigured()) notFound()

  // Gate 3: session email must match (first factor)
  const session = await getServerSession(authOptions)
  if (!session?.user?.email || session.user.email !== OWNER_EMAIL) notFound()

  // Gate 4: HMAC cookie must be valid (second factor)
  const cookieStore = await cookies()
  const hmacCookie = cookieStore.get(OWNER_COOKIE_NAME)?.value ?? ""
  const userId = (session.user as { id?: string }).id ?? session.user.email
  const tokenValid = verifyOwnerToken(userId, hmacCookie)

  if (!tokenValid) {
    // Render challenge page — not a redirect, so layout can set the cookie via API route
    return <OwnerChallenge />
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <header className="bg-white border-b border-gray-200 h-12 flex items-center px-6 gap-4">
        <span className="text-xs font-black uppercase tracking-widest text-gray-400">
          DocuGardener
        </span>
        <span className="text-gray-300">|</span>
        <span className="text-xs font-bold text-green-600 uppercase tracking-widest">
          Owner Console
        </span>
        <span className="flex-1" />
        <span className="text-xs text-gray-400">{session.user.email}</span>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <nav className="w-48 shrink-0 border-r border-gray-200 bg-white min-h-[calc(100vh-3rem)] p-4">
          <ul className="space-y-1">
            {NAV.map(({ href, label, icon: Icon }) => (
              <li key={href}>
                <Link
                  href={href}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Content */}
        <main className="flex-1 p-8 max-w-5xl">{children}</main>
      </div>
    </div>
  )
}
