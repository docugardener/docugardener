# GTM-06 Legal Template Preparation - Mar 2026

## Status

Deferred for legal counsel review and drafting.
This document is a DocuGardener-specific legal preparation brief and deliverable specification.
It is not legal advice and is not a substitute for counsel.

---

## 1. Purpose

This document defines the exact legal deliverables DocuGardener should prepare before first enterprise outreach under backlog item `GTM-06`.

It is tied narrowly to the current DocuGardener product shape:

- CI-native documentation drift detection
- ephemeral analysis of repositories
- zero-retention positioning for source code
- platform LLM mode
- BYOK cloud mode
- BYOK local / air-gapped mode
- multi-tenant SaaS control plane
- enterprise expansion into regulated buyers

The goal is to give leadership and legal counsel a high-quality starting package for drafting:

1. Data Processing Agreement (DPA)
2. Terms of Service (ToS)
3. Privacy Policy
4. Subprocessor Register
5. AI Governance Transparency Note

---

## 2. Current DocuGardener Context

Based on the current product and backlog documents, the legal package must reflect the following facts:

- Source code is processed during analysis jobs but is intended to be handled ephemerally and not stored as long-term customer content.
- The product does persist account, tenant, billing, and operational metadata.
- Job outputs, audit logs, dismiss reasons, and other control-plane records may be stored.
- DocuGardener supports multiple model-routing modes:
  - platform-provided LLM
  - customer BYOK cloud provider
  - customer-local provider such as Ollama
- Enterprise packaging depends on a strong trust posture around:
  - confidentiality
  - zero-retention claims
  - customer IP ownership
  - role separation
  - auditability
  - deployment control

### Important legal drafting nuance

DocuGardener must not state:

> "We do not collect or process source code."

That would be inaccurate.

The correct product-legal framing is:

> "DocuGardener processes repository content transiently for analysis, but does not persist customer source code as long-term application data."

This distinction matters materially for the DPA, Privacy Policy, and security review process.

### Important international-transfer nuance

The backlog language says "no cross-border persistent storage."
That is helpful, but legally incomplete.

If personal data or customer content is transmitted to a provider or environment outside the originating jurisdiction, even transiently, the transfer analysis may still matter.
In other words, zero-retention does not remove all transfer questions.
Counsel should review:

- hosting regions
- support access
- LLM provider routing
- telemetry and log flows
- any third-country subprocessors

---

## 3. Best-Practice Baseline and Market Signal

The current market pattern among adjacent documentation vendors is clear:

- GitBook publicly exposes Terms, a Privacy Statement, a DPA with SCCs, and a subprocessor register.
- Mintlify publicly exposes Terms, Privacy, and third-party provider / subprocessor terms.
- Archbee publicly exposes Terms and Privacy.
- Swimm publicly exposes privacy/legal materials, though its positioning is broader than DocuGardener's current wedge.

### DocuGardener takeaway

For enterprise buyers, especially in regulated environments, these artefacts are table stakes.
DocuGardener's opportunity is not merely to match the market.
It is to express a cleaner trust position built around:

- transient processing
- zero-retention of customer code
- customer ownership
- explicit model-routing choices
- strong explanation of AI failure and human oversight paths

---

## 4. Regulatory / Standards Anchors To Reflect in Drafting

This is not a full legal matrix.
It is the minimum standards lens relevant to GTM-06.

### 4.1 GDPR / UK GDPR processor obligations

The DPA should reflect the requirements commonly associated with processor agreements under GDPR Article 28:

- subject matter and duration
- nature and purpose of processing
- categories of personal data
- categories of data subjects
- documented instructions
- confidentiality
- security measures
- subprocessor controls
- assistance with rights requests
- deletion / return of personal data
- audit and compliance support

### 4.2 International transfer mechanics

If DocuGardener serves EU / UK customers and any relevant data crosses borders, counsel should determine whether transfer mechanisms such as SCCs or UK transfer addenda are required.

### 4.3 Privacy notice baseline

The Privacy Policy should meet the normal expectations for:

- categories of data
- purposes
- legal bases
- retention
- recipients / subprocessors
- international transfers
- user rights
- contact channels

### 4.4 AI governance baseline

The AI transparency note should follow mainstream governance expectations around:

- transparency of AI use
- known limitations
- human oversight
- fallback behavior
- role of customer-configured providers
- training-use commitments

This is commercially important even where DocuGardener is not positioned as a high-risk AI system.

---

