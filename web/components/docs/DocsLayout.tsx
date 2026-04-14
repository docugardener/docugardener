"use client"

import Link from "next/link"
import dynamic from "next/dynamic"
import { useState } from "react"
import { ArrowLeft, ArrowRight } from "lucide-react"
import { DocsSidebarToggle } from "@/components/docs/DocsSidebar"

// Load sidebar client-only — it depends on usePathname and client state
const DocsSidebar = dynamic(
  () => import("@/components/docs/DocsSidebar").then((m) => m.DocsSidebar),
  { ssr: false }
)

export interface DocsLayoutProps {
  children: React.ReactNode
  prev?: { label: string; href: string }
  next?: { label: string; href: string }
}

export function DocsLayout({ children, prev, next }: DocsLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* ── Top header bar ────────────────────────────────── */}
      <header className="sticky top-0 z-30 h-14 border-b border-gray-100 bg-background flex items-center px-4 gap-3 shrink-0">
        {/* Mobile hamburger */}
        <DocsSidebarToggle onClick={() => setSidebarOpen(true)} />

        {/* Logo + Docs badge */}
        <Link href="/" className="flex items-center gap-2 mr-auto" aria-label="DocuGardener home">
          <span className="text-base font-bold tracking-tight text-gray-900">DocuGardener</span>
          <span className="text-[11px] font-semibold uppercase tracking-widest px-1.5 py-0.5 rounded bg-green-100 text-green-700 leading-none">
            Docs
          </span>
        </Link>

        {/* Right-side actions */}
        <nav className="flex items-center gap-1" aria-label="Header actions">
          <Link
            href="/dashboard"
            className="text-sm text-gray-500 hover:text-gray-900 font-medium px-3 py-1.5 rounded hover:bg-gray-100 transition-colors"
          >
            Back to app
          </Link>
          <Link
            href="/auth/signin?signup=1"
            className="text-sm text-white font-semibold px-3 py-1.5 rounded bg-green-600 hover:bg-green-700 transition-colors"
          >
            Sign up free
          </Link>
        </nav>
      </header>

      {/* ── Body: sidebar + content ────────────────────────── */}
      <div className="flex flex-1 min-h-0">
        <DocsSidebar
          mobileOpen={sidebarOpen}
          onMobileClose={() => setSidebarOpen(false)}
        />

        {/* Main content column */}
        <main className="flex-1 min-w-0">
          <div className="max-w-3xl px-8 py-10 mx-0">
            {children}

            {/* ── Prev / Next navigation ─────────────────── */}
            {(prev || next) && (
              <nav
                aria-label="Page navigation"
                className="mt-16 pt-6 border-t border-gray-100 flex items-center justify-between gap-4"
              >
                {prev ? (
                  <Link
                    href={prev.href}
                    className="group flex items-center gap-2 text-sm text-gray-500 hover:text-green-600 transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4 shrink-0 transition-transform group-hover:-translate-x-0.5" aria-hidden />
                    <span className="flex flex-col">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 group-hover:text-green-500">
                        Previous
                      </span>
                      <span className="font-medium">{prev.label}</span>
                    </span>
                  </Link>
                ) : (
                  <span />
                )}

                {next ? (
                  <Link
                    href={next.href}
                    className="group flex items-center gap-2 text-sm text-gray-500 hover:text-green-600 transition-colors text-right ml-auto"
                  >
                    <span className="flex flex-col items-end">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 group-hover:text-green-500">
                        Next
                      </span>
                      <span className="font-medium">{next.label}</span>
                    </span>
                    <ArrowRight className="w-4 h-4 shrink-0 transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </Link>
                ) : (
                  <span />
                )}
              </nav>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
