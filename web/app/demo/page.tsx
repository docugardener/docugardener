// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Public demo page — no auth required.
 * Shows a realistic sample drift report using SemanticDiffViewer.
 */

export const dynamic = "force-dynamic";

import Link from "next/link";
import type { Metadata } from "next";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { Button } from "@/components/ui/button";
import { DemoDriftViewer } from "@/components/demo/DemoDriftViewer";

export const metadata: Metadata = {
  title: "Sample Drift Report — DocuGardener",
  description:
    "See a real documentation drift analysis report. DocuGardener detects when code changes outpace your docs — on every pull request.",
};

export default function DemoPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <MarketingHeader activePage={undefined} />

      {/* Amber info banner */}
      <div className="bg-amber-50 border-b border-amber-200 dark:bg-amber-950/30 dark:border-amber-900">
        <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span>
                This is a sample drift report from a real analysis. Sign in to
                see your own.
              </span>
            </div>
            <Button
              size="sm"
              asChild
              className="shrink-0 bg-amber-600 hover:bg-amber-700 text-white dark:bg-amber-500 dark:hover:bg-amber-600"
            >
              <Link href="/api/auth/signin">
                Get started free
                <ArrowRight className="ml-2 h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <main className="flex-1">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="mb-6">
            <h1 className="text-2xl font-bold">Sample Drift Report</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Pull request{" "}
              <span className="font-mono text-foreground">#42</span> ·{" "}
              <span className="font-mono text-foreground">
                docugardener/docugardener
              </span>
            </p>
          </div>

          {/* Client component handles the interactive viewer */}
          <DemoDriftViewer />
        </div>
      </main>

      <MarketingFooter />
    </div>
  );
}
