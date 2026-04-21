// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Prerequisites — DocuGardener Docs",
  description:
    "Software, hardware, and account requirements for self-hosting DocuGardener.",
}

export default function PrerequisitesPage() {
  return (
    <>
      <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight mb-2">
        Prerequisites
      </h1>
      <p className="text-lg text-gray-500 mb-8">
        Everything you need before starting a self-hosted DocuGardener deployment.
      </p>

      {/* ── Software ─────────────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">Software Requirements</h2>
      <table className="w-full text-sm border-collapse mb-6">
        <thead>
          <tr>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">
              Software
            </th>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">
              Minimum Version
            </th>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">
              Notes
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="px-3 py-2 border border-gray-200 text-gray-600 font-medium">Docker</td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">24+</td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">
              Docker Desktop or Docker Engine
            </td>
          </tr>
          <tr>
            <td className="px-3 py-2 border border-gray-200 text-gray-600 font-medium">
              Docker Compose
            </td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">v2</td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">
              Bundled with Docker Desktop; standalone on Linux
            </td>
          </tr>
          <tr>
            <td className="px-3 py-2 border border-gray-200 text-gray-600 font-medium">Node.js</td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">20+</td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">
              LTS recommended; used for the Next.js control plane
            </td>
          </tr>
          <tr>
            <td className="px-3 py-2 border border-gray-200 text-gray-600 font-medium">Python</td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">3.13+</td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">
              Only needed if running the analysis plane outside Docker
            </td>
          </tr>
          <tr>
            <td className="px-3 py-2 border border-gray-200 text-gray-600 font-medium">Git</td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">2.x</td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">
              Used for cloning repositories during analysis
            </td>
          </tr>
        </tbody>
      </table>

      {/* ── Hardware ──────────────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">Hardware Minimums</h2>
      <table className="w-full text-sm border-collapse mb-6">
        <thead>
          <tr>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">
              Resource
            </th>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">
              Minimum
            </th>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">
              Recommended
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="px-3 py-2 border border-gray-200 text-gray-600 font-medium">CPU</td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">2 cores</td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">4+ cores</td>
          </tr>
          <tr>
            <td className="px-3 py-2 border border-gray-200 text-gray-600 font-medium">RAM</td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">4 GB</td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">8+ GB</td>
          </tr>
          <tr>
            <td className="px-3 py-2 border border-gray-200 text-gray-600 font-medium">Disk</td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">20 GB</td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">50+ GB</td>
          </tr>
        </tbody>
      </table>
      <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-blue-800 mb-4">
        <strong>Note:</strong> The Weaviate vector database stores embeddings for every analysed
        document and code file. Disk usage grows with the number of repositories and their size.
        Plan for at least 20 GB free.
      </div>

      {/* ── GitHub ───────────────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">GitHub Requirements</h2>
      <ul className="list-disc list-inside text-gray-600 space-y-2 mb-4">
        <li>A GitHub account (personal or organisation).</li>
        <li>
          Ability to <strong>create a GitHub App</strong> — you need admin access to the
          organisation, or use a personal account.
        </li>
        <li>
          The GitHub App requires these permissions: <strong>repository contents</strong> (read),{" "}
          <strong>check runs</strong> (write), <strong>pull requests</strong> (read), and{" "}
          <strong>webhooks</strong>.
        </li>
      </ul>

      {/* ── LLM ──────────────────────────────────────────── */}
      <h2 className="text-xl font-bold text-gray-900 mt-10 mb-3">LLM Provider</h2>
      <p className="text-gray-600 leading-relaxed mb-4">
        DocuGardener needs access to a large language model for drift analysis and fix generation.
        You have four options:
      </p>
      <table className="w-full text-sm border-collapse mb-6">
        <thead>
          <tr>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">
              Provider
            </th>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">
              Env Var
            </th>
            <th className="text-left bg-gray-50 px-3 py-2 border border-gray-200 font-semibold text-gray-700">
              Notes
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="px-3 py-2 border border-gray-200 text-gray-600 font-medium">
              Google Gemini
            </td>
            <td className="px-3 py-2 border border-gray-200">
              <code className="bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded text-sm font-mono">
                GEMINI_API_KEY
              </code>
            </td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">
              Default provider. Fast and cost-effective.
            </td>
          </tr>
          <tr>
            <td className="px-3 py-2 border border-gray-200 text-gray-600 font-medium">OpenAI</td>
            <td className="px-3 py-2 border border-gray-200">
              <code className="bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded text-sm font-mono">
                OPENAI_API_KEY
              </code>
            </td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">
              GPT-4o recommended.
            </td>
          </tr>
          <tr>
            <td className="px-3 py-2 border border-gray-200 text-gray-600 font-medium">
              Anthropic
            </td>
            <td className="px-3 py-2 border border-gray-200">
              <code className="bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded text-sm font-mono">
                ANTHROPIC_API_KEY
              </code>
            </td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">
              Claude Sonnet 4.6 recommended.
            </td>
          </tr>
          <tr>
            <td className="px-3 py-2 border border-gray-200 text-gray-600 font-medium">Ollama</td>
            <td className="px-3 py-2 border border-gray-200">
              <code className="bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded text-sm font-mono">
                OLLAMA_URL
              </code>
            </td>
            <td className="px-3 py-2 border border-gray-200 text-gray-600">
              Local-only, zero data egress. Perfect for air-gapped environments.
            </td>
          </tr>
        </tbody>
      </table>

      <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-blue-800 mb-4">
        <strong>Ollama tip:</strong> Any model with 4K+ context window works for drift analysis.
        For embeddings, use{" "}
        <code className="bg-blue-100 text-blue-900 px-1 py-0.5 rounded text-sm font-mono">
          nomic-embed-text
        </code>
        . Pull it with{" "}
        <code className="bg-blue-100 text-blue-900 px-1 py-0.5 rounded text-sm font-mono">
          ollama pull nomic-embed-text
        </code>
        .
      </div>
    </>
  )
}
