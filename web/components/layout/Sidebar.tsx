// SPDX-License-Identifier: AGPL-3.0-or-later
"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"
import {
    Settings, LogOut, MessageSquare, FlaskConical, Building2,
    Inbox, Search, BarChart3, History, ChevronDown, ChevronRight, Wrench, Users, CreditCard, ShieldCheck
} from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { useSession, signOut } from "next-auth/react"
import { ThemeToggle } from "@/components/ui/ThemeToggle"

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface SidebarProps extends React.HTMLAttributes<HTMLDivElement> { }

const mainNavLinks = [
    {
        href: "/dashboard/inbox",
        label: "Inbox",
        icon: Inbox,
        roles: ["ADMIN", "VIEWER"],
    },
    {
        href: "/dashboard/jobs",
        label: "Jobs",
        icon: History,
        roles: ["ADMIN", "AUDITOR", "VIEWER"],
    },
    {
        href: "/dashboard/reports",
        label: "Reports",
        icon: BarChart3,
        roles: ["ADMIN", "AUDITOR", "BILLING_ADMIN", "VIEWER"],
    },
    {
        href: "/dashboard/audit",
        label: "Audit Log",
        icon: ShieldCheck,
        roles: ["ADMIN", "AUDITOR"],
    },
    {
        href: "/dashboard/team",
        label: "Team",
        icon: Users,
        roles: ["ADMIN"],
    },
    {
        href: "/dashboard/billing",
        label: "Billing",
        icon: CreditCard,
        roles: ["ADMIN", "BILLING_ADMIN"],
    },
]

const devToolLinks = [
    {
        href: "/dashboard/prompts",
        label: "Prompt Engineering",
        icon: MessageSquare,
    },
    {
        href: "/dashboard/simulation",
        label: "Simulator",
        icon: FlaskConical,
    },
    {
        href: "/dashboard/components",
        label: "Components",
        icon: Building2,
    },
]

const devToolPaths = devToolLinks.map(l => l.href)

