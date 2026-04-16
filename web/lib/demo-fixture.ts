// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Demo fixture data for the public /demo drift report page.
 * Shape matches the alert object consumed by SemanticDiffViewer.
 */

export const DEMO_ALERT = {
  id: "demo-alert-001",
  repositoryName: "docugardener/docugardener",
  repoOwner: "docugardener",
  headSha: "a1b2c3d4e5f6789012345678901234567890abcd",
  prNumber: 42,
  driftScore: 74,
  createdAt: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
  completedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  status: "COMPLETED" as string,
  triageStatus: "COMPLETED" as string,
  aiAuthored: false,
  autoFixEnqueued: false,
  aiSignal: null as string | null,
  autoMergeSkipReason: null as string | null,
  result: {
    drift_score: 74,
    drift_analysis: {
      severity: "significant",
      summary:
        "The PR modifies the webhook dispatch pipeline and notification dispatcher but the corresponding architecture documentation in docs/ARCHITECTURE.md and the API reference do not reflect the new per-integration status tracking fields. Two integration handler functions changed their return type from None to dict[str, dict[str, str]] without documentation updates.",
      confidence_score: 0.87,
      reasons: [
        {
          entity: "NotificationDispatcher.dispatch_drift_alert",
          file: "src/notifications/dispatcher.py",
          reason:
            "Return type changed from None to dict[str, dict[str, str]] — docs/ARCHITECTURE.md still documents this as a fire-and-forget void function with no return value.",
        },
        {
          entity: "integrationStatus",
          file: "src/pipeline/handler.py",
          reason:
            "New workflowConfig field integrationStatus is persisted after each dispatch but is not documented in docs/developer/environment or the API reference schema.",
        },
        {
          entity: "GET /api/settings/integrations/status",
          file: "web/app/api/settings/integrations/status/route.ts",
          reason:
            "Response shape extended with status, lastAttemptAt, lastError fields — API reference at /docs/developer/api-reference still shows the old boolean-only response.",
        },
      ],
    },
    documentation_updates: [
      {
        file_path: "docs/ARCHITECTURE.md",
        content:
          "## Integration Status Tracking\n\nThe `NotificationDispatcher.dispatch_drift_alert()` method now returns a `dict[str, dict[str, str]]` containing per-integration dispatch results. Each key is an integration name (e.g. `slack`, `jira`) and the value is a status object with `status` (\"ok\" | \"error\"), `lastAttemptAt` (ISO timestamp), and optionally `lastError` (string, max 300 chars).\n\nThese results are persisted to `tenant.workflowConfig.integrationStatus` after each successful drift analysis dispatch.",
        recheck_status: "passed",
        recheck_confidence: 0.91,
      },
    ],
    policy_violations: [] as unknown[],
    policy_blocks_merge: false,
    pipeline_steps: {
      analysis_ms: 4820,
      docs_generated: 1,
      policy_violations: 0,
      llm_tokens: 3241,
    },
    changed_files: [
      "src/notifications/dispatcher.py",
      "src/pipeline/handler.py",
      "web/app/api/settings/integrations/status/route.ts",
    ],
    llm_usage: {
      total_tokens: 3241,
      prompt_tokens: 2890,
      completion_tokens: 351,
    },
    head_sha: "a1b2c3d4e5f6789012345678901234567890abcd",
  },
};
