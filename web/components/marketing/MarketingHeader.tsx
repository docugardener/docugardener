// SPDX-License-Identifier: AGPL-3.0-or-later
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Logo } from "@/components/brand/Logo"

interface MarketingHeaderProps {
  activePage?: "features" | "faq" | "pricing" | "docs" | "trust" | null
}

export function MarketingHeader({ activePage }: MarketingHeaderProps) {
  const linkClass = (page: string) =>
    `text-sm transition font-medium ${
      activePage === page
        ? "text-green-600 font-semibold"
        : "text-gray-600 hover:text-gray-900"
    }`

  return (
    <header className="px-6 h-16 flex items-center justify-between border-b border-gray-100">
      <Link href="/" className="flex items-center gap-2">
        <Logo variant="lockup" height={48} />
      </Link>
      <nav className="flex gap-4 items-center">
        <Link href="/features" className={linkClass("features")}>Features</Link>
        <Link href="/pricing" className={linkClass("pricing")}>Pricing</Link>
        <Link href="/faq" className={linkClass("faq")}>FAQ</Link>
        <Link href="/docs" className={linkClass("docs")}>Docs</Link>
        <Link href="/trust" className={linkClass("trust")}>Trust</Link>
        <Link href="/api/auth/signin">
          <Button variant="ghost">Sign In</Button>
        </Link>
        <Link href="/api/auth/signin">
          <Button>Get Started</Button>
        </Link>
      </nav>
    </header>
  )
}
