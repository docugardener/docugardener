"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { ChevronDown, ChevronUp, Menu, X } from "lucide-react"

const NAV = [
  {
    group: "Getting Started",
    items: [
      { label: "Overview", href: "/docs" },
      { label: "Quick Start (SaaS)", href: "/docs/quickstart" },
      { label: "Self-Hosting Guide", href: "/docs/self-hosting" },
    ],
  },
  {
    group: "User Guide",
    items: [
      { label: "Drift Detection", href: "/docs/user-guide/drift-detection" },
      { label: "Triage Inbox", href: "/docs/user-guide/triage-inbox" },
      { label: "Auto-Fix & AI Author Mode", href: "/docs/user-guide/auto-fix" },
      { label: "Repositories", href: "/docs/user-guide/repositories" },
      { label: "Notifications", href: "/docs/user-guide/notifications" },
      { label: "Documentation Policies", href: "/docs/user-guide/policies" },
      { label: "Team & RBAC", href: "/docs/user-guide/team" },
      { label: "Billing", href: "/docs/user-guide/billing" },
      { label: "Agent Governance", href: "/docs/user-guide/agent-governance" },
    ],
  },
  {
    group: "Self-Hosting",
    items: [
      { label: "Prerequisites", href: "/docs/self-hosting/prerequisites" },
      { label: "GitHub App Setup", href: "/docs/self-hosting/github-app" },
      { label: "Environment Variables", href: "/docs/self-hosting/environment" },
      { label: "Docker Compose", href: "/docs/self-hosting/docker" },
      { label: "Kubernetes / Helm", href: "/docs/self-hosting/kubernetes" },
      { label: "Upgrading", href: "/docs/self-hosting/upgrades" },
    ],
  },
  {
    group: "Developer Guide",
    items: [
      { label: "Architecture", href: "/docs/developer/architecture" },
      { label: "API Reference", href: "/docs/developer/api-reference" },
      { label: "Webhooks", href: "/docs/developer/webhooks" },
      { label: "Environment Variables", href: "/docs/developer/environment" },
      { label: "Contributing", href: "/docs/developer/contributing" },
      { label: "Running Tests", href: "/docs/developer/testing" },
    ],
  },
]

interface DocsSidebarProps {
  mobileOpen: boolean
  onMobileClose: () => void
}

export function DocsSidebar({ mobileOpen, onMobileClose }: DocsSidebarProps) {
  const pathname = usePathname()

  // Determine which groups contain the active item
  const activeGroups = new Set(
    NAV.filter((section) => section.items.some((item) => item.href === pathname)).map(
      (section) => section.group
    )
  )

  // All groups expanded by default; track collapsed state per group
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const toggleGroup = (group: string) => {
    setCollapsed((prev) => ({ ...prev, [group]: !prev[group] }))
  }

  const isExpanded = (group: string) => {
    // Active group is always expanded
    if (activeGroups.has(group)) return true
    // Otherwise respect collapsed state; default to expanded (collapsed[group] === undefined → not collapsed)
    return !collapsed[group]
  }

  const sidebarContent = (
    <nav
      aria-label="Docs navigation"
      className="flex flex-col gap-1 py-4 px-3 overflow-y-auto h-full custom-scrollbar"
    >
      {NAV.map((section) => {
        const expanded = isExpanded(section.group)
        const isActiveGroup = activeGroups.has(section.group)

        return (
          <div key={section.group} className="mb-1">
            {/* Group header */}
            <button
              onClick={() => {
                // Active group cannot be collapsed
                if (!isActiveGroup) toggleGroup(section.group)
              }}
              aria-expanded={expanded}
              className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-left transition-colors ${
                isActiveGroup
                  ? "cursor-default"
                  : "hover:bg-gray-100 cursor-pointer"
              }`}
            >
              <span className="type-section-header text-[11px] font-black uppercase tracking-[0.2em] text-gray-500 select-none">
                {section.group}
              </span>
              {!isActiveGroup && (
                expanded
                  ? <ChevronUp className="w-3 h-3 text-gray-400 shrink-0" aria-hidden />
                  : <ChevronDown className="w-3 h-3 text-gray-400 shrink-0" aria-hidden />
              )}
            </button>

            {/* Items */}
            {expanded && (
              <ul className="mt-0.5 flex flex-col gap-0.5">
                {section.items.map((item) => {
                  const isActive = pathname === item.href
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onMobileClose}
                        className={`block px-3 py-1.5 rounded text-sm transition-colors ${
                          isActive
                            ? "text-green-600 font-semibold bg-green-50"
                            : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                        }`}
                        aria-current={isActive ? "page" : undefined}
                      >
                        {item.label}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )
      })}
    </nav>
  )

  return (
    <>
      {/* Desktop sidebar — fixed left panel */}
      <aside
        className="hidden md:flex flex-col w-60 shrink-0 border-r border-gray-100 bg-background h-[calc(100vh-3.5rem)] sticky top-14 overflow-hidden"
        aria-label="Documentation sidebar"
      >
        {sidebarContent}
      </aside>

      {/* Mobile drawer overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Docs navigation"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={onMobileClose}
            aria-hidden
          />

          {/* Drawer panel */}
          <aside className="absolute left-0 top-0 h-full w-72 bg-background shadow-xl flex flex-col z-50">
            <div className="flex items-center justify-between px-4 h-14 border-b border-gray-100 shrink-0">
              <span className="text-sm font-semibold text-gray-900">Docs Navigation</span>
              <button
                onClick={onMobileClose}
                className="p-1.5 rounded hover:bg-gray-100 transition-colors"
                aria-label="Close navigation"
              >
                <X className="w-4 h-4 text-gray-600" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">{sidebarContent}</div>
          </aside>
        </div>
      )}
    </>
  )
}

/**
 * Standalone hamburger button — render this in the docs header on mobile.
 * Usage:
 *   const [open, setOpen] = useState(false)
 *   <DocsSidebarToggle onClick={() => setOpen(true)} />
 *   <DocsSidebar mobileOpen={open} onMobileClose={() => setOpen(false)} />
 */
export function DocsSidebarToggle({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="md:hidden p-2 rounded hover:bg-gray-100 transition-colors"
      aria-label="Open navigation menu"
    >
      <Menu className="w-5 h-5 text-gray-700" aria-hidden />
    </button>
  )
}
