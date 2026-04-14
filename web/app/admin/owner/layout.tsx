// SPDX-License-Identifier: AGPL-3.0-or-later
import { notFound } from "next/navigation"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
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
  // DG-OWN-01: gate — returns 404 (not 401) to avoid leaking existence
  if (!OWNER_EMAIL) notFound()

  const session = await getServerSession(authOptions)
  if (!session?.user?.email || session.user.email !== OWNER_EMAIL) notFound()

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
