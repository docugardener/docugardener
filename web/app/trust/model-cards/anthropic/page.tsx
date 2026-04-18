// SPDX-License-Identifier: AGPL-3.0-or-later
import { ModelCardLayout } from "@/components/trust/ModelCardLayout"

export const metadata = {
  title: "Model Card: Anthropic Claude — DocuGardener",
  description:
    "EU AI Act Article 12 transparency documentation for DocuGardener's use of Anthropic Claude family models.",
}

export default function AnthropicModelCardPage() {
  return (
    <ModelCardLayout
      provider="Anthropic (Claude family)"
      providerUrl="https://www.anthropic.com/claude"
      intendedUse="DocuGardener uses Anthropic Claude models (Claude Sonnet, Opus, and Haiku variants) to perform semantic analysis of pull request diffs against associated documentation. Tasks include: (1) detecting documentation drift and assessing its severity, (2) generating context-aware documentation update suggestions delivered as GitHub Pull Request content, and (3) evaluating documentation against customer-defined rules and policies. Claude's long context window is particularly suited to analysing large PRs. Inputs consist solely of code snippets and documentation text — no customer credentials or infrastructure access is granted to the model."
      limitations={[
        "Despite a large context window, analysis of extremely large monorepo PRs (>500 files) may require chunking, which can reduce cross-file coherence in suggestions.",
        "Claude may produce plausible-sounding but incorrect suggestions when documentation covers highly specialised domains not well-represented in its training corpus.",
        "Claude's Constitutional AI training emphasises helpfulness and harmlessness; in documentation tasks this may manifest as suggestions that soften technical warnings or caveats. Reviewers should verify that safety-critical documentation language is preserved.",
        "Model versions (Sonnet / Opus / Haiku) have different capability and cost profiles. DocuGardener's default model selection is documented in the Settings page.",
      ]}
      biasNotes="Anthropic publishes a model card for Claude at https://www.anthropic.com/claude and documents its Constitutional AI alignment approach. For documentation tasks, potential biases include a tendency toward formal or cautious prose, and a preference for certain English-language writing conventions. Claude's training using reinforcement learning from human feedback (RLHF) and Constitutional AI may cause it to rephrase technically precise but blunt documentation in a more hedged style. Reviewers should ensure that generated suggestions preserve the technical precision of original documentation."
      trainingTransparency="Anthropic publishes model cards and safety evaluations for the Claude family. Under Anthropic's API terms for enterprise customers, data submitted via the API is not used to train Anthropic's models. DocuGardener submits analysis requests to the Anthropic Messages API. In Hosted mode, DocuGardener's agreement with Anthropic governs data handling. In BYOK Cloud mode, your organisation's own Anthropic API agreement and any applicable Data Processing Addendum govern data handling directly."
      byokNote="In BYOK Cloud mode, your organisation provides its own Anthropic API key. All analysis requests are routed directly from DocuGardener to the Anthropic API using your credentials. Anthropic's Terms of Service, Privacy Policy, and your organisation's Data Processing Addendum (if applicable) govern data handling in this mode."
      lastUpdated="2026-04-18"
    />
  )
}
