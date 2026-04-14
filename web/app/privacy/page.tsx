// SPDX-License-Identifier: AGPL-3.0-or-later
import Link from "next/link"
import { MarketingHeader } from "@/components/marketing/MarketingHeader"
import { MarketingFooter } from "@/components/marketing/MarketingFooter"

export const metadata = {
  title: "Privacy Policy — DocuGardener",
  description: "How DocuGardener collects, processes, and protects your data.",
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="text-xl font-bold text-gray-900 mb-3">{title}</h2>
      <div className="space-y-3 text-gray-600 text-sm leading-relaxed">{children}</div>
    </section>
  )
}

export default function PrivacyPage() {
  return (
    <div className="flex flex-col min-h-screen bg-white">
      <MarketingHeader />

      <main className="flex-1 max-w-3xl mx-auto px-6 py-16 w-full">
        <p className="text-xs font-bold uppercase tracking-widest text-green-600 mb-3">Legal</p>
        <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 mb-2">Privacy Policy</h1>
        <p className="text-sm text-gray-400 mb-12">Last updated: March 2026</p>

        <Section title="1. Who we are">
          <p>
            DocuGardener ("DocuGardener", "we", "us", "our") is a documentation drift detection
            service that integrates with GitHub to analyse code changes and surface documentation
            inconsistencies. This policy explains how we collect, use, and protect personal data
            when you use our service.
          </p>
          <p>
            For questions about this policy, contact us at{" "}
            <a href="mailto:privacy@docugardener.dev" className="text-green-600 hover:underline">
              privacy@docugardener.dev
            </a>.
          </p>
        </Section>

        <Section title="2. Data we collect and why">
          <p><strong className="text-gray-800">Account and identity data</strong> — name, email address, and profile information received via GitHub OAuth or email magic-link authentication. Used to authenticate you and associate your activity with your organisation.</p>
          <p><strong className="text-gray-800">Tenant and organisation settings</strong> — repository configuration, integration credentials (stored encrypted), plan and billing metadata, role assignments, and invite records. Used to operate the service for your organisation.</p>
          <p><strong className="text-gray-800">Usage and operational data</strong> — triage actions, dismiss reasons, job results, drift scores, and activity logs. Used to provide the service and generate analytics visible to your team.</p>
          <p><strong className="text-gray-800">Billing data</strong> — subscription status and billing metadata processed via Stripe. We do not store full card details. Stripe's privacy policy governs payment data.</p>
          <p><strong className="text-gray-800">Support communications</strong> — messages you send us when reporting issues or requesting support.</p>
        </Section>

        <Section title="3. Repository content — transient processing">
          <p>
            DocuGardener analyses repository content (code, documentation files, PR diffs) to
            detect documentation drift. This content is processed transiently in ephemeral analysis
            environments. <strong className="text-gray-800">We do not store customer source code as
            long-term application data</strong> after analysis completes.
          </p>
          <p>
            Analysis outputs — drift scores, suggested documentation changes, check-run annotations,
            and audit records — may be persisted as part of normal service operation. These outputs
            are derived artefacts, not retained copies of your source code.
          </p>
          <p className="bg-green-50 border border-green-100 rounded-lg px-4 py-3 text-green-800 text-xs">
            We will not use your repository content or documentation to train our own AI models.
            Customer content remains your intellectual property.
          </p>
        </Section>

        <Section title="4. AI model routing and BYOK">
          <p>
            DocuGardener supports three AI routing modes. The mode your organisation uses affects
            how analysis requests are handled:
          </p>
          <ul className="space-y-2 pl-4">
            <li><strong className="text-gray-800">Hosted</strong> — analysis requests are routed to a hosted LLM provider on your behalf. The provider's data-use terms apply.</li>
            <li><strong className="text-gray-800">BYOK Cloud</strong> — requests are routed directly to your configured cloud provider (e.g. OpenAI, Anthropic, Google Vertex, Azure OpenAI) using your own credentials. That provider's own privacy policy and data-use terms apply.</li>
            <li><strong className="text-gray-800">BYOK Local</strong> — requests are routed to a locally deployed model (e.g. Ollama). No repository content leaves your network for AI processing.</li>
          </ul>
          <p>
            Your organisation's chosen mode is visible in the DocuGardener Settings page under
            AI Configuration.
          </p>
        </Section>

        <Section title="5. Audit logging">
          <p>
            Security-relevant actions — logins, triage decisions, role changes, settings
            modifications, and evidence exports — are recorded in a tamper-evident audit log using
            SHA-256 hash chaining. This log is retained to support your compliance and security
            review obligations. Audit log data may contain user identifiers and action metadata.
          </p>
        </Section>

        <Section title="6. Data sharing and subprocessors">
          <p>
            We share data only with subprocessors necessary to operate the service — including
            our cloud hosting provider, database infrastructure, and Stripe for billing. We do not
            sell personal data to third parties.
          </p>
          <p>
            Enterprise customers may request the current subprocessor register by contacting{" "}
            <a href="mailto:security@docugardener.dev" className="text-green-600 hover:underline">
              security@docugardener.dev
            </a>.
          </p>
        </Section>

        <Section title="7. Data retention">
          <p>Account and organisation data is retained for the duration of your subscription and a reasonable wind-down period following termination.</p>
          <p>Audit logs are retained for compliance purposes in line with your plan's retention settings.</p>
          <p>Repository content processed during analysis is not retained after the analysis job completes, as described in Section 3.</p>
        </Section>

        <Section title="8. International data transfers">
          <p>
            If your organisation is based outside the country where our infrastructure is hosted,
            data may be transferred internationally. We take steps to ensure appropriate safeguards
            are in place. Customers in regulated jurisdictions should contact us to discuss
            applicable transfer mechanisms, including standard contractual clauses where required.
          </p>
        </Section>

        <Section title="9. Your rights">
          <p>
            Depending on your jurisdiction, you may have rights to access, correct, delete, or
            restrict processing of your personal data. Organisation admins can manage most user
            data directly from the Settings page. For other requests, contact{" "}
            <a href="mailto:privacy@docugardener.dev" className="text-green-600 hover:underline">
              privacy@docugardener.dev
            </a>.
          </p>
        </Section>

        <Section title="10. Security">
          <p>
            We use encryption in transit (TLS) and at rest for credentials and sensitive metadata.
            Access to production systems is restricted and access events are logged. Our architecture
            uses tenant isolation to prevent cross-organisation data access.
          </p>
        </Section>

        <Section title="11. Changes to this policy">
          <p>
            We may update this policy from time to time. Material changes will be communicated
            via email to organisation admins or via an in-app notice. Continued use of the service
            after a change constitutes acceptance of the updated policy.
          </p>
        </Section>
      </main>

      <MarketingFooter />
    </div>
  )
}
