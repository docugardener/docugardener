// SPDX-License-Identifier: AGPL-3.0-or-later
"use client";

import Link from "next/link";
import { FileSearch, GitBranch, ArrowRight, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";

interface GettingStartedEmptyProps {
  /** Whether at least one repo has been connected */
  hasRepos: boolean;
  /** Context helps tailor the heading copy */
  context?: "inbox" | "jobs" | "dashboard";
}

export function GettingStartedEmpty({
  hasRepos,
  context = "inbox",
}: GettingStartedEmptyProps) {
  if (!hasRepos) {
    return <NoReposEmpty context={context} />;
  }
  return <WaitingForPREmpty context={context} />;
}

function NoReposEmpty({
  context,
}: {
  context: GettingStartedEmptyProps["context"];
}) {
  const headingMap = {
    inbox: "No drift alerts yet",
    jobs: "No analysis jobs yet",
    dashboard: "Welcome to DocuGardener",
  } as const;

  const heading = headingMap[context ?? "inbox"];

  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center gap-6">
      <div className="rounded-full bg-muted p-4">
        <GitBranch className="h-8 w-8 text-muted-foreground" />
      </div>
      <div className="max-w-sm space-y-2">
        <h3 className="text-lg font-semibold">{heading}</h3>
        <p className="text-sm text-muted-foreground">
          Connect a GitHub repository to start detecting documentation drift on
          every pull request.
        </p>
      </div>
      <div className="flex flex-col sm:flex-row gap-3">
        <Button asChild>
          <Link href="/dashboard/settings?tab=repositories">
            Set up a repository
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/demo">
            <Eye className="mr-2 h-4 w-4" />
            See a sample report
          </Link>
        </Button>
      </div>
    </div>
  );
}

function WaitingForPREmpty({
  context,
}: {
  context: GettingStartedEmptyProps["context"];
}) {
  const headingMap = {
    inbox: "Waiting for your first pull request",
    jobs: "No analysis jobs yet",
    dashboard: "Waiting for your first pull request",
  } as const;

  const bodyMap = {
    inbox:
      "DocuGardener will automatically analyse documentation drift the next time a pull request is opened against your connected repository.",
    jobs: "Analysis jobs appear here once DocuGardener processes a pull request in one of your connected repositories.",
    dashboard:
      "Open a pull request in one of your connected repositories and DocuGardener will analyse documentation drift automatically.",
  } as const;

  const heading = headingMap[context ?? "inbox"];
  const body = bodyMap[context ?? "inbox"];

  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center gap-6">
      <div className="rounded-full bg-muted p-4">
        <FileSearch className="h-8 w-8 text-muted-foreground" />
      </div>
      <div className="max-w-sm space-y-2">
        <h3 className="text-lg font-semibold">{heading}</h3>
        <p className="text-sm text-muted-foreground">{body}</p>
      </div>
      <Button variant="outline" asChild>
        <Link href="/demo">
          <Eye className="mr-2 h-4 w-4" />
          See a sample report
        </Link>
      </Button>
    </div>
  );
}
