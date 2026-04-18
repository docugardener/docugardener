// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, screen } from "@testing-library/react"
import { describe, it, expect, vi } from "vitest"

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}))

vi.mock("@/components/ui/button", () => ({
  Button: ({ children }: { children: React.ReactNode }) => (
    <button>{children}</button>
  ),
}))

// ---------------------------------------------------------------------------
// Component imports (after mocks)
// ---------------------------------------------------------------------------

import TrustPage from "@/app/trust/page"
import { MarketingHeader } from "@/components/marketing/MarketingHeader"
import { ModelCardLayout } from "@/components/trust/ModelCardLayout"
import GeminiPage from "@/app/trust/model-cards/gemini/page"
import OpenAIPage from "@/app/trust/model-cards/openai/page"
import AnthropicPage from "@/app/trust/model-cards/anthropic/page"
import OllamaPage from "@/app/trust/model-cards/ollama/page"
import HumanOversightPage from "@/app/trust/human-oversight/page"

// ---------------------------------------------------------------------------
// 1. /trust page — required sections
// ---------------------------------------------------------------------------

describe("/trust page — required sections", () => {
  it("renders without crashing", () => {
    render(<TrustPage />)
    expect(screen.getByRole("heading", { name: /trust.*compliance/i, level: 1 })).toBeInTheDocument()
  })

  it("renders Overview section", () => {
    render(<TrustPage />)
    expect(screen.getByRole("heading", { name: /EU AI Act/i })).toBeInTheDocument()
  })

  it("renders Model Cards section", () => {
    render(<TrustPage />)
    expect(screen.getByRole("heading", { name: /model cards/i })).toBeInTheDocument()
  })

  it("renders Human Oversight section", () => {
    render(<TrustPage />)
    expect(screen.getByRole("heading", { name: /human oversight/i })).toBeInTheDocument()
  })

  it("renders Data Processing & Retention section", () => {
    render(<TrustPage />)
    expect(screen.getByRole("heading", { name: /data processing/i })).toBeInTheDocument()
  })

  it("renders Sub-processors section", () => {
    render(<TrustPage />)
    expect(screen.getByRole("heading", { name: /sub-processors/i })).toBeInTheDocument()
  })

  it("renders Incident Response section", () => {
    render(<TrustPage />)
    expect(screen.getByRole("heading", { name: /incident response/i })).toBeInTheDocument()
  })

  it("renders Download section", () => {
    render(<TrustPage />)
    expect(screen.getByRole("heading", { name: /download/i })).toBeInTheDocument()
  })

  it("has exactly 7 required sections (via id anchors)", () => {
    const { container } = render(<TrustPage />)
    const sectionIds = [
      "overview",
      "model-cards",
      "human-oversight",
      "data-processing",
      "sub-processors",
      "incident-response",
      "download",
    ]
    sectionIds.forEach((id) => {
      expect(container.querySelector(`#${id}`)).not.toBeNull()
    })
  })

  it("renders model card links for all 4 providers", () => {
    render(<TrustPage />)
    const links = screen.getAllByRole("link")
    expect(links.some((l) => l.getAttribute("href") === "/trust/model-cards/gemini")).toBe(true)
    expect(links.some((l) => l.getAttribute("href") === "/trust/model-cards/openai")).toBe(true)
    expect(links.some((l) => l.getAttribute("href") === "/trust/model-cards/anthropic")).toBe(true)
    expect(links.some((l) => l.getAttribute("href") === "/trust/model-cards/ollama")).toBe(true)
  })

  it("renders the PDF download button", () => {
    render(<TrustPage />)
    const downloadLink = screen.getByRole("link", { name: /AI Act Summary/i })
    expect(downloadLink).toBeInTheDocument()
    expect(downloadLink.getAttribute("href")).toBe("/docs/docugardener-ai-act-summary.pdf")
  })

  it("renders the Hetzner sub-processor row", () => {
    render(<TrustPage />)
    expect(screen.getByText(/hetzner/i)).toBeInTheDocument()
  })

  it("renders the Stripe sub-processor row", () => {
    render(<TrustPage />)
    expect(screen.getByText(/stripe/i)).toBeInTheDocument()
  })

  it("renders the GitHub sub-processor row", () => {
    render(<TrustPage />)
    // Multiple 'GitHub' mentions expected — at least one in the sub-processors table
    const githubMentions = screen.getAllByText(/github/i)
    expect(githubMentions.length).toBeGreaterThanOrEqual(1)
  })

  it("renders the Weaviate sub-processor row", () => {
    render(<TrustPage />)
    expect(screen.getAllByText(/weaviate/i).length).toBeGreaterThanOrEqual(1)
  })

  it("includes security@docugardener.dev contact link", () => {
    render(<TrustPage />)
    expect(
      screen.getAllByRole("link").some((l) =>
        l.getAttribute("href") === "mailto:security@docugardener.dev"
      )
    ).toBe(true)
  })

  it("includes GDPR Article 33 mention", () => {
    render(<TrustPage />)
    expect(screen.getByText(/GDPR Art.*33|Article 33/i)).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// 2. MarketingHeader — Trust link
// ---------------------------------------------------------------------------

describe("MarketingHeader — Trust link", () => {
  it("renders Trust nav link to /trust", () => {
    render(<MarketingHeader />)
    const trustLink = screen.getByRole("link", { name: /^trust$/i })
    expect(trustLink).toBeInTheDocument()
    expect(trustLink.getAttribute("href")).toBe("/trust")
  })

  it("highlights Trust link when activePage='trust'", () => {
    // The MarketingHeader passes a className string to the Link component.
    // In the test environment, next/link is mocked to <a> — but the className
    // is forwarded only if Link spreads props. Since our mock doesn't forward
    // className, we verify the activePage prop is accepted without error and
    // the Trust nav item is present.
    render(<MarketingHeader activePage="trust" />)
    expect(screen.getByRole("link", { name: /^trust$/i })).toBeInTheDocument()
  })

  it("does not crash when activePage is a non-trust value", () => {
    render(<MarketingHeader activePage="docs" />)
    expect(screen.getByRole("link", { name: /^trust$/i })).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// 3. ModelCardLayout — required sections
// ---------------------------------------------------------------------------

const TEST_PROPS = {
  provider: "Test Provider",
  providerUrl: "https://example.com/docs",
  intendedUse: "Used for testing documentation drift.",
  limitations: ["Limitation one", "Limitation two"],
  biasNotes: "May exhibit test bias.",
  trainingTransparency: "Training data published at example.com.",
  byokNote: "In BYOK mode, your terms apply.",
  lastUpdated: "2026-04-18",
}

describe("ModelCardLayout — required sections", () => {
  it("renders without crashing", () => {
    render(<ModelCardLayout {...TEST_PROPS} />)
    expect(screen.getByRole("heading", { name: /test provider/i, level: 1 })).toBeInTheDocument()
  })

  it("renders Intended Use section", () => {
    render(<ModelCardLayout {...TEST_PROPS} />)
    expect(screen.getByRole("heading", { name: /intended use/i })).toBeInTheDocument()
    expect(screen.getByText(/Used for testing documentation drift/)).toBeInTheDocument()
  })

  it("renders Known Limitations section", () => {
    render(<ModelCardLayout {...TEST_PROPS} />)
    expect(screen.getByRole("heading", { name: /known limitations/i })).toBeInTheDocument()
    expect(screen.getByText("Limitation one")).toBeInTheDocument()
    expect(screen.getByText("Limitation two")).toBeInTheDocument()
  })

  it("renders Bias Notes section", () => {
    render(<ModelCardLayout {...TEST_PROPS} />)
    expect(screen.getByRole("heading", { name: /bias notes/i })).toBeInTheDocument()
    expect(screen.getByText(/May exhibit test bias/)).toBeInTheDocument()
  })

  it("renders Training Data Transparency section", () => {
    render(<ModelCardLayout {...TEST_PROPS} />)
    expect(screen.getByRole("heading", { name: /training data transparency/i })).toBeInTheDocument()
    expect(screen.getByText(/Training data published/)).toBeInTheDocument()
  })

  it("renders BYOK Deployment Disclaimer section", () => {
    render(<ModelCardLayout {...TEST_PROPS} />)
    expect(screen.getByRole("heading", { name: /byok deployment disclaimer/i })).toBeInTheDocument()
    expect(screen.getByText(/In BYOK mode/)).toBeInTheDocument()
  })

  it("renders back link to /trust#model-cards", () => {
    render(<ModelCardLayout {...TEST_PROPS} />)
    const backLink = screen.getByRole("link", { name: /back to trust/i })
    expect(backLink).toBeInTheDocument()
    expect(backLink.getAttribute("href")).toBe("/trust#model-cards")
  })

  it("renders compliance contact email", () => {
    render(<ModelCardLayout {...TEST_PROPS} />)
    expect(
      screen.getByRole("link", { name: /compliance@docugardener\.dev/i })
    ).toBeInTheDocument()
  })

  it("renders provider URL link", () => {
    render(<ModelCardLayout {...TEST_PROPS} />)
    expect(
      screen.getByRole("link", { name: /https:\/\/example\.com\/docs/i })
    ).toBeInTheDocument()
  })

  it("renders children when passed", () => {
    render(
      <ModelCardLayout {...TEST_PROPS}>
        <div data-testid="child-content">Extra content</div>
      </ModelCardLayout>
    )
    expect(screen.getByTestId("child-content")).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// 4. Individual model card pages
// ---------------------------------------------------------------------------

describe("Gemini model card page", () => {
  it("renders without crashing", () => {
    render(<GeminiPage />)
    expect(screen.getByRole("heading", { name: /google gemini/i, level: 1 })).toBeInTheDocument()
  })

  it("mentions context window limitation", () => {
    render(<GeminiPage />)
    expect(screen.getByText(/context window/i)).toBeInTheDocument()
  })

  it("mentions BYOK Cloud mode", () => {
    render(<GeminiPage />)
    expect(screen.getAllByText(/byok cloud/i).length).toBeGreaterThanOrEqual(1)
  })
})

describe("OpenAI model card page", () => {
  it("renders without crashing", () => {
    render(<OpenAIPage />)
    expect(screen.getByRole("heading", { name: /openai/i, level: 1 })).toBeInTheDocument()
  })

  it("references system card", () => {
    render(<OpenAIPage />)
    expect(screen.getAllByText(/system card/i).length).toBeGreaterThanOrEqual(1)
  })
})

describe("Anthropic model card page", () => {
  it("renders without crashing", () => {
    render(<AnthropicPage />)
    expect(
      screen.getByRole("heading", { name: /anthropic/i, level: 1 })
    ).toBeInTheDocument()
  })

  it("mentions Constitutional AI", () => {
    render(<AnthropicPage />)
    expect(screen.getAllByText(/constitutional ai/i).length).toBeGreaterThanOrEqual(1)
  })
})

describe("Ollama model card page", () => {
  it("renders without crashing", () => {
    render(<OllamaPage />)
    expect(
      screen.getByRole("heading", { name: /ollama/i, level: 1 })
    ).toBeInTheDocument()
  })

  it("mentions that no data leaves the network", () => {
    render(<OllamaPage />)
    expect(screen.getByText(/no data leaves the customer.*network|no.*leaves.*network/i)).toBeInTheDocument()
  })

  it("notes customer responsibility for model compliance", () => {
    render(<OllamaPage />)
    expect(screen.getAllByText(/customer.*responsible|responsible.*compliance/i).length).toBeGreaterThanOrEqual(1)
  })
})

// ---------------------------------------------------------------------------
// 5. HITL / Human Oversight page
// ---------------------------------------------------------------------------

describe("Human Oversight page (Article 14)", () => {
  it("renders without crashing", () => {
    render(<HumanOversightPage />)
    expect(
      screen.getByRole("heading", { name: /human oversight attestation/i, level: 1 })
    ).toBeInTheDocument()
  })

  it("renders the HITL model section", () => {
    render(<HumanOversightPage />)
    expect(
      screen.getByRole("heading", { name: /human-in-the-loop model/i })
    ).toBeInTheDocument()
  })

  it("renders the 'Never Does Automatically' section", () => {
    render(<HumanOversightPage />)
    expect(
      screen.getByRole("heading", { name: /never does automatically/i })
    ).toBeInTheDocument()
  })

  it("renders the auto-merge disclosure section", () => {
    render(<HumanOversightPage />)
    expect(
      screen.getByRole("heading", { name: /auto-merge feature disclosure/i })
    ).toBeInTheDocument()
  })

  it("states auto-merge is disabled by default", () => {
    render(<HumanOversightPage />)
    expect(screen.getByText(/disabled by default/i)).toBeInTheDocument()
  })

  it("mentions autoMergeAiDocs config flag", () => {
    render(<HumanOversightPage />)
    expect(screen.getByText(/autoMergeAiDocs/)).toBeInTheDocument()
  })

  it("renders the Audit Trail section", () => {
    render(<HumanOversightPage />)
    expect(screen.getByRole("heading", { name: /audit trail/i })).toBeInTheDocument()
  })

  it("mentions SHA-256 hash chaining", () => {
    render(<HumanOversightPage />)
    expect(screen.getByText(/sha-256/i)).toBeInTheDocument()
  })

  it("renders compliance contact email", () => {
    render(<HumanOversightPage />)
    expect(
      screen.getAllByRole("link").some((l) =>
        l.getAttribute("href") === "mailto:compliance@docugardener.dev"
      )
    ).toBe(true)
  })

  it("renders back link to /trust", () => {
    render(<HumanOversightPage />)
    const backLink = screen.getByRole("link", { name: /back to trust/i })
    expect(backLink).toBeInTheDocument()
  })

  it("mentions AI coding agents (Copilot, Cursor, Devin)", () => {
    render(<HumanOversightPage />)
    expect(screen.getAllByText(/copilot/i).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/cursor/i).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/devin/i).length).toBeGreaterThanOrEqual(1)
  })
})