## 5. Proposed Deliverables

## 5.1 Deliverable 1 - Data Processing Agreement (DPA)

### Objective

Provide an enterprise-ready processor addendum that makes DocuGardener purchasable by privacy, procurement, and security teams.

### Recommended form

- standalone DPA
- incorporated by reference into ToS and order form
- enterprise negotiable exhibit

### Exact sections to include

1. Parties and role allocation
2. Definitions
3. Processing details
4. Customer instructions
5. Confidentiality obligations
6. Security measures
7. Subprocessor authorization and notice process
8. International transfer mechanism
9. Assistance with data subject requests
10. Assistance with security incidents / breach response
11. Deletion and return of personal data
12. Audit / evidence rights
13. Liability interaction with main agreement
14. Governing law / execution
15. Annex 1 - Processing description
16. Annex 2 - Technical and organizational measures
17. Annex 3 - Subprocessors

### DocuGardener-specific drafting positions

The DPA should explicitly state:

- DocuGardener acts as processor for customer account, operational, and incidental personal data processed in connection with the service.
- Repository content may be processed transiently for verification and remediation workflows.
- Customer source code is not retained as long-term application data after analysis completion, except where a generated result or customer-approved action intentionally creates downstream artifacts such as GitHub comments, check runs, fix PRs, or audit records.
- The service uses ephemeral working directories / temporary analysis environments for code processing.
- Persistent control-plane data is limited to the minimum needed for service operation, billing, security, and auditability.
- Customer retains ownership of customer content, including code and documentation.
- DocuGardener will not use customer content to train foundation models.

### Annex 1 - Processing description should specify

- Subject matter:
  - SaaS documentation verification and workflow automation
- Duration:
  - term of subscription plus applicable retention and deletion windows
- Purpose:
  - user authentication
  - tenant administration
  - PR / repository analysis
  - workflow status reporting
  - billing / security / audit logging
- Categories of personal data:
  - user account details
  - email address
  - GitHub OAuth profile fields
  - repository metadata
  - commit / PR metadata
  - audit log actor data
  - support communications
  - incidental personal data present in customer content
- Categories of data subjects:
  - customer employees
  - contractors
  - repository contributors
  - administrators
  - support contacts

### Annex 2 - Technical and organizational measures should emphasize

- transient repository cloning / ephemeral processing
- tenant isolation
- access controls and RBAC
- encryption in transit
- encryption at rest for persisted customer-adjacent metadata and credentials
- audit logging for privileged actions
- key-management approach
- incident response process
- deletion process
- environment segregation

### Counsel review flags

- Whether DocuGardener should describe some processing as processor-only, or whether limited controller-side processing also exists for billing, fraud, or security.
- Whether GitHub-delivered repository and contributor metadata should be characterized as customer data, platform data, or both.
- Whether audit logs should be retained under a separate justified retention basis.
- Whether BYOK cloud provider routing should be treated as:
  - customer-directed third-party processing
  - authorized subprocessor use
  - or a hybrid depending on plan and deployment mode

### Minimum enterprise expectation

The DPA should be publishable or available under NDA quickly, and should support enterprise contracting without requiring first-principles redrafting for every buyer.

---

## 5.2 Deliverable 2 - Terms of Service

### Objective

Provide the master SaaS contract baseline for self-serve and commercial sales.

### Recommended form

- public website ToS
- enterprise order form incorporation
- optional MSA wrapper for large deals

### Exact sections to include

1. Agreement scope and acceptance
2. Service description
3. Account responsibilities
4. Acceptable use
5. Customer content and licenses
6. Intellectual property
7. Confidentiality
8. Fees, billing, and taxes
9. Term and termination
10. Suspension rights
11. Security and support references
12. Third-party services and BYOK terms
13. Service changes / beta features
14. Warranties and disclaimers
15. Limitation of liability
16. Indemnity structure
17. Export controls / sanctions
18. Governing law and dispute mechanics
19. Notice provisions

### DocuGardener-specific drafting positions

The ToS should explicitly state:

- Customer retains all right, title, and interest in its code, documentation, configuration, and customer content.
- DocuGardener receives only the limited rights needed to host, process, analyze, and return service outputs.
- Generated outputs based on customer content are customer content, subject to the agreement.
- DocuGardener may use de-identified, aggregated service telemetry for operations and service improvement, but not customer code or documentation for model training.
- BYOK mode shifts parts of provider responsibility to the customer relationship with the selected provider.
- DocuGardener is not a legal, compliance, or regulatory certification service, even when it provides audit-supporting evidence.
- Automated suggestions remain subject to customer review and workflow controls unless a customer expressly enables automation features.

