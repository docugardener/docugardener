"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronRight, Home } from "lucide-react"

export function Breadcrumbs() {
    const pathname = usePathname()

    // Split path into segments, remove empty strings
    const segments = pathname.split('/').filter(Boolean)

    // Map standard routes to readable labels
    const labelMap: Record<string, string> = {
        dashboard: "Dashboard",
        settings: "Settings",
        activity: "Activity",
        inbox: "Inbox",
        jobs: "Jobs",
        reports: "Reports",
        prompts: "Prompt Engineering",
        simulation: "Simulator",
        components: "Components",
    }

    return (
        <nav className="flex items-center text-sm text-muted-foreground mb-6">
            <Link
                href="/dashboard"
                className="flex items-center gap-1 hover:text-foreground transition-colors"
            >
                <Home className="h-4 w-4" />
            </Link>

            {segments.map((segment, index) => {
                // Skip 'dashboard' as we linked home
                if (segment === 'dashboard' && index === 0) return null

                const href = `/${segments.slice(0, index + 1).join('/')}`
                const isLast = index === segments.length - 1
                const label = labelMap[segment] || segment.charAt(0).toUpperCase() + segment.slice(1)

                return (
                    <div key={href} className="flex items-center">
                        <ChevronRight className="h-4 w-4 mx-1 opacity-50" />
                        {isLast ? (
                            <span className="font-medium text-foreground">{label}</span>
                        ) : (
                            <Link
                                href={href}
                                className="hover:text-foreground transition-colors"
                            >
                                {label}
                            </Link>
                        )}
                    </div>
                )
            })}
        </nav>
    )
}
