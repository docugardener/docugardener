import { render, screen } from "@testing-library/react"
import { describe, it, expect, vi } from "vitest"
import { SelfHostedCallout } from "@/components/home/SelfHostedCallout"

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

describe("SelfHostedCallout — renders", () => {
  it("renders the section without crashing", () => {
    render(<SelfHostedCallout />)
    expect(screen.getByRole("region")).toBeInTheDocument()
  })

  it("displays the 'Open Source' eyebrow label", () => {
    render(<SelfHostedCallout />)
    expect(screen.getByText("Open Source")).toBeInTheDocument()
  })

  it("displays the heading 'Prefer to run it yourself?'", () => {
    render(<SelfHostedCallout />)
    expect(
      screen.getByRole("heading", { name: /prefer to run it yourself/i })
    ).toBeInTheDocument()
  })

  it("mentions AGPL in the body copy", () => {
    render(<SelfHostedCallout />)
    expect(screen.getByText(/agpl/i)).toBeInTheDocument()
  })

  it("mentions 'no feature gates' in the body copy", () => {
    render(<SelfHostedCallout />)
    expect(screen.getByText(/no feature gates/i)).toBeInTheDocument()
  })
})

describe("SelfHostedCallout — links", () => {
  it("renders a link to GitHub", () => {
    render(<SelfHostedCallout />)
    const githubLink = screen.getByRole("link", { name: /view on github/i })
    expect(githubLink).toBeInTheDocument()
    expect(githubLink.getAttribute("href")).toContain("github.com")
  })

  it("renders a self-hosting guide link", () => {
    render(<SelfHostedCallout />)
    const guideLink = screen.getByRole("link", { name: /self.hosting guide/i })
    expect(guideLink).toBeInTheDocument()
    expect(guideLink.getAttribute("href")).toBe("/docs/self-hosting")
  })

  it("GitHub link has rel='noopener noreferrer'", () => {
    render(<SelfHostedCallout />)
    const githubLink = screen.getByRole("link", { name: /view on github/i })
    expect(githubLink).toHaveAttribute("rel", expect.stringContaining("noopener"))
  })
})