### Acceptable use section should cover

- unlawful content
- credential misuse
- prompt abuse / security abuse
- attempts to exfiltrate data or bypass controls
- use in violation of sanctions or export laws

### Confidentiality section should emphasize

- customer code and docs are confidential information
- security / support access is limited and need-based
- zero-retention architectural commitments do not waive confidentiality duties

### Counsel review flags

- whether there should be separate self-serve ToS and enterprise MSA language
- how broad the platform telemetry rights should be
- indemnity allocation for customer-supplied prompts, customer-supplied models, or BYOK-selected providers
- whether AI-generated suggestions require a separate disclaimer or feature-specific addendum

---

## 5.3 Deliverable 3 - Privacy Policy

### Objective

Explain clearly what personal data DocuGardener collects, why, how long it keeps it, who receives it, and what user rights exist.

### Exact sections to include

1. Scope of the policy
2. Controller identity and contact details
3. Categories of personal data collected
4. Sources of personal data
5. Purposes of processing
6. Legal bases
7. Retention periods
8. Recipients and subprocessors
9. International transfers
10. Security measures summary
11. Data subject rights
12. Cookies / analytics notice if applicable
13. Children's data statement if applicable
14. Changes to the policy
15. Contact / complaint channels

### DocuGardener-specific statements to include

#### What is collected

- name, email, login, and profile information received via GitHub OAuth or equivalent auth flow
- tenant and organization settings
- billing and usage metadata
- repository and PR metadata necessary to operate the service
- user action history such as triage actions and audit-log activity
- support and contact information

#### What is processed but not persisted as long-term customer content

- repository code
- documentation files
- PR diffs
- AST/context artifacts created during ephemeral analysis

#### What is explicitly NOT persisted as normal product data

- full customer source code as long-term stored application content

### Important wording discipline

Do not say:

> "We never collect source code."

Say instead:

> "We may process repository content during analysis, but we do not store customer source code as long-term product data after analysis completes, except to the extent customer-approved outputs or security/audit records intentionally preserve limited excerpts or metadata."

### BYOK-specific privacy note

The policy should clearly explain that:

- when customers configure their own LLM provider, requests may be routed to that provider under the customer's chosen configuration
- the provider's own privacy / data-processing terms will apply in addition to DocuGardener's terms
- some provider-specific retention and logging behaviors may differ by provider and customer configuration

### Counsel review flags

- whether separate privacy language is needed for website visitors versus product users
- how to describe support access to customer environments
- whether usage analytics tools or support tools introduce additional notice obligations
- how to describe logs that may contain snippets, prompts, or generated outputs

---

## 5.4 Deliverable 4 - Subprocessor Register

### Objective

Provide a public or customer-shareable operational register of subprocessors that is easy to review and maintain.

### Recommended form

- public webpage or trust-center page
- linked from DPA and Privacy Policy
- change-log or update date displayed

### Required columns

- Vendor name
- Service function
- Data categories involved
- Hosting / processing location
- Transfer mechanism if applicable
- Whether the vendor is optional or always-on
- Notes for BYOK mode if relevant
- Last updated date

### Initial DocuGardener structure

At minimum, prepare rows for:

- hosting provider (TBD)
- managed PostgreSQL provider
- Weaviate (self-hosted)
- Redis (self-hosted)
- platform LLM provider(s), if platform mode is offered
- monitoring / logging provider(s), if any
- support tooling, if any
- billing processor, if any
- email / notification provider, if any

### DocuGardener-specific requirement

The register must separate:

- always-on subprocessors
- optional subprocessors
- customer-directed BYOK providers

This distinction matters materially for enterprise review.

### Suggested process language

- customers are notified of material subprocessor changes
- customers have a review / objection path where legally or contractually appropriate

### Counsel review flags

- whether customer-chosen BYOK providers belong in the main subprocessor list or in a separate customer-directed provider schedule
- how to describe self-hosted components that run within DocuGardener-controlled infrastructure
- whether regional hosting variations require multiple rows or region-specific appendices

---

## 5.5 Deliverable 5 - AI Governance Transparency Note

### Objective

Provide a concise but serious explanation of how AI is used in DocuGardener, what its limits are, and what governance controls exist.

### Recommended form

