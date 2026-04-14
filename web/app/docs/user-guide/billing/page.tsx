// SPDX-License-Identifier: AGPL-3.0-or-later
import Link from "next/link"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Billing — DocuGardener Docs",
  description:
    "Plans, pricing, quota, and subscription management for DocuGardener SaaS.",
}

export default function BillingPage() {
  return (
    <>
      <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight mb-2">
        Billing
      </h1>
      <p className="text-lg text-gray-500 mb-8">
        DocuGardener SaaS is available on three plans. Billing is handled securely by Stripe.
        Self-hosted instances have no billing — all features are available under the AGPL license.
      </p>

      {/* ── Plans ─────────────────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mb-4">Plans</h2>
      <table className="w-full text-sm border-collapse mb-8">
        <thead>
          <tr>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">Plan</th>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">Price</th>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">PR analyses / mo</th>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">Key features</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="px-3 py-2 border border-gray-200 font-medium text-gray-700">FREE</td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">$0 / month</td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">50</td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">Drift detection, Triage Inbox, GitHub check runs</td>
          </tr>
          <tr>
            <td className="px-3 py-2 border border-gray-200 font-medium text-blue-700">PRO</td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">$29 / month</td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">500</td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">+ AI Author Mode, Slack integration, JIRA/Linear, advanced analytics</td>
          </tr>
          <tr>
            <td className="px-3 py-2 border border-gray-200 font-medium text-purple-700">TEAM</td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">$79 / month</td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">Unlimited</td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">+ SSO/SAML, audit log, compliance templates, custom LLM rules, RBAC roles</td>
          </tr>
        </tbody>
      </table>

      {/* ── Upgrading ─────────────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">Upgrading Your Plan</h2>
      <ol className="list-decimal list-inside text-gray-600 space-y-3 mb-6">
        <li>Open <strong>Settings → Billing</strong>.</li>
        <li>Click <strong>Upgrade</strong> next to the plan you want.</li>
        <li>
          Complete the Stripe checkout. Your plan is upgraded immediately after payment.
          New quota limits take effect on the next PR analysis.
        </li>
      </ol>

      {/* ── Quota ─────────────────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">Quota and Overages</h2>
      <p className="text-gray-600 leading-relaxed mb-4">
        Quota is measured in <strong>PR analyses per calendar month</strong>. One analysis is
        consumed each time DocuGardener processes a pull-request event (open or synchronize).
        Re-runs of the same PR from additional commits each consume one analysis.
      </p>
      <p className="text-gray-600 leading-relaxed mb-4">
        When your quota is exhausted, new PR events receive a{" "}
        <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">Quota exceeded</span>{" "}
        GitHub check run. No analysis is performed and no Slack message is sent. Quota resets on the
        first day of each calendar month.
      </p>
      <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-blue-800 mb-6">
        There are no automatic overages or surprise charges. If you hit your limit, upgrade or wait
        for the monthly reset.
      </div>

      {/* ── Cancelling ───────────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">Cancelling Your Subscription</h2>
      <p className="text-gray-600 leading-relaxed mb-4">
        Open <strong>Settings → Billing</strong> and click <strong>Cancel subscription</strong>.
        Your plan remains active until the end of the current billing period. After that, your
        account reverts to the FREE plan — you keep your data and history.
      </p>

      {/* ── Self-hosted ───────────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">Self-Hosted Instances</h2>
      <p className="text-gray-600 leading-relaxed mb-4">
        Self-hosted DocuGardener is licensed under AGPL-3.0. There is no billing, no quota limit,
        and all features are available without a subscription. See the{" "}
        <Link href="/docs/self-hosting/docker" className="text-green-600 underline underline-offset-2 hover:text-green-700">
          self-hosting guide
        </Link>{" "}
        to get started.
      </p>
    </>
  )
}
