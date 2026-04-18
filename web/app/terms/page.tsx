// SPDX-License-Identifier: AGPL-3.0-or-later
import Link from "next/link"
import { MarketingHeader } from "@/components/marketing/MarketingHeader"
import { MarketingFooter } from "@/components/marketing/MarketingFooter"

export const metadata = {
  title: "Terms of Service — DocuGardener",
  description: "The terms governing your use of DocuGardener.",
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="text-xl font-bold text-gray-900 mb-3">{title}</h2>
      <div className="space-y-3 text-gray-600 text-sm leading-relaxed">{children}</div>
    </section>
  )
}

export default function TermsPage() {
  return (
    <div className="flex flex-col min-h-screen bg-white">
      <MarketingHeader />

      <main className="flex-1 max-w-3xl mx-auto px-6 py-16 w-full">
        <p className="text-xs font-bold uppercase tracking-widest text-green-600 mb-3">Legal</p>
        <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 mb-2">Terms of Service</h1>
        <p className="text-sm text-gray-400 mb-12">Last updated: March 2026</p>

        <Section title="1. Acceptance">
          <p>
            By creating an account or using DocuGardener ("Service"), you agree to these Terms of
            Service on behalf of yourself and the organisation you represent ("Customer"). If you
            do not agree, do not use the Service.
          </p>
        </Section>

        <Section title="2. Service description">
          <p>
            DocuGardener is a documentation drift detection platform that integrates with GitHub
            repositories to identify inconsistencies between code changes and documentation,
            generate suggested updates, and provide governance and audit tooling.
          </p>
        </Section>

        <Section title="3. Customer content and ownership">
          <p>
            <strong className="text-gray-800">Customer retains all right, title, and interest
            in its code, documentation, configuration, and any content submitted to the
            Service</strong> ("Customer Content"). You grant DocuGardener only the limited licence
            necessary to host, process, analyse, and return Service outputs.
          </p>
          <p>
            Generated outputs (drift reports, suggested documentation changes, check-run
            annotations) that are derived from Customer Content are treated as Customer Content
            and remain subject to this agreement.
          </p>
          <p className="bg-green-50 border border-green-100 rounded-lg px-4 py-3 text-green-800 text-xs">
            DocuGardener will not use Customer Content to train its own AI models.
          </p>
        </Section>

        <Section title="4. Repository content processing">
          <p>
            The Service processes repository content transiently to perform documentation analysis.
            Source code is not retained as long-term application data after analysis completes.
            See our <Link href="/privacy" className="text-green-600 hover:underline">Privacy Policy</Link> for
            full details of what is and is not persisted.
          </p>
        </Section>

        <Section title="5. BYOK and third-party providers">
          <p>
            Customers who configure their own AI provider credentials ("BYOK") direct DocuGardener
            to route analysis requests to that provider. In BYOK mode, the selected provider's own
            terms of service, privacy policy, and data-use commitments apply in addition to these
            Terms. DocuGardener is not responsible for third-party provider data-handling practices.
          </p>
          <p>
            DocuGardener integrates with third-party services including GitHub, Slack, Jira,
            Linear, and Stripe. Use of those services is governed by their respective terms.
          </p>
        </Section>

        <Section title="6. Acceptable use">
          <p>You may not use the Service to:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Process content you do not have rights to submit</li>
            <li>Attempt to access other tenants' data or bypass access controls</li>
            <li>Abuse or circumvent rate limits, prompt guardrails, or security controls</li>
            <li>Engage in conduct that violates applicable laws or export controls</li>
            <li>Use the Service in connection with sanctioned countries or parties</li>
          </ul>
        </Section>

        <Section title="7. AI-generated suggestions">
          <p>
            DocuGardener uses AI to generate documentation suggestions and drift analysis. These
            outputs are assistive in nature and <strong className="text-gray-800">require customer
            review</strong> before application. DocuGardener does not certify the accuracy,
            completeness, or legal compliance of any AI-generated suggestion.
          </p>
          <p>
            DocuGardener is a documentation workflow tool and does not certify legal, regulatory,
            or compliance status, even where its audit features support evidence collection.
          </p>
        </Section>

        <Section title="8. Accounts and access">
          <p>
            You are responsible for maintaining the confidentiality of your credentials and for all
            activity under your account. Notify us immediately at{" "}
            <a href="mailto:security@docugardener.dev" className="text-green-600 hover:underline">
              security@docugardener.dev
            </a>{" "}
            of any suspected unauthorised access.
          </p>
        </Section>

        <Section title="9. Fees and billing">
          <p>
            Paid plans are billed in advance on a monthly or annual basis via Stripe. Fees are
            non-refundable except as required by law or as expressly stated at the time of
            purchase. Failure to pay may result in suspension of the Service.
          </p>
        </Section>

        <Section title="10. Term and termination">
          <p>
            These Terms remain in effect until your account is closed. Either party may terminate
            at any time. On termination, your access to the Service will cease. Provisions that
            should survive termination (ownership, confidentiality, limitation of liability) will do so.
          </p>
        </Section>

        <Section title="11. Confidentiality">
          <p>
            Customer Content is confidential. DocuGardener will not disclose Customer Content
            except as required to operate the Service, comply with legal obligations, or with your
            consent. Access by DocuGardener personnel to customer environments is limited,
            need-based, and logged.
          </p>
        </Section>

        <Section title="12. Warranties and disclaimers">
          <p>
            The Service is provided "as is" without warranty of any kind, express or implied.
            DocuGardener does not warrant that the Service will be error-free, uninterrupted, or
            that analysis outputs will be accurate in all cases.
          </p>
        </Section>

        <Section title="13. Limitation of liability">
          <p>
            To the maximum extent permitted by applicable law, DocuGardener's total liability for
            any claims arising from these Terms or use of the Service shall not exceed the fees
            paid by Customer in the twelve months preceding the claim. DocuGardener is not liable
            for indirect, incidental, consequential, or punitive damages.
          </p>
        </Section>

        <Section title="14. Changes to these Terms">
          <p>
            We may update these Terms from time to time. Material changes will be communicated
            with at least 30 days' notice via email to your organisation's admin or via in-app
            notification. Continued use after the effective date constitutes acceptance.
          </p>
        </Section>

        <Section title="15. Governing law">
          <p>
            These Terms are governed by applicable law without regard to conflict-of-law principles.
            Disputes will first be submitted to good-faith negotiation. If unresolved within 30
            days, either party may pursue resolution through binding arbitration or, where required
            by applicable law, through the courts of competent jurisdiction.
          </p>
        </Section>

        <Section title="15a. AI Act Compliance (EU Customers)">
          <p>
            DocuGardener is classified as a{" "}
            <strong className="text-gray-800">
              General Purpose AI (GPAI) system
            </strong>{" "}
            under Regulation (EU) 2024/1689 (the EU AI Act). It does not fall into any
            high-risk category listed in Annex III of that Regulation.
          </p>
          <p>
            <strong className="text-gray-800">Article 12 — Transparency commitments:</strong>{" "}
            DocuGardener publishes model cards for each supported LLM provider, discloses
            intended use and known limitations, and maintains a public Trust &amp; Compliance
            page at{" "}
            <a href="https://docugardener.dev/trust" className="text-green-600 hover:underline">
              docugardener.dev/trust
            </a>
            .
          </p>
          <p>
            <strong className="text-gray-800">Sub-processor disclosure:</strong> A current
            sub-processor register, including data locations and transfer mechanisms, is
            published at{" "}
            <a href="/trust#sub-processors" className="text-green-600 hover:underline">
              /trust#sub-processors
            </a>
            .
          </p>
          <p>
            <strong className="text-gray-800">Human oversight (Article 14):</strong> All
            AI-generated documentation suggestions require explicit human review and approval
            via GitHub Pull Request before taking effect. DocuGardener never modifies
            production documentation autonomously. Full details are published at{" "}
            <a href="/trust/human-oversight" className="text-green-600 hover:underline">
              /trust/human-oversight
            </a>
            .
          </p>
          <p className="text-xs text-gray-400">
            This section was added on 2026-04-18 in response to EU AI Act obligations
            effective August 2, 2026.
          </p>
        </Section>

        <Section title="16. Contact">
          <p>
            Legal notices:{" "}
            <a href="mailto:legal@docugardener.dev" className="text-green-600 hover:underline">
              legal@docugardener.dev
            </a>
            <br />
            Security reports:{" "}
            <a href="mailto:security@docugardener.dev" className="text-green-600 hover:underline">
              security@docugardener.dev
            </a>
          </p>
        </Section>
      </main>

      <MarketingFooter />
    </div>
  )
}
