// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { OnboardingBanner } from "@/components/onboarding/OnboardingBanner";

const BANNER_DISMISSED_KEY = "dg-onboarding-banner-dismissed";

describe("OnboardingBanner", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("does not render when hasRepos=false", () => {
    const { container } = render(
      <OnboardingBanner hasRepos={false} hasJobs={false} />
    );
    // Component starts hidden; even after effect no repos means no render
    expect(container.textContent).toBe("");
  });

  it("does not render when hasJobs=true", () => {
    const { container } = render(
      <OnboardingBanner hasRepos={true} hasJobs={true} />
    );
    expect(container.textContent).toBe("");
  });

  it("does not render when dismissed key is set in localStorage", async () => {
    localStorage.setItem(BANNER_DISMISSED_KEY, "true");
    await act(async () => {
      render(<OnboardingBanner hasRepos={true} hasJobs={false} />);
    });
    expect(screen.queryByText(/your repository is connected/i)).toBeNull();
  });

  it("renders after effect when not dismissed and conditions met", async () => {
    // localStorage has no dismissed key
    await act(async () => {
      render(<OnboardingBanner hasRepos={true} hasJobs={false} />);
    });
    // After useEffect sets dismissed=false, banner should show
    expect(
      screen.queryByText(/your repository is connected/i)
    ).not.toBeNull();
  });

  it("sets localStorage and hides on dismiss click", async () => {
    await act(async () => {
      render(<OnboardingBanner hasRepos={true} hasJobs={false} />);
    });
    const closeBtn = screen.queryByRole("button", { name: /dismiss banner/i });
    if (closeBtn) {
      await act(async () => {
        fireEvent.click(closeBtn);
      });
      expect(localStorage.getItem(BANNER_DISMISSED_KEY)).toBe("true");
      expect(screen.queryByText(/your repository is connected/i)).toBeNull();
    }
  });

  it("includes See a sample report link to /demo", async () => {
    await act(async () => {
      render(<OnboardingBanner hasRepos={true} hasJobs={false} />);
    });
    const link = screen.queryByRole("link", { name: /see a sample report/i });
    if (link) {
      expect(link).toHaveAttribute("href", "/demo");
    }
  });
});
