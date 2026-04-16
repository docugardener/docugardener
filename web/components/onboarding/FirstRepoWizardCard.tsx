// SPDX-License-Identifier: AGPL-3.0-or-later
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { X, CheckCircle2, ArrowRight, Bell, GitPullRequest } from "lucide-react";
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
  },
  {
    icon: GitPullRequest,
    label: "Open a pull request to trigger your first analysis",
    done: false,
    href: null,
  },
  {
    icon: Bell,
    label: "Configure notifications so the team gets alerted",
    done: false,
    href: "/dashboard/settings?tab=notifications",
  },
] as const;

export function FirstRepoWizardCard({
  repoId,
  repoName,
}: FirstRepoWizardCardProps) {
  const [dismissed, setDismissed] = useState(true); // start hidden to avoid SSR flash

  useEffect(() => {
    const stored = localStorage.getItem(dismissedKey(repoId));
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
            return (
              <li key={i} className="flex items-start gap-2 text-sm">
                <Icon
                  className={`mt-0.5 h-4 w-4 shrink-0 ${
                    step.done
                      ? "text-green-600 dark:text-green-400"
                      : "text-muted-foreground"
                  }`}
                />
                {step.href ? (
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
