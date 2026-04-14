# DocuGardener Landing Page FAQ

This FAQ is written for public landing-page use.
It is based on the current product, GTM, pricing, and legal-preparation documentation in `./docs` and `./docs/specs`.

## FAQ

### What is DocuGardener?

DocuGardener is a CI-native documentation verification layer for docs-as-code teams. It analyzes pull requests, detects when code changes contradict documentation, and helps teams fix the drift before it merges.

### How is DocuGardener different from an AI documentation writer?

DocuGardener is built to verify and remediate documentation drift inside the pull-request workflow, not just generate text. It combines deterministic checks, model-assisted analysis, and auditability so teams can trust the result more than a generic writing assistant.

### What problem does it solve?

It prevents stale docs from causing broken integrations, failed onboarding, outdated runbooks, and audit gaps. The core job is simple: when code changes, the related documentation should not silently fall behind.

### How does it work in practice?

Install the GitHub App, open a pull request, and DocuGardener checks whether the code change affects documentation. If it finds drift, it can flag the issue, suggest the exact Markdown fix, and in some cases open an auto-fix PR for review.

### What kinds of documentation does it check best?

DocuGardener is strongest on documentation that is tightly coupled to code changes:

- API docs and OpenAPI / Swagger specs
- README and onboarding setup docs
- runbooks and operational playbooks
- architecture decision records and technical design docs

### Does it block pull requests?

Yes, when the configured severity threshold is met. The goal is not to add friction for its own sake, but to stop documented behavior from drifting away from shipped behavior.

### What if the team decides no documentation update is needed?

Teams can dismiss a finding, but DocuGardener is designed to make that decision explicit. For higher-severity drift, the workflow can require a reason so the decision is attributable and auditable.

### Does DocuGardener write the documentation update for me?

Yes, that is a core part of the value. Instead of only saying "update your docs," it can suggest the exact fix and, when enabled, open an auto-fix PR so the team reviews and merges rather than writing from scratch.

### Can it handle AI-authored code changes?

Yes. AI Author Mode is designed for teams using tools like Copilot or Cursor. When enabled, DocuGardener can detect AI-authored PR patterns and handle documentation remediation automatically according to the configured workflow.

### Does it work before code reaches CI?

Yes. DocuGardener includes a VS Code pre-push workflow backed by a stateless `/check` endpoint, so teams can catch likely documentation drift before pushing changes upstream.

### Does DocuGardener store our source code?

The product is designed for ephemeral processing and zero-retention of customer source code as long-term product data. Repository content is processed during analysis, but the source code itself is not intended to be persisted as normal application data after the job completes.

### Can we use our own model provider?

Yes. DocuGardener supports BYOK in cloud and local modes. Teams can route through their own provider agreements or run local Ollama models when they need stronger control over data flow and infrastructure boundaries.

### What security features are built in?

The current documentation emphasizes:

- ephemeral analysis environments
- no long-term storage of source code
- tenant isolation
- role-based access control
- prompt guardrails
- audit logging for key decisions and privileged actions

### Is it built for regulated teams, or only for developers?

Both, but in different ways. Platform and engineering teams use it to reduce review friction and stop stale merges. Security and compliance teams use it for evidence, traceability, and stronger documentation governance.

### What integrations does it support?

Current documentation highlights GitHub as the core workflow surface, with Slack and Jira integrations available for notification and lifecycle visibility.

---

## Self-Hosting

### Do I need a registered domain to self-host?

Yes, for automatic TLS via Let's Encrypt you need a public domain with an A record pointing to your server. For internal or private-network deployments without a domain, Caddy can issue a self-signed certificate — browsers will show an untrusted-certificate warning until you add Caddy's local CA to your trust store, which is usually acceptable for developer-audience tools.

### Is the self-hosted version secure out of the box?

Yes, when deployed with the production Docker Compose. Caddy handles automatic HTTPS so all traffic is encrypted, session cookies get the Secure flag, and GitHub OAuth works correctly. Internal services (Postgres, Redis, Weaviate, FastAPI) have no host-port bindings and are only reachable inside the private Docker network. The dev compose is HTTP-only and is not suitable for internet-facing deployments.

### How do I deploy DocuGardener?

Clone the repo, copy `.env.production.example` to `.env.production`, run `bash scripts/generate-secrets.sh` to generate all secrets, fill in your domain and GitHub credentials, then run `docker compose --env-file .env.production -f docker/docker-compose.prod.yml up -d --build`. Caddy obtains a TLS certificate automatically on first start. Full step-by-step instructions are in `DEPLOYMENT.md`.

### What ports need to be open on the server?

Only 22 (SSH), 80 (HTTP — required for the Let's Encrypt challenge and to redirect to HTTPS), and 443 (HTTPS). All other ports — including FastAPI 8000, Postgres 5432, Redis 6379, and Weaviate 8080 — should be blocked at the firewall. The production compose does not bind those services to host ports, but a top-level firewall rule is recommended as a second layer of defence.

### Can I self-host on a private network without a public domain?

Yes. Replace the Let's Encrypt block in `docker/Caddyfile` with `tls internal` and set your server's internal IP or hostname as the domain. Caddy generates a local CA and issues a certificate automatically. You can accept the browser warning or run `caddy trust` on each client machine to add the CA to the system trust store.

---

### What plans are available?

The current plan structure is:

- Free: 1 public repo, 50 PR analyses per month, 1 seat
- Pro: 5 repos, 500 PR analyses per month, 10 seats
- Team: unlimited repos and analyses, 100 seats, plus enterprise-oriented governance features

### Is there a way to try it on a private repository?

Yes. The documented GTM motion includes a 14-day Pro trial for one private repo, with limited seats, so teams can evaluate the workflow on real internal code before purchasing.

### Who is DocuGardener for first?

The primary self-serve entry point is platform engineers, tech leads, and engineering teams that feel documentation drift in daily delivery. The expansion path then moves into security, compliance, and leadership when audit, SSO, evidence export, or stronger governance become important.

### How is this different from GitBook, Mintlify, or docs portals?

DocuGardener is not positioned as a publishing portal or website builder. It is positioned as a verification and remediation layer that lives in the PR and CI workflow, helping teams keep docs accurate as code changes.

### Why would a team pay for it if they already use docs-as-code?

Docs-as-code solves versioning. It does not automatically solve truth. DocuGardener adds the missing control: verifying that the documentation still matches what the code now does.

### Is DocuGardener a compliance certification tool?

No. It helps teams produce evidence, audit trails, and documented decisions around documentation governance. It supports compliance workflows, but it is not itself a legal or regulatory certification service.

### What is the fastest way to see value?

Install the GitHub App, connect a repository, and let DocuGardener scan the next PR that changes an API, setup flow, or documented behavior. The product is designed so the first useful moment happens inside the existing workflow, not after a long setup project.

---

## Writing Notes

This FAQ follows landing-page Q and A best practices:

- short question titles
- direct first-sentence answers
- minimal jargon
- trust and security questions included early
- pricing and trial questions included
- differentiation questions included
- no claims beyond the current documentation
- self-hosting group added (2026-03-09): domain requirement, security posture, deployment steps, firewall, private-network fallback
