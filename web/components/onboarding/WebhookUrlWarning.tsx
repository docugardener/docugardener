// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * UX-ONBOARD-01 — Amber warning shown above the "Create GitHub App" button
 * when NEXT_PUBLIC_WEBHOOK_URL is empty or contains the placeholder value.
 *
 * Usage:
 *   import { WebhookUrlWarning } from "@/components/onboarding/WebhookUrlWarning";
 *   ...
 *   {showCreateAppSection && (
 *     <>
 *       <WebhookUrlWarning />
 *       <button onClick={handleCreateApp}>Create GitHub App</button>
 *     </>
 *   )}
 */
import React from "react";
import { AlertTriangle } from "lucide-react";

const WEBHOOK_URL = process.env.NEXT_PUBLIC_WEBHOOK_URL ?? "";

/** True when the webhook URL is missing or still holds the placeholder value. */
export const webhookUrlIsUnset =
  !WEBHOOK_URL || WEBHOOK_URL.includes("YOUR_CHANNEL_ID");

/**
 * Inline amber warning box.  Renders nothing when the webhook URL looks valid.
 */
export function WebhookUrlWarning(): React.JSX.Element | null {
  if (!webhookUrlIsUnset) return null;

  return (
    <div
      role="alert"
      aria-live="polite"
      data-testid="webhook-url-warning"
      className="flex gap-3 rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40 p-4 text-sm text-amber-800 dark:text-amber-300"
    >
      <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" aria-hidden="true" />
      <span>
        Creating a GitHub App requires a publicly reachable webhook URL. For
        local installs, create a free channel at{" "}
        <a
          href="https://smee.io/new"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 font-medium"
        >
          smee.io/new
        </a>
        , add it as{" "}
        <code className="font-mono bg-amber-100 dark:bg-amber-900/50 px-1 rounded text-xs">
          NEXT_PUBLIC_WEBHOOK_URL
        </code>{" "}
        in{" "}
        <code className="font-mono bg-amber-100 dark:bg-amber-900/50 px-1 rounded text-xs">
          web/.env
        </code>
        , and restart the server.
      </span>
    </div>
  );
}
