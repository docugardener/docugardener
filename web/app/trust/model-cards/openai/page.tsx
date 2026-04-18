// SPDX-License-Identifier: AGPL-3.0-or-later
import { ModelCardLayout } from "@/components/trust/ModelCardLayout"

export const metadata = {
  title: "Model Card: OpenAI GPT-4 — DocuGardener",
  description:
    "EU AI Act Article 12 transparency documentation for DocuGardener's use of OpenAI GPT-4 family models.",
}

export default function OpenAIModelCardPage() {
  return (
    <ModelCardLayout
      provider="OpenAI (GPT-4 family)"
      providerUrl="https://platform.openai.com/docs/models"
      intendedUse="DocuGardener uses OpenAI GPT-4 family models (GPT-4o and variants) to perform semantic analysis of code changes against associated documentation. Tasks include: (1) detecting documentation drift by comparing PR diffs to existing documentation content, (2) generating suggested documentation updates delivered as GitHub Pull Request content, and (3) evaluating whether documentation satisfies customer-defined rules and policies. Inputs are limited to code snippets and documentation text explicitly included in each analysis prompt — the model has no access to customer infrastructure or credentials."
      limitations={[
        "Context window constraints may reduce analysis fidelity on very large PRs. DocuGardener applies chunking and summarisation strategies, but suggestions on extremely large changesets should be reviewed with this in mind.",
        "GPT-4 may produce confident-sounding but inaccurate suggestions for niche technical domains or proprietary terminology not present in its training data. Human review is required before merging any AI-generated documentation change.",
        "OpenAI models may exhibit stylistic biases (e.g. preference for certain prose conventions) that differ from an organisation's existing documentation standards. DocuGardener prompts include style-preservation instructions.",
        "OpenAI periodically updates and retires model versions. DocuGardener pins to a specified version and validates updates before deployment.",
      ]}
      biasNotes="OpenAI publishes a system card for GPT-4 at https://openai.com/index/gpt-4-system-card/ which documents known limitations and bias evaluations. For documentation tasks, observed biases may include preferences in technical writing conventions and English-language documentation idioms. OpenAI's usage policies prohibit using the API for applications that engage in or facilitate discrimination. DocuGardener's use is limited to documentation workflow tasks; it does not perform scoring, ranking, or evaluation of persons."
      trainingTransparency="OpenAI publishes model cards and system cards for the GPT-4 family. Under OpenAI's Enterprise API terms, customer data submitted via the API is not used to train OpenAI's models by default. DocuGardener routes analysis requests using the OpenAI Chat Completions API. In Hosted mode, DocuGardener's enterprise agreement with OpenAI governs data handling. In BYOK Cloud mode, your organisation's own OpenAI API agreement applies directly and governs all data-use commitments."
      byokNote="In BYOK Cloud mode, your organisation supplies its own OpenAI API key. Analysis requests are made directly from DocuGardener to the OpenAI API using your credentials. OpenAI's Terms of Service, Privacy Policy, and any applicable Data Processing Agreement your organisation holds with OpenAI govern data handling in this mode."
      lastUpdated="2026-04-18"
    />
  )
}
