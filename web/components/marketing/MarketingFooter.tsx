import Link from "next/link"

export function MarketingFooter() {
  return (
    <footer className="py-8 text-center text-sm text-gray-400 border-t border-gray-100 space-x-4">
      <Link href="/terms" className="hover:text-gray-600 transition">Terms</Link>
      <span>&middot;</span>
      <Link href="/privacy" className="hover:text-gray-600 transition">Privacy</Link>
      <span>&middot;</span>
      <span>&copy; {new Date().getFullYear()} DocuGardener. All rights reserved.</span>
    </footer>
  )
}