export function Sidebar({ className }: SidebarProps) {
    const pathname = usePathname()
    const { data: session } = useSession()

    // Explicitly type the user role from custom session override
    const userRole = (session?.user as any)?.role

    // Auto-expand Developer Tools when user is on one of those pages
    const [devToolsOpen, setDevToolsOpen] = useState(
        devToolPaths.some(p => pathname.startsWith(p))
    )

    // Unread inbox count — poll every 60s; hide badge when already on inbox page
    const [inboxCount, setInboxCount] = useState(0)
    useEffect(() => {
        const fetchCount = async () => {
            try {
                const res = await fetch("/api/inbox")
                if (!res.ok) return
                const data = await res.json()
                setInboxCount(Array.isArray(data) ? data.filter((j: any) => j.triageStatus === "COMPLETED").length : 0)
            } catch { /* silent */ }
        }
        fetchCount()
        const timer = setInterval(fetchCount, 60_000)
        return () => clearInterval(timer)
    }, [])

    return (
        <div
            id="dashboard-sidebar"
            data-sidebar="true"
            className={cn("relative z-50 pb-12 min-h-screen text-foreground w-64 flex flex-col border-r border-border", className)}
            style={{ transform: 'translateZ(0)' }}
        >
            <div className="space-y-4 py-8 px-6">
                <div className="flex items-center gap-3 mb-10 pl-2">
                    <div className="h-9 w-9 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
                        <span className="font-black text-white text-xs">DG</span>
                    </div>
                    <span className="text-xl font-bold tracking-tight text-foreground">DocuGardener</span>
                </div>

                <div className="mb-6">
                    <button
                        onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
                        className="flex w-full items-center justify-between rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground group"
                    >
                        <div className="flex items-center gap-2">
                            <Search className="h-4 w-4" />
                            <span className="font-medium">Search...</span>
                        </div>
                        <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-background px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100 group-hover:bg-muted transition-colors">
                            <span className="text-xs">⌘</span>K
                        </kbd>
                    </button>
                </div>

                {/* Main Navigation */}
                <div className="space-y-1.5">
                    {mainNavLinks.filter(link => link.roles.includes(userRole)).map((link) => {
                        const isActive = pathname.startsWith(link.href)
                        const showBadge = link.href === "/dashboard/inbox" && inboxCount > 0
                        return (
                            <Link
                                key={link.href}
                                href={link.href}
                                className={cn(
                                    "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold transition-all",
                                    isActive
                                        ? "bg-primary/20 text-primary shadow-sm ring-1 ring-primary/10"
                                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                                )}
                            >
                                <link.icon className={cn("h-4 w-4", isActive ? "text-primary" : "text-muted-foreground/60")} />
                                <span className="flex-1">{link.label}</span>
                                {showBadge && (
                                    <span className="ml-auto inline-flex items-center justify-center min-w-5 h-5 rounded-full bg-rose-500 text-white text-[10px] font-black px-1.5">
                                        {inboxCount > 99 ? "99+" : inboxCount}
                                    </span>
                                )}
                            </Link>
                        )
                    })}
                </div>

                {/* Developer Tools (collapsible) — ADMIN only */}
                {userRole === "ADMIN" && <div className="pt-2">
                    <button
                        onClick={() => setDevToolsOpen(prev => !prev)}
                        className="flex w-full items-center justify-between px-4 py-2 text-xs font-black uppercase tracking-widest text-muted-foreground/60 hover:text-muted-foreground transition-colors rounded-lg hover:bg-muted/30"
                    >
                        <div className="flex items-center gap-2">
                            <Wrench className="h-3 w-3" />
                            Developer Tools
                        </div>
                        {devToolsOpen
                            ? <ChevronDown className="h-3 w-3" />
                            : <ChevronRight className="h-3 w-3" />
                        }
                    </button>

                    {devToolsOpen && (
                        <div className="mt-1 space-y-1 pl-2">
                            {devToolLinks.map((link) => {
                                const isActive = pathname.startsWith(link.href)
                                return (
                                    <Link
                                        key={link.href}
                                        href={link.href}
                                        className={cn(
                                            "flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-bold transition-all",
                                            isActive
                                                ? "bg-primary/20 text-primary shadow-sm ring-1 ring-primary/10"
                                                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                                        )}
                                    >
                                        <link.icon className={cn("h-4 w-4", isActive ? "text-primary" : "text-muted-foreground/60")} />
                                        {link.label}
                                    </Link>
                                )
                            })}
                        </div>
                    )}
                </div>}
            </div>

            {/* Bottom: Settings + User */}
            <div className="mt-auto px-6 py-8 border-t border-border space-y-4">
                <div className="flex justify-end">
                    <ThemeToggle />
                </div>
                {/* Settings icon pill — ADMIN only */}
                {userRole === "ADMIN" && (
                    <Link
                        href="/dashboard/settings"
                        className={cn(
                            "flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-bold transition-all",
                            pathname.startsWith("/dashboard/settings")
                                ? "bg-primary/20 text-primary shadow-sm ring-1 ring-primary/10"
                                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                        )}
                    >
                        <Settings className={cn("h-4 w-4", pathname.startsWith("/dashboard/settings") ? "text-primary" : "text-muted-foreground/60")} />
                        Settings
                    </Link>
                )}

                {session?.user && (
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/30 border border-border/50">
                        <Avatar className="h-10 w-10 border border-border shrink-0">
                            <AvatarImage src={session.user.image || ""} />
                            <AvatarFallback className="bg-primary/20 text-primary text-sm font-black">
                                {session.user.email?.substring(0, 2).toUpperCase()}
                            </AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col min-w-0 flex-1">
                            <span className="text-sm font-bold truncate text-foreground">
                                {session.user.name || session.user.email?.split('@')[0]}
                            </span>
                            <span className="text-[10px] font-medium text-muted-foreground truncate">
                                {session.user.email}
                            </span>
                        </div>
                        <Badge variant={userRole === 'ADMIN' ? "default" : "outline"} className="text-[9px] px-1.5 py-0 h-4 rounded-sm">
                            {userRole}
                        </Badge>
                    </div>
                )}

                <button
                    onClick={() => signOut()}
                    className="flex items-center gap-3 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors w-full group py-2"
                >
                    <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center group-hover:bg-broken/10 transition-colors">
                        <LogOut className="h-4 w-4 text-slate-600 group-hover:text-rose-500 transition-colors" />
                    </div>
                    Sign Out
                </button>
            </div>
        </div>
    )
}
