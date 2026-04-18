// SPDX-License-Identifier: AGPL-3.0-or-later
import { ModelCardLayout } from "@/components/trust/ModelCardLayout"

export const metadata = {
  title: "Model Card: Google Gemini — DocuGardener",
  description:
    "EU AI Act Article 12 transparency documentation for DocuGardener's use of Google Gemini.",
}

export default function GeminiModelCardPage() {
  return (
    <ModelCardLayout
      provider="Google Gemini"
      providerUrl="https://ai.google.dev/gemini-api/docs"
      intendedUse="DocuGardener uses Google Gemini models to perform semantic analysis of code changes and their associated documentation. Specifically: (1) comparing PR diffs against existing documentation to detect drift, (2) generating suggested documentation updates as Pull Request content, and (3) evaluating rule compliance when customer-defined documentation policies are configured. The model receives code snippets and documentation text; it does not have access to customer infrastructure, secrets, or systems outside of what is explicitly included in each analysis prompt."
      limitations={[
        "Context window limits may cause incomplete analysis on very large PRs (>200 changed files or >100,000 tokens of combined diff + documentation). DocuGardener handles this by chunking and summarising — but suggestions on extremely large changesets may be less precise.",
        "Potential for hallucination on niche or highly domain-specific terminology (e.g. proprietary domain languages, internal jargon). Human review of generated suggestions is required.",
        "Gemini may reflect biases present in its training data when generating documentation prose — particularly around technical writing style, language register, and assumed audience expertise.",
        "Model versions are subject to change by Google. DocuGardener pins to a specified model version; updates are tested before deployment.",
      ]}
      biasNotes="Google Gemini is trained on a large multilingual corpus. For documentation tasks, this may manifest as: a preference for certain technical writing styles (e.g. US English conventions), assumptions about audience expertise levels, or uneven performance on documentation written in languages other than English. DocuGardener's prompts are designed to preserve the author's existing documentation style where possible. Users should review generated suggestions critically, particularly when documentation serves multilingual or highly specialised audiences."
      trainingTransparency="Google publishes technical reports for Gemini models at https://ai.google.dev/gemini-api/docs/models. DocuGardener submits customer code and documentation content to the Gemini API solely for the purpose of performing analysis. Under DocuGardener's agreement with Google Cloud, customer data submitted via the API is not used to train or improve Google's models. In Hosted mode, DocuGardener's agreement with Google Cloud governs data handling. In BYOK Cloud mode, your organisation's own Google Cloud terms apply directly."
      byokNote="In BYOK Cloud mode, your organisation configures its own Google Cloud / Gemini API credentials. Analysis requests are routed directly from DocuGardener's analysis pipeline to Google's API using your credentials. Your organisation's Google Cloud Terms of Service and the applicable Data Processing Amendment govern data handling in this mode. DocuGardener is not a party to that relationship in BYOK mode."
      lastUpdated="2026-04-18"
    />
  )
}
