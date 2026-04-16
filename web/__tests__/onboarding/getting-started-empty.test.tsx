// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { GettingStartedEmpty } from "@/components/onboarding/GettingStartedEmpty";

describe("GettingStartedEmpty", () => {
  describe("when no repos connected (hasRepos=false)", () => {
    it("renders inbox variant heading", () => {
      render(<GettingStartedEmpty hasRepos={false} context="inbox" />);
      expect(screen.getByText("No drift alerts yet")).toBeInTheDocument();
    });

    it("renders jobs variant heading", () => {
      render(<GettingStartedEmpty hasRepos={false} context="jobs" />);
      expect(screen.getByText("No analysis jobs yet")).toBeInTheDocument();
    });

    it("renders dashboard variant heading", () => {
      render(<GettingStartedEmpty hasRepos={false} context="dashboard" />);
      expect(screen.getByText("Welcome to DocuGardener")).toBeInTheDocument();
    });

    it("shows Set up a repository CTA", () => {
      render(<GettingStartedEmpty hasRepos={false} context="inbox" />);
      const link = screen.getByRole("link", { name: /set up a repository/i });
      expect(link).toHaveAttribute("href", "/dashboard/settings?tab=repositories");
    });

    it("shows See a sample report link to /demo", () => {
      render(<GettingStartedEmpty hasRepos={false} context="inbox" />);
      const link = screen.getByRole("link", { name: /see a sample report/i });
      expect(link).toHaveAttribute("href", "/demo");
    });
  });

  describe("when repos connected (hasRepos=true)", () => {
    it("shows waiting for PR heading for inbox", () => {
      render(<GettingStartedEmpty hasRepos={true} context="inbox" />);
      expect(
        screen.getByText("Waiting for your first pull request")
      ).toBeInTheDocument();
    });

    it("shows waiting heading for jobs", () => {
      render(<GettingStartedEmpty hasRepos={true} context="jobs" />);
      expect(screen.getByText("No analysis jobs yet")).toBeInTheDocument();
    });

    it("still shows See a sample report link to /demo", () => {
      render(<GettingStartedEmpty hasRepos={true} context="inbox" />);
      const link = screen.getByRole("link", { name: /see a sample report/i });
      expect(link).toHaveAttribute("href", "/demo");
    });

    it("does NOT show Set up a repository CTA when repos exist", () => {
      render(<GettingStartedEmpty hasRepos={true} context="inbox" />);
      expect(
        screen.queryByRole("link", { name: /set up a repository/i })
      ).not.toBeInTheDocument();
    });
  });
});