- public trust / legal page
- linked from ToS, Privacy Policy, and enterprise security review materials
- optionally expanded into a customer security packet

### Exact sections to include

1. What AI is used for in DocuGardener
2. Where deterministic logic is used instead of AI
3. Human oversight model
4. Automation controls and customer choice
5. Known limitations / failure modes
6. Fallback and review behavior
7. Data flow summary
8. Model-routing modes
9. Customer data and training-use statement
10. Security and access controls summary
11. Contact / escalation route

### DocuGardener-specific positions to include

#### AI use cases

- semantic drift analysis
- suggested documentation remediation
- scoring / verification support

#### Human oversight and control

- customers configure thresholds and workflow behaviors
- customers can require human review before merge or before auto-application of changes
- dismissals and approvals can be logged for auditability

#### Failure and fallback behavior

- low-confidence or rejected AI results can trigger non-blocking alerts, manual review, or no auto-fix path
- AI output should be treated as assistance, not legal or compliance advice

#### Training-use statement

- DocuGardener will not use customer content to train its own models
- where third-party model providers are used, provider-specific terms may apply
- in platform mode, DocuGardener should state the intended provider data-use posture
- in BYOK mode, the customer controls provider selection and should review that provider's data-use terms

#### Data-flow clarity

Explain separately:

- platform LLM mode
- BYOK cloud mode
- BYOK local / self-hosted mode

This is one of DocuGardener's clearest market differentiators and should be explained better than generic AI vendors do it.

### Counsel review flags

- how strong the "never used for training" statement can be in each deployment mode
- whether the statement should explicitly reference provider-level retention windows
- whether the AI governance note should be incorporated into the ToS or remain informational

---

## 6. Exact Drafting Positions for DocuGardener

These are the recommended positions counsel should validate, preserve, or adjust.

### Position A - Zero-retention claim should be precise

Recommended wording direction:

> DocuGardener is designed to process repository content in ephemeral analysis environments and not retain customer source code as long-term application data.

Do not overstate this into an absolute claim that no code is ever processed, transmitted, or surfaced.

### Position B - Customer ownership should be explicit

Recommended wording direction:

> Customer retains ownership of its code, documentation, prompts, and customer content. DocuGardener receives only the limited rights necessary to provide the service.

### Position C - BYOK needs special legal treatment

Recommended wording direction:

> When customers configure their own AI provider credentials or endpoints, DocuGardener routes requests according to customer configuration. Additional provider terms and privacy commitments may apply directly between the customer and that provider.

### Position D - Audit support is not compliance certification

Recommended wording direction:

> DocuGardener may assist customers with documentation governance and evidence collection, but does not certify legal or regulatory compliance.

### Position E - AI output is assistive, not authoritative

Recommended wording direction:

> AI-generated suggestions support documentation workflows and may require customer review, configuration, or approval depending on enabled workflow settings.

---

## 7. Competitor Implementation Patterns Worth Borrowing

These are not endorsements.
They are practical market patterns.

### GitBook

Patterns worth borrowing:

- public Terms page
- public Privacy Statement
- public DPA availability, including SCC reference
- public subprocessor register

### Mintlify

Patterns worth borrowing:

- public Terms page
- public Privacy page
- public third-party provider / subprocessor page
- explicit pass-through treatment of third-party provider terms

### Archbee

Patterns worth borrowing:

- public Terms and Privacy materials that clearly address user content and platform usage

### DocuGardener opportunity

Most competitors do not appear to center their public legal posture around ephemeral code processing and zero-retention in the same way DocuGardener can.
That should be treated as a differentiator in both the DPA and AI transparency note.

---

## 8. Deliverable-by-Deliverable Acceptance Criteria

## DPA

- [ ] Covers GDPR Article 28-style processor requirements
- [ ] Includes Annex 1 processing description
- [ ] Includes Annex 2 technical and organizational measures
- [ ] Includes Annex 3 subprocessors
- [ ] Addresses transfer mechanics where needed
- [ ] Clearly describes transient code processing and non-persistence
- [ ] States no model training on customer content by DocuGardener

## Terms of Service

- [ ] States customer IP ownership clearly
- [ ] Defines license to operate service narrowly
- [ ] Covers acceptable use, suspension, confidentiality, and liability
- [ ] Addresses BYOK and third-party providers
- [ ] States audit support is not legal certification

## Privacy Policy

