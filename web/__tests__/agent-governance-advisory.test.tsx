// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/dashboard/settings",
}));

vi.mock("@/lib/features", () => ({
  canAccessTenant: vi.fn(() => true),
}));

const fetchMock = vi.fn(() =>
  Promise.resolve({
    ok: true,
    json: () =>
      Promise.resolve({
        rules: [],
        repositories: [],
      }),
  })
);
vi.stubGlobal("fetch", fetchMock);

// ---------------------------------------------------------------------------
// SPEC-AGV-ADV-01: AgentRulesPanel renders advisory framing callout
// ---------------------------------------------------------------------------
describe("SPEC-AGV-ADV-01: AgentRulesPanel advisory framing callout", () => {
  beforeEach(() => {
    fetchMock.mockClear();
  });

  const MINIMAL_REPO = {
    id: "repo-1",
    name: "acme/api",
    githubRepoId: "123456",
    rulesArtifacts: [],
  }

  it("renders the enforcement advisory text", async () => {
    const { AgentRulesPanel } = await import(
      "@/components/settings/AgentRulesPanel"
    );
    render(<AgentRulesPanel repos={[MINIMAL_REPO]} isPro={true} />);
    expect(
      screen.getByText(/enforcement relies on your agents/i)
    ).toBeInTheDocument();
  });

  it("renders the Learn more link pointing to agent-governance docs", async () => {
    const { AgentRulesPanel } = await import(
      "@/components/settings/AgentRulesPanel"
    );
    render(<AgentRulesPanel repos={[MINIMAL_REPO]} isPro={true} />);
    const link = screen.getByRole("link", { name: /learn more/i });
    expect(link).toHaveAttribute(
      "href",
      "/docs/user-guide/agent-governance"
    );
  });

  it("renders compiled instruction files mention", async () => {
    const { AgentRulesPanel } = await import(
      "@/components/settings/AgentRulesPanel"
    );
    render(<AgentRulesPanel repos={[MINIMAL_REPO]} isPro={true} />);
    expect(screen.getAllByText(/AGENTS\.md/).length).toBeGreaterThan(0);
  });
});
