// SPDX-License-Identifier: AGPL-3.0-or-later
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { X, CheckCircle2, ArrowRight, Bell, GitPullRequest, ExternalLink } from "lucide-react";
import { Analytics } from "@/lib/posthog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function dismissedKey(repoId: string) {
  return `dg-repo-wizard-dismissed-${repoId}`;
}

interface FirstRepoWizardCardProps {
  repoId: string;
  repoName: string;
}

const STEPS = [
  {
    icon: CheckCircle2,
    label: "Repository connected",
    done: true,
    href: null,
    external: false,
  },
  {
    icon: GitPullRequest,
    label: "Open a pull request to trigger your first analysis",
    done: false,
    href: null, // rendered as button below — needs repoName interpolation
    external: false,
  },
  {
    icon: Bell,
    label: "Configure notifications so the team gets alerted",
    done: false,
    href: "/dashboard/settings?tab=notifications",
    external: false,
  },
] as const;

export function FirstRepoWizardCard({
  repoId,
  repoName,
}: FirstRepoWizardCardProps) {
  const [dismissed, setDismissed] = useState(true); // start hidden to avoid SSR flash

  useEffect(() => {
    const stored = localStorage.getItem(dismissedKey(repoId));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDismissed(stored === "true");
  }, [repoId]);

  if (dismissed) {
    return null;
  }

  function handleDismiss() {
    localStorage.setItem(dismissedKey(repoId), "true");
    setDismissed(true);
  }

  return (
    <Card className="relative border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/20">
      <button
        onClick={handleDismiss}
        aria-label="Dismiss getting started card"
        className="absolute right-3 top-3 rounded p-0.5 text-muted-foreground hover:bg-muted"
      >
        <X className="h-4 w-4" />
      </button>
      <CardHeader className="pb-2 pr-10">
        <CardTitle className="text-sm font-semibold text-green-800 dark:text-green-300">
          Repository added — next steps
        </CardTitle>
        <CardDescription className="text-xs">
          {repoName}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <ol className="space-y-2">
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            const isPrStep = i === 1;
            return (
              <li key={i} className="flex items-start gap-2 text-sm">
                <Icon
                  className={`mt-0.5 h-4 w-4 shrink-0 ${
                    step.done
                      ? "text-green-600 dark:text-green-400"
                      : "text-muted-foreground"
                  }`}
                />
                {isPrStep ? (
                  <div className="flex flex-col gap-1">
                    <span className="text-muted-foreground">{step.label}</span>
                    <a
                      href={`https://github.com/${repoName}/compare`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary underline underline-offset-2 hover:text-primary/80"
                      onClick={() => Analytics.firstAnalysisTriggered({ repo: repoName })}
                    >
                      Open a test PR on GitHub
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                ) : step.href ? (
                  <Link
                    href={step.href}
                    className="underline underline-offset-2 hover:text-foreground text-muted-foreground"
                  >
                    {step.label}
                    <ArrowRight className="ml-1 inline h-3 w-3" />
                  </Link>
                ) : (
                  <span
                    className={
                      step.done ? "text-foreground" : "text-muted-foreground"
                    }
                  >
                    {step.label}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
        <div className="flex gap-2 pt-1">
          <Button size="sm" variant="outline" asChild>
            <Link href="/dashboard/inbox">Go to Inbox</Link>
          </Button>
          <Button size="sm" variant="ghost" onClick={handleDismiss}>
            Dismiss
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
