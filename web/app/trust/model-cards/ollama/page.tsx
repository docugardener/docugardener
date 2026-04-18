// SPDX-License-Identifier: AGPL-3.0-or-later
import { ModelCardLayout } from "@/components/trust/ModelCardLayout"

export const metadata = {
  title: "Model Card: Ollama (Self-Hosted) — DocuGardener",
  description:
    "EU AI Act Article 12 transparency documentation for DocuGardener's Ollama self-hosted LLM integration.",
}

export default function OllamaModelCardPage() {
  return (
    <ModelCardLayout
      provider="Ollama (self-hosted)"
      providerUrl="https://ollama.com/library"
      intendedUse="DocuGardener's Ollama integration routes all analysis requests to a locally deployed language model running on the customer's own infrastructure. This is the BYOK Local deployment mode. Ollama itself is a model serving runtime — the actual model (e.g. Llama 3, Mistral, CodeLlama, Qwen2) is selected and deployed by the customer. DocuGardener sends the same analysis prompts to the Ollama API endpoint that it would send to a cloud provider — code diff context and documentation text — but no data leaves the customer's network."
      limitations={[
        "Performance, quality, and reliability depend entirely on the model selected by the customer. DocuGardener does not certify or validate customer-selected models.",
        "Smaller models (7B–13B parameters) may produce lower-quality documentation suggestions than frontier cloud models, particularly on nuanced semantic comparison tasks.",
        "Context window sizes vary significantly by model. Very large PRs may be truncated or chunked in ways that reduce suggestion quality.",
        "Self-hosted infrastructure is the customer's responsibility. DocuGardener's SLA and support commitments do not extend to Ollama deployment or model selection issues.",
        "Models available through Ollama vary widely in licensing, training data, and safety properties. The customer is responsible for compliance with the selected model's licence terms.",
      ]}
      biasNotes="Bias characteristics vary per model selected by the customer. DocuGardener has no visibility into or control over the training data, alignment techniques, or evaluation results of customer-selected models. Customers are responsible for evaluating bias and fitness-for-purpose of their chosen model for documentation analysis tasks, and for any EU AI Act obligations that may arise from their model selection."
      trainingTransparency="Training data transparency varies by model. For open-weight models available through Ollama, training data disclosures (where available) are published by the respective model authors. DocuGardener does not process or inspect training data for customer-selected models. Customers deploying models in regulated environments should review the training data and model card of their selected model before use. Because the model runs locally on customer infrastructure, no content is transmitted to a third-party AI provider."
      byokNote="In BYOK Local mode, all AI processing occurs on the customer's own infrastructure. Code, documentation, and PR content never leave the customer's network for AI analysis. The Ollama server URL and any authentication are configured by the customer in DocuGardener's Settings page. DocuGardener connects to the Ollama endpoint over the customer's internal network. The customer is solely responsible for the security, availability, and compliance properties of their self-hosted Ollama deployment."
      lastUpdated="2026-04-18"
    />
  )
}
