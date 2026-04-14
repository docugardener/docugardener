import { render, screen } from "@testing-library/react"
import { describe, it, expect, vi } from "vitest"
import { WhySaaS } from "@/components/home/WhySaaS"

vi.mock("next/link", () => ({
  default: ({ children, href }: any) => <a href={href}>{children}</a>,
}))

vi.mock("lucide-react", () => ({
  Zap: () => <span data-testid="icon-zap" />,
  Bot: () => <span data-testid="icon-bot" />,
  GitBranch: () => <span data-testid="icon-gitbranch" />,
}))

describe("WhySaaS — section header", () => {
  it("renders the section without crashing", () => {
    render(<WhySaaS />)
    expect(screen.getByRole("region")).toBeInTheDocument()
  })

  it("renders the 'Why SaaS?' eyebrow", () => {
    render(<WhySaaS />)
    expect(screen.getByText(/why saas\?/i)).toBeInTheDocument()
  })

  it("renders the section heading", () => {
    render(<WhySaaS />)
    expect(
      screen.getByRole("heading", { name: /why use the hosted version/i })
    ).toBeInTheDocument()
  })

  it("renders the 'honest reasons' subtitle", () => {
    render(<WhySaaS />)
    expect(screen.getByText(/honest reasons/i)).toBeInTheDocument()
  })
})

describe("WhySaaS — reason cards", () => {
  it("renders exactly 3 reason cards", () => {
    render(<WhySaaS />)
    expect(screen.getAllByRole("article")).toHaveLength(3)
  })

  it("renders the 'Zero Ops' card title", () => {
    render(<WhySaaS />)
    expect(screen.getByText("Zero Ops")).toBeInTheDocument()
  })

  it("renders the 'Bundled LLM' card title", () => {
    render(<WhySaaS />)
    expect(screen.getByText("Bundled LLM")).toBeInTheDocument()
  })

  it("renders the 'One-Click GitHub Install' card title", () => {
    render(<WhySaaS />)
    expect(screen.getByText("One-Click GitHub Install")).toBeInTheDocument()
  })
})

describe("WhySaaS — vs. self-hosted callouts", () => {
  it("all three cards have a 'vs. self-hosted' callout", () => {
    render(<WhySaaS />)
    const callouts = screen.getAllByText(/vs\. self-hosted/i)
    expect(callouts).toHaveLength(3)
  })

  it("Zero Ops callout mentions infra", () => {
    render(<WhySaaS />)
    expect(screen.getByText(/vs\. self-hosted:.*infra/i)).toBeInTheDocument()
  })

  it("Bundled LLM callout mentions API key", () => {
    render(<WhySaaS />)
    expect(screen.getByText(/vs\. self-hosted:.*api key/i)).toBeInTheDocument()
  })

  it("GitHub Install callout mentions configure", () => {
    render(<WhySaaS />)
    expect(screen.getByText(/vs\. self-hosted:.*configure/i)).toBeInTheDocument()
  })
})
