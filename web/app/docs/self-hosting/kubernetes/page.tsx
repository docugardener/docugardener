// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Kubernetes / Helm — DocuGardener Docs",
  description: "Deploy DocuGardener on Kubernetes using the official Helm chart.",
}

export default function KubernetesPage() {
  return (
    <>
      <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight mb-2">
        Kubernetes / Helm
      </h1>
      <p className="text-lg text-gray-500 mb-8">
        Deploy DocuGardener on Kubernetes for high availability, horizontal scaling,
        and enterprise compliance.
      </p>

      <div className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-5 mb-8">
        <p className="font-semibold text-amber-800 mb-1">Full guide coming soon</p>
        <p className="text-sm text-amber-700">
          The Helm chart is published to GHCR at{" "}
          <code className="font-mono text-xs bg-amber-100 px-1 py-0.5 rounded">
            oci://ghcr.io/docugardener/helm/docugardener
          </code>
          . Detailed installation instructions, value overrides, and production
          configuration examples are being written and will appear here shortly.
        </p>
      </div>

      <h2 className="text-xl font-bold text-gray-900 mb-3">Quick start</h2>
      <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto text-sm font-mono mb-6">
{`helm install docugardener \\
  oci://ghcr.io/docugardener/helm/docugardener \\
  --version 0.1.0 \\
  --namespace docugardener --create-namespace \\
  -f values.yaml`}
      </pre>

      <p className="text-sm text-gray-600 mb-4">
        See the{" "}
        <a
          href="https://github.com/docugardener/docugardener/tree/main/helm"
          target="_blank"
          rel="noopener noreferrer"
          className="text-green-600 hover:underline font-medium"
        >
          helm/ directory in the repository
        </a>{" "}
        for the full <code className="font-mono text-xs">values.yaml</code> reference
        while this page is being completed.
      </p>

      <p className="text-sm text-gray-500">
        For smaller deployments, see the{" "}
        <Link href="/docs/self-hosting/docker" className="text-green-600 hover:underline font-medium">
          Docker Compose guide
        </Link>
        .
      </p>
    </>
  )
}
