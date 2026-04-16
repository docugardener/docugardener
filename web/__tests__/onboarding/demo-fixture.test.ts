// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect } from "vitest";
import { DEMO_ALERT } from "@/lib/demo-fixture";

describe("DEMO_ALERT fixture", () => {
  it("has required top-level fields", () => {
    expect(DEMO_ALERT.id).toBe("demo-alert-001");
    expect(DEMO_ALERT.repositoryName).toBe("docugardener/docugardener");
    expect(DEMO_ALERT.prNumber).toBe(42);
    expect(DEMO_ALERT.driftScore).toBe(74);
    expect(DEMO_ALERT.status).toBe("COMPLETED");
    expect(DEMO_ALERT.triageStatus).toBe("COMPLETED");
  });

  it("has result with drift_analysis", () => {
    expect(DEMO_ALERT.result).toBeDefined();
    expect(DEMO_ALERT.result.drift_score).toBe(74);
    expect(DEMO_ALERT.result.drift_analysis.severity).toBe("significant");
    expect(DEMO_ALERT.result.drift_analysis.reasons).toHaveLength(3);
  });

  it("has documentation_updates with one entry", () => {
    expect(DEMO_ALERT.result.documentation_updates).toHaveLength(1);
    expect(DEMO_ALERT.result.documentation_updates[0].file_path).toBe(
      "docs/ARCHITECTURE.md"
    );
    expect(DEMO_ALERT.result.documentation_updates[0].recheck_status).toBe(
      "passed"
    );
  });

  it("has valid pipeline_steps", () => {
    const steps = DEMO_ALERT.result.pipeline_steps;
    expect(steps.analysis_ms).toBeGreaterThan(0);
    expect(steps.docs_generated).toBeGreaterThanOrEqual(0);
    expect(steps.policy_violations).toBe(0);
  });

  it("aiSignal and autoMergeSkipReason are null", () => {
    expect(DEMO_ALERT.aiSignal).toBeNull();
    expect(DEMO_ALERT.autoMergeSkipReason).toBeNull();
  });

  it("createdAt and completedAt are ISO strings", () => {
    expect(() => new Date(DEMO_ALERT.createdAt)).not.toThrow();
    expect(() => new Date(DEMO_ALERT.completedAt)).not.toThrow();
    expect(DEMO_ALERT.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
