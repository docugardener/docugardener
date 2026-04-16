// SPDX-License-Identifier: AGPL-3.0-or-later
"use client";

import type { ComponentProps } from "react";
import Link from "next/link";
import { LogIn, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SemanticDiffViewer } from "@/components/inbox/SemanticDiffViewer";
import { DEMO_ALERT } from "@/lib/demo-fixture";

type AlertProp = ComponentProps<typeof SemanticDiffViewer>["alert"];

/**
 * Prompt shown below the viewer since the action buttons are suppressed.
 */
function SignInPrompt() {
  return (
    <Card className="mt-4 border-dashed">
      <CardContent className="flex flex-col items-center gap-3 py-6 text-center">
        <LogIn className="h-6 w-6 text-muted-foreground" />
        <p className="text-sm font-medium">
          Sign in to triage this in your own repos
        </p>
        <p className="text-xs text-muted-foreground max-w-xs">
          Connect your GitHub repository and DocuGardener will detect drift on
          every pull request automatically.
        </p>
        <Button asChild>
          <Link href="/api/auth/signin">
            Get started free
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

/** Minimal single-row representation of the demo alert (matches inbox list compact style) */
function DemoAlertRow() {
  return (
    <div className="px-4 py-3 bg-muted/30 border-l-2 border-l-orange-400">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">
            docugardener/docugardener
          </p>
          <p className="text-xs text-muted-foreground truncate">
            PR #42 · 3 files changed
          </p>
        </div>
        <span className="shrink-0 inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-900">
          Score 74
        </span>
      </div>
    </div>
  );
}

export function DemoDriftViewer() {
  // DEMO_ALERT is shape-compatible with AlertProp — cast is safe.
  // onAccept/onIgnore are optional per SemanticDiffViewer's prop interface;
  // passing undefined renders the viewer in read-only mode.
  const demoAlert = DEMO_ALERT as AlertProp;

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {/* Left: list (single item) */}
      <div className="w-full lg:w-80 shrink-0">
        <div className="rounded-lg border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b">
            <h2 className="text-sm font-semibold">Drift Alerts</h2>
          </div>
          <DemoAlertRow />
        </div>
      </div>

      {/* Right: full viewer — read-only mode */}
      <div className="flex-1 min-w-0">
        <SemanticDiffViewer
          alert={demoAlert}
          onAccept={undefined}
          onIgnore={undefined}
        />
        <SignInPrompt />
      </div>
    </div>
  );
}
