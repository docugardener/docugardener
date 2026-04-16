// SPDX-License-Identifier: AGPL-3.0-or-later
import Link from "next/link"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Billing — DocuGardener Docs",
  description: "Plans, pricing, and subscription management for DocuGardener SaaS.",
}

export default function BillingPage() {
  return (
    <>
      <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight mb-2">
        Billing
      </h1>
      <p className="text-lg text-gray-500 mb-8">
        Plans, pricing, quota, and subscription management.
      </p>

      <div className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-5 mb-8">
        <p className="font-semibold text-amber-800 mb-1">Documentation coming soon</p>
        <p className="text-sm text-amber-700">
          This section is being written. For current pricing details, visit the{" "}
          <Link href="/pricing" className="underline font-medium hover:text-amber-900">
            pricing page
          </Link>
          .
        </p>
      </div>
    </>
  )
}