- [ ] Distinguishes persisted data from transiently processed repository content
- [ ] Lists categories, purposes, legal bases, retention, and rights
- [ ] Addresses provider routing and subprocessors
- [ ] Avoids inaccurate "we never collect code" phrasing

## Subprocessor Register

- [ ] Public or customer-shareable
- [ ] Includes purpose, location, data categories, and update date
- [ ] Separates always-on vs optional vs customer-directed providers

## AI Governance Transparency Note

- [ ] Explains AI use, limitations, oversight, fallback behavior, and training commitments
- [ ] Separates platform mode, BYOK cloud, and BYOK local
- [ ] Reconciles marketing language with actual technical behavior

---

## 9. Suggested Work Plan for Counsel + Leadership

### Week 1

1. Confirm deployment and data-flow facts with engineering and security.
2. Freeze the list of actual vendors and regions.
3. Decide the commercial structure:
   - public ToS only
   - ToS plus enterprise order form
   - ToS plus MSA
4. Decide whether BYOK providers are treated as customer-directed providers, subprocessors, or split by mode.

### Week 2

1. Draft DPA
2. Draft ToS
3. Draft Privacy Policy
4. Publish first subprocessor register
5. Draft AI governance note
6. Review all claims against actual architecture and security posture

### Before enterprise outreach

- Confirm all public-facing legal statements are technically true
- Confirm all linked legal pages exist and are consistent
- Confirm the sales deck, website copy, DPA, Privacy Policy, and AI transparency note all use the same wording for:
  - ephemeral processing
  - customer ownership
  - no training on customer content
  - BYOK mode

---

## 10. Immediate Leadership Questions for Counsel

1. Is DocuGardener acting only as processor for product data, or partly as controller for some analytics, security, and billing functions?
2. What transfer mechanisms are needed for the intended hosting regions and subprocessors?
3. How should BYOK cloud routing be characterized legally?
4. What retention periods are supportable for:
   - audit logs
   - billing records
   - support records
   - security logs
5. Can the "no training on customer content" statement be made uniformly across:
   - platform mode
   - BYOK cloud
   - BYOK local
6. Does the enterprise sales motion require a trust-center style publication set from day one?

---

## 11. Recommended Outcome

The output of GTM-06 should not be a vague "legal pack."
It should be a DocuGardener-specific trust package with five concrete artefacts:

1. DPA ready for enterprise review
2. ToS ready for website and order-form incorporation
3. Privacy Policy accurate to the current architecture
4. maintainable subprocessor register
5. AI governance transparency note that explains exactly how DocuGardener uses AI and where the boundaries are

If counsel validates the key positions above, GTM-06 becomes a real enterprise-enablement item, not a generic paperwork exercise.

---

## 12. Sources Reviewed

Primary standards and official references:

- GDPR Article 28 landing page: https://www.edpb.europa.eu/gdpr-articles/article-28-processor_en
- European Commission SCC overview: https://commission.europa.eu/law/law-topic/data-protection/international-dimension-data-protection/new-standard-contractual-clauses-questions-and-answers-overview_cs
- EDPB international transfer guidance summary: https://www.edpb.europa.eu/news/news/2021/edpb-adopts-guidelines-interplay-between-art-3-and-chapter-v-gdpr-statement-digital_en
- EDPB Article 48 guidelines summary: https://www.edpb.europa.eu/system/files/2024-12/edpb_guidelines_202402_article48_en.pdf
- NIST AI RMF 1.0: https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-ai-rmf-10
- EU AI Act transparency summary: https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-50

Competitor and adjacent market references:

- GitBook Terms: https://gitbook.com/docs/policies/terms
- GitBook Privacy Statement and DPA reference: https://policies.gitbook.com/privacy-and-security/statement
- GitBook Subprocessors: https://policies.gitbook.com/privacy-and-security/security/subprocessors
- Mintlify Terms: https://www.mintlify.com/legal/terms
- Mintlify Privacy: https://www.mintlify.com/legal/privacy
- Mintlify Third-Party Provider Terms: https://www.mintlify.com/legal/third-party-provider-terms
- Archbee Terms: https://www.archbee.com/terms-of-service/
- Archbee Privacy: https://www.archbee.com/privacy-policy
- Swimm Privacy: https://swimm.io/legal/privacy-policy

Provider data-use references:

- OpenAI API data controls: https://platform.openai.com/docs/models/how-we-use-your-data
- Google Vertex AI data governance / zero data retention: https://cloud.google.com/vertex-ai/generative-ai/docs/data-governance
