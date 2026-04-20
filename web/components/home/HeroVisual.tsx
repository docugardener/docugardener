// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * HeroVisual — placeholder hero visual for FEAT-021.
 *
 * Renders an on-brand "check-run result" card that reads as
 * "this is what DG looks like in a PR" without requiring a real
 * screenshot or animation asset.
 *
 * The final visual asset (animated SVG / real screenshot / Lottie) is a
 * separate designer/owner task — this component is a drop-in replacement
 * target. Final asset replaces this file; no other changes needed.
 */

import { Check, AlertTriangle, FileText } from "lucide-react"

export function HeroVisual() {
  return (
    <div className="relative w-full max-w-xl mx-auto lg:mx-0">
      {/* Glow backdrop */}
      <div className="absolute -inset-4 bg-gradient-to-br from-green-100 via-transparent to-blue-100 rounded-3xl blur-2xl opacity-60" aria-hidden />

      {/* Browser chrome card */}
      <div className="relative bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
        {/* Chrome bar */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50">
          <span className="w-2.5 h-2.5 rounded-full bg-red-300" />
          <span className="w-2.5 h-2.5 rounded-full bg-yellow-300" />
          <span className="w-2.5 h-2.5 rounded-full bg-green-300" />
          <span className="flex-1" />
          <span className="text-[10px] text-gray-400 font-mono">github.com/acme/api · PR #284</span>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* PR title */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Pull request</p>
            <p className="text-sm font-semibold text-gray-900">feat: rename /users endpoint to /accounts</p>
          </div>

          {/* Checks */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs">
              <Check className="w-3.5 h-3.5 text-green-600" />
              <span className="text-gray-700">Tests</span>
              <span className="flex-1 text-right text-gray-400">passing</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <Check className="w-3.5 h-3.5 text-green-600" />
              <span className="text-gray-700">Lint</span>
              <span className="flex-1 text-right text-gray-400">passing</span>
            </div>
            <div className="flex items-center gap-2 text-xs bg-amber-50 border border-amber-100 rounded-md px-2 py-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
              <span className="font-semibold text-amber-800">DocuGardener</span>
              <span className="flex-1 text-right text-amber-700">drift detected</span>
            </div>
          </div>

          {/* Drift report teaser */}
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Drift score</p>
              <p className="text-sm font-mono font-semibold text-amber-700">78 / 100</p>
            </div>
            <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-green-400 via-amber-400 to-red-400" style={{ width: "78%" }} />
            </div>
            <div className="flex items-start gap-2 pt-1">
              <FileText className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
              <p className="text-[11px] text-gray-600 leading-relaxed">
                <span className="font-mono text-gray-700">README.md</span>,
                {" "}<span className="font-mono text-gray-700">quickstart.md</span>,
                {" "}<span className="font-mono text-gray-700">openapi.yaml</span>
                {" "}reference <span className="font-mono">/users</span> — auto-fix PR drafted.
              </p>
            </div>
          </div>

          {/* Fix PR row */}
          <div className="flex items-center gap-2 rounded-lg border border-green-100 bg-green-50 px-3 py-2">
            <Check className="w-3.5 h-3.5 text-green-600 shrink-0" />
            <p className="text-[11px] text-green-900 leading-snug">
              <span className="font-semibold">Fix PR #285</span> opened automatically — ready to merge.
            </p>
          </div>
        </div>
      </div>

      {/* Placeholder marker — replace this file when final asset ships */}
      <p className="mt-3 text-[10px] font-mono text-gray-300 text-center tracking-widest uppercase">
        placeholder visual · final asset pending
      </p>
    </div>
  )
}
