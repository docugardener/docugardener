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

      <h2 className="text-xl font-bold text-gray-900 mb-3">Quick start</h2>
      <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto text-sm font-mono mb-6">
{`# Pull and install
helm pull oci://ghcr.io/docugardener/helm/docugardener --version 0.2.0

helm install docugardener \\
  oci://ghcr.io/docugardener/helm/docugardener \\
  --version 0.2.0 \\
  --namespace docugardener --create-namespace \\
  -f values.yaml

# Verify cosign signature
cosign verify \\
  --certificate-identity-regexp "https://github.com/docugardener/docugardener/.*" \\
  --certificate-oidc-issuer "https://token.actions.githubusercontent.com" \\
  ghcr.io/docugardener/helm/docugardener:0.2.0`}
      </pre>

      <p className="text-sm text-gray-600 mb-4">
        The chart ships with PSA <code className="font-mono text-xs">restricted</code>-compatible
        pod specs, NetworkPolicies, and optional KEDA autoscaling (set{" "}
        <code className="font-mono text-xs">keda.enabled=true</code> when running the KEDA operator).
        See the{" "}
        <a
          href="https://github.com/docugardener/docugardener/blob/main/helm/docugardener/values.yaml"
          target="_blank"
          rel="noopener noreferrer"
          className="text-green-600 hover:underline font-medium"
        >
          full values.yaml reference
        </a>{" "}
        and the{" "}
        <a
          href="https://github.com/docugardener/docugardener/blob/main/helm/docugardener/CHANGELOG.md"
          target="_blank"
          rel="noopener noreferrer"
          className="text-green-600 hover:underline font-medium"
        >
          chart changelog
        </a>.
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
