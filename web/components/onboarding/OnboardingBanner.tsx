// SPDX-License-Identifier: AGPL-3.0-or-later
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { X, Rocket, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";

const BANNER_DISMISSED_KEY = "dg-onboarding-banner-dismissed";

interface OnboardingBannerProps {
  /**
   * Whether any repos are connected. When false, the banner is not shown.
   */
  hasRepos: boolean;
  /**
   * Whether any jobs have been processed. Banner only shows when this is false.
   */
  hasJobs: boolean;
}

export function OnboardingBanner({ hasRepos, hasJobs }: OnboardingBannerProps) {
  const [dismissed, setDismissed] = useState(true); // start hidden to avoid flash

  useEffect(() => {
    const stored = localStorage.getItem(BANNER_DISMISSED_KEY);
    setDismissed(stored === "true");
  }, []);

  if (!hasRepos || hasJobs || dismissed) {
    return null;
  }

  function handleDismiss() {
    localStorage.setItem(BANNER_DISMISSED_KEY, "true");
    setDismissed(true);
  }

  return (
    <div className="relative flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm dark:border-blue-900 dark:bg-blue-950/40">
      <Rocket className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
      <div className="flex-1 space-y-1">
        <p className="font-medium text-blue-900 dark:text-blue-100">
          Your repository is connected — now open a pull request!
        </p>
        <p className="text-blue-700 dark:text-blue-300">
          DocuGardener will automatically detect documentation drift when a PR
          is opened.{" "}
          <Link
            href="/demo"
            className="underline underline-offset-2 hover:text-blue-900 dark:hover:text-blue-100"
          >
            See a sample report
            <Eye className="ml-1 inline h-3 w-3" />
          </Link>
        </p>
      </div>
      <button
        onClick={handleDismiss}
        aria-label="Dismiss banner"
        className="rounded p-0.5 text-blue-500 hover:bg-blue-100 hover:text-blue-700 dark:hover:bg-blue-900 dark:hover:text-blue-200"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
