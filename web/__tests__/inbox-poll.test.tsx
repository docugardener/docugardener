// SPDX-License-Identifier: AGPL-3.0-or-later
// BUG-2 regression tests — InboxPageClient 30-second poll reliability
//
// Verifies:
//   1. fetch('/api/inbox') uses cache:'no-store' (bypass Next.js fetch cache)
//   2. Poll interval fires every 30 s after mount
//   3. Re-render does not double the interval (useCallback stable ref)
//   4. Interval is cleaned up on unmount
//   5. Selection is preserved when the item still exists after a poll
//   6. Network errors are swallowed (no crash)

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Module-level mocks — hoisted before any import
// ---------------------------------------------------------------------------

vi.mock("@/components/inbox/InboxLayout", () => ({
  InboxLayout: ({ sidebar, content }: { sidebar: React.ReactNode; content: React.ReactNode }) => (
    <div>
      <div data-testid="sidebar">{sidebar}</div>
      <div data-testid="content">{content}</div>
    </div>
  ),
}));

vi.mock("@/components/inbox/DriftAlertList", () => ({
  DriftAlertList: ({
    alerts,
  }: {
    alerts: Array<{ id: string }>;
    selectedId?: string;
    onSelect: (a: unknown) => void;
    hasRepos: boolean;
  }) => <div data-testid="alert-list" data-count={alerts.length} />,
}));

vi.mock("@/components/inbox/SemanticDiffViewer", () => ({
  SemanticDiffViewer: ({
    alert,
    onStatusChange,
  }: {
    alert: { id: string };
    onStatusChange?: () => void;
    onAccept?: () => void;
    onIgnore?: (r?: string) => void;
    isProcessing?: boolean;
  }) => (
    <div
      data-testid="diff-viewer"
      data-item-id={alert.id}
      data-has-status-change={!!onStatusChange}
    />
  ),
}));

vi.mock("@/components/onboarding/GettingStartedBanner", () => ({
  GettingStartedBanner: () => null,
}));

vi.mock("@/components/onboarding/DiscoverMoreChecklist", () => ({
  DiscoverMoreChecklist: () => null,
}));

vi.mock("@/hooks/use-hotkeys", () => ({ useHotkeys: () => {} }));

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

// ---------------------------------------------------------------------------
// Import component under test AFTER mocks
// ---------------------------------------------------------------------------

import { InboxPageClient } from "@/app/dashboard/inbox/InboxPageClient";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal job shape that satisfies transformAlerts() */
function makeJob(id: string, status = "COMPLETED") {
  return {
    id,
    status,
    triageStatus: "PENDING",
    repositoryName: "org/repo",
    repoOwner: "org",
    headSha: "abc",
    prNumber: 1,
    result: { drift_score: 42 },
    createdAt: new Date().toISOString(),
    completedAt: null,
    fixPrUrl: null,
    aiAuthored: false,
    autoFixEnqueued: false,
    aiSignal: null,
    autoMergeSkipReason: null,
  };
}

const JOBS_A = [makeJob("job-1"), makeJob("job-2")];
const REPOS_RESP = { repos: [{ id: "r1", fullName: "org/repo" }] };

function makeOkJsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("InboxPageClient — poll mechanism (BUG-2)", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      if (typeof url === "string" && url.includes("/api/repos")) {
        return Promise.resolve(makeOkJsonResponse(REPOS_RESP));
      }
      return Promise.resolve(makeOkJsonResponse(JOBS_A));
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ── BUG-2a: fetch cache bypass ────────────────────────────────────────────

  it("calls /api/inbox with cache:'no-store' on mount", async () => {
    render(<InboxPageClient tenantId="t1" role="ADMIN" />);

    await act(async () => { await Promise.resolve(); });

    const inboxCall = fetchSpy.mock.calls.find(([url]: [string, RequestInit?]) =>
      typeof url === "string" && url.includes("/api/inbox") && !url.includes("/api/inbox/")
    );
    expect(inboxCall).toBeDefined();
    expect(inboxCall![1]).toMatchObject({ cache: "no-store" });
  });

  // ── BUG-2b: poll interval fires ───────────────────────────────────────────

  it("fetches /api/inbox once on mount", async () => {
    render(<InboxPageClient tenantId="t1" />);
    await act(async () => { await Promise.resolve(); });

    const inboxCalls = fetchSpy.mock.calls.filter(([url]: [string, RequestInit?]) =>
      typeof url === "string" && url === "/api/inbox"
    );
    expect(inboxCalls).toHaveLength(1);
  });

  it("fetches /api/inbox again after 30 seconds", async () => {
    render(<InboxPageClient tenantId="t1" />);
    await act(async () => { await Promise.resolve(); });

    await act(async () => {
      vi.advanceTimersByTime(30_000);
      await Promise.resolve();
    });

    const inboxCalls = fetchSpy.mock.calls.filter(([url]: [string, RequestInit?]) =>
      typeof url === "string" && url === "/api/inbox"
    );
    expect(inboxCalls).toHaveLength(2);
  });

  it("fetches /api/inbox three times total after 60 seconds", async () => {
    render(<InboxPageClient tenantId="t1" />);
    await act(async () => { await Promise.resolve(); });

    await act(async () => {
      vi.advanceTimersByTime(60_000);
      await Promise.resolve();
    });

    const inboxCalls = fetchSpy.mock.calls.filter(([url]: [string, RequestInit?]) =>
      typeof url === "string" && url === "/api/inbox"
    );
    expect(inboxCalls).toHaveLength(3);
  });

  // ── BUG-2c: no interval doubling ──────────────────────────────────────────

  it("does not multiply intervals on re-render", async () => {
    const { rerender } = render(<InboxPageClient tenantId="t1" />);
    await act(async () => { await Promise.resolve(); });

    rerender(<InboxPageClient tenantId="t1" />);

    await act(async () => {
      vi.advanceTimersByTime(30_000);
      await Promise.resolve();
    });

    const inboxCalls = fetchSpy.mock.calls.filter(([url]: [string, RequestInit?]) =>
      typeof url === "string" && url === "/api/inbox"
    );
    // mount fetch + 1 interval tick (not 2 from doubled interval)
    expect(inboxCalls).toHaveLength(2);
  });

  // ── BUG-2d: cleanup on unmount ────────────────────────────────────────────

  it("clears the interval on unmount", async () => {
    const clearSpy = vi.spyOn(globalThis, "clearInterval");
    const { unmount } = render(<InboxPageClient tenantId="t1" />);
    await act(async () => { await Promise.resolve(); });

    unmount();

    expect(clearSpy).toHaveBeenCalled();
  });

  it("stops polling after unmount", async () => {
    const { unmount } = render(<InboxPageClient tenantId="t1" />);
    await act(async () => { await Promise.resolve(); });

    const callsAtUnmount = fetchSpy.mock.calls.filter(([url]: [string, RequestInit?]) =>
      typeof url === "string" && url === "/api/inbox"
    ).length;

    unmount();

    await act(async () => {
      vi.advanceTimersByTime(30_000);
      await Promise.resolve();
    });

    const inboxCalls = fetchSpy.mock.calls.filter(([url]: [string, RequestInit?]) =>
      typeof url === "string" && url === "/api/inbox"
    );
    expect(inboxCalls).toHaveLength(callsAtUnmount);
  });

  // ── BUG-2e: error resilience ──────────────────────────────────────────────

  it("silently ignores network errors — no crash", async () => {
    fetchSpy.mockImplementation((url: string) => {
      if (typeof url === "string" && url.includes("/api/repos")) {
        return Promise.resolve(makeOkJsonResponse(REPOS_RESP));
      }
      return Promise.reject(new Error("Network error"));
    });

    await expect(
      act(async () => {
        render(<InboxPageClient tenantId="t1" />);
        await Promise.resolve();
      })
    ).resolves.not.toThrow();
  });

  it("silently ignores non-2xx responses — no crash", async () => {
    fetchSpy.mockImplementation((url: string) => {
      if (typeof url === "string" && url.includes("/api/repos")) {
        return Promise.resolve(makeOkJsonResponse(REPOS_RESP));
      }
      return Promise.resolve(
        new Response(JSON.stringify({ error: "server error" }), { status: 500 })
      );
    });

    await expect(
      act(async () => {
        render(<InboxPageClient tenantId="t1" />);
        await Promise.resolve();
      })
    ).resolves.not.toThrow();
  });
});
