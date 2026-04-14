# DocuGardener

> When your agents write the code, DocuGardener writes the docs. You just approve.

[![Python 3.11+](https://img.shields.io/badge/python-3.11+-blue.svg)](https://www.python.org/downloads/)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

## Overview

DocuGardener is the documentation safety net for AI-native engineering teams. As Copilot, Cursor, and Devin write more of your code, DocuGardener detects documentation drift in every PR and — for AI-authored code — drafts and merges the fix automatically. No human touchpoint required.

### For Platform Engineers — Zero-touch docs for AI-authored code

- 🤖 **AI Author Mode (Zero-Touch)**: Detects AI-authored PRs (Copilot, Cursor, Devin, Claude) and automatically drafts + merges documentation updates. Supports all three GitHub merge methods (squash / merge commit / rebase). The fix PR body shows exactly which AI authorship signal triggered it.
- 🚀 **CI-native drift detection**: Analyzes every PR diff; blocks merges when docs fall behind code. First scan in under 3 minutes with the bundled zero-config LLM key.
- 📥 **Triage Inbox**: Centralized dashboard to review, accept, or ignore drift alerts across all repos. High-contrast semantic diffs, keyboard-driven (`j`/`k`, `a`, `i`).
- 🤖 **Auto-Fix PR (`autoHeal`)**: Drafts the precise Markdown update and opens a PR. The developer just reviews and merges.
- 🔌 **VS Code Extension (Pre-push Check)**: Real-time drift diagnostics in the IDE via a stateless `/check` API — catch issues before code reaches CI.
- 📊 **Nightly Rollup Reports**: Automated scheduler (02:00 UTC) creates GitHub Issues per repository summarizing average drift, peak scores, and high-drift PRs.
- 🔌 **Slack & Jira Integrations**: Push drift alerts to Slack channels; auto-comment on existing Jira tickets at four lifecycle points (drift detected → fix PR created → no update required → fix PR merged). Pro+.
- 🎮 **Git Diff Simulator & Prompt Playground**: Paste raw diffs to preview scoring; override system prompts per tenant to tune verification strictness. Pro+.

### For Compliance & Governance Teams — Produce evidence, prove controls

- 🔒 **Zero-Retention Architecture**: Source code is cloned into a RAM-disk (tmpfs), analyzed, and wiped instantly. Never stored.
- 🏢 **Strict Multi-Tenancy**: Namespace isolation at the vector DB level via FastAPI context middleware. Physically impossible for one tenant to query another's data.
- 📋 **Audit Log (SHA-256 Hash Chain)**: Every verification job, triage decision, and dismiss action is cryptographically logged. Tamper-evident by design.
- 👥 **Role-Based Access Control (4 roles)**: ADMIN, AUDITOR, BILLING_ADMIN, VIEWER — enforced at every API endpoint. AUDITOR and BILLING_ADMIN available on Pro+.
- ✍️ **Required Dismiss Reason**: Dismissing critical or significant drift requires a typed justification. Creates an attributed evidence trail in the audit log.
- 📉 **Ignore-rate Analytics**: Deep-dive reporting on bypass patterns, severity breakdowns, and triage trends. Makes bypass behavior visible before it becomes a compliance gap. Pro+.
- 📊 **Governance Proof Points**: Reports dashboard surfaces % PRs with drift, average time to triage, and % critical alerts dismissed — ready for board-level conversations.
- 📤 **Evidence Export (CSV / JSON)**: One-click export of the audit log filtered by date range and event type. Team plan only.
- 🔐 **SSO / SAML 2.0 + SCIM**: Identity federation and automated user provisioning for enterprise identity providers (Okta, Entra ID, Google Workspace). Team plan only.
- 💳 **Billing & Usage Monitoring**: Real-time LLM token tracking per job, daily cost chart, provider/model breakdown, configurable monthly budget with hard-block enforcement.
- 🛡️ **Prompt Guardrails**: Domain-anchored prompts, content length caps, forbidden pattern blocklist, and audit logging protect against prompt injection. ADMIN-only access.

## Deployment

| Method | When to use |
|---|---|
| **Docker Compose** | Local dev, single-server |
| **Kubernetes / Helm** | On-premise regulated environments (TEAM plan), HA production |

For Kubernetes, the Helm chart (`helm/docugardener/`) is published to `oci://ghcr.io/docugardener/helm/docugardener`. It ships PSA-restricted compliant, with NetworkPolicies and air-gap support. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#kubernetes-deployment-ent-13) and the chart's own [helm/docugardener/README.md](helm/docugardener/README.md).

---

## Quick Start

### Prerequisites

- Python 3.11+
- Docker & Docker Compose
- GitHub App credentials

### Installation

```bash
# Clone repository
git clone https://github.com/your-org/docugardener.git
cd docugardener

# Create virtual environment
python -m venv .venv
source .venv/bin/activate  # or `.venv\Scripts\activate` on Windows

# Install dependencies
pip install -e ".[dev]"

# Copy environment template
cp .env.example .env
# Edit .env with your configuration
```

### Running Locally

```bash
# Start with Docker Compose (includes Redis, Vector DB)
docker-compose up -d

# Or run directly
uvicorn src.main:app --reload --port 8000
```

### Running Tests

**626 Python unit tests** + **265 Vitest** + **37 Playwright E2E** — all passing.

```bash
# Unit tests (no external services required)
pytest tests/unit/ -v

# E2E integration tests (in-memory SQLite + mocked GitHub/LLM — no Docker required)
pytest tests/integration/ -v

# Full suite
pytest tests/ -v

# With coverage
pytest --cov=src --cov-report=html
```

## Architecture

```text
┌─────────────────────────────────────────────────────────────────┐
│                         GitHub                                   │
│  ┌──────────┐    ┌──────────────┐    ┌─────────────────────┐   │
│  │    PR    │───▶│   Webhook    │───▶│  Check Run / Comment│   │
│  └──────────┘    └──────────────┘    └─────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                     DocuGardener                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │   Ephemeral  │  │   Semantic   │  │   RAG Verification   │  │
│  │   Ingestion  │─▶│   Analysis   │─▶│   (2-Stage LLM)      │  │
│  │   (tmpfs)    │  │ (tree-sitter)│  │                      │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
│         │               ▲                       │               │
│         ▼               │                       ▼               │
│  ┌──────────────┐  ┌──────────────┐      ┌──────────────────────┐  │
│  │    Local     │  │   IDE /check │      │   OpenAI / Ollama    │  │
│  │  Embeddings  │  │   (Stateless)│      │                      │  │
│  └──────────────┘  └──────────────┘      └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Vector DB (Weaviate)                         │
│   Strict Multi-tenant isolation via Context-Aware Client         │
└─────────────────────────────────────────────────────────────────┘
```

## 🚥 Governance Logic

DocuGardener acts as a gatekeeper but respects repository ownership. The governance flow is designed to balance strict documentation quality with development velocity.

### Workflow Diagram

```mermaid
graph TD
    A["Push Code / Create PR"] --> B["DocuGardener Analysis"]
    B --> C{Verified Score?}
    
    C -- "Score < 60 (Minor/Moderate)" --> D["✅ PR status: GREEN"]
    D --> E["Merge Allowed"]
    
    C -- "Score 60-80 (Significant)" --> F["🔶 PR status: NEUTRAL (Warning)"]
    F --> G{"Owner Decision"}
    G -- "Approval Rule met?" --> E
    
    C -- "Score > 80 (Critical)" --> H["🚨 PR status: FAILED (Blocked)"]
    H --> I{"Action Required"}
    
    I -- "1. Update Documentation" --> A
    I -- "2. Add '!dgignore' to PR" --> J["Re-Analysis (Score 0)"]
    J --> D
    
    I -- "3. Triage Inbox" --> L["Review in Inbox"]
    L -- "Accept Change" --> D
    L -- "Ignore Drift" --> D
    
    I -- "4. PR Owner Bypass" --> K["Force Merge (Admin)"]
    K --> M["Merged with Intentional Technical Debt"]
```

### User Actions & Overrides

When DocuGardener blocks a Pull Request (Critical Drift), users have 3 options:

1. **✅ Fix (The Golden Path)**
    - **Action**: Update the documentation in the code and push a new commit.
    - **Outcome**: DocuGardener re-scans, finds no drift (Score ~0), and marks the check as **Success**.

2. **🙈 Ignore (Explicit Bypass)**
    - **Action**: Add `!dgignore` to the PR description or comment.
    - **Outcome**: The bot acknowledges the tag and forces a **Success** status with a "Skipped" note. Useful for internal-only changes or rapid prototypes.

3. **📥 Triage (The Professional Path)**
    - **Action**: Visit the **Inbox** in the Dashboard.
    - **Outcome**: Review the semantic diff, provide a mandatory **Ignore Reason** for significant drift, then click **Accept Changes** (to ACK the drift) or **Ignore** (to skip for now). The PR status is automatically updated to **Success**.

4. **🚨 Force Merge (Admin Override)**
    - **Action**: Repository Admins can bypass the "Required Status Check" in GitHub UI.
    - **Outcome**: The PR is merged despite the red status. This registers as "Intentional Technical Debt" in the audit trail and is visible in **Ignore Analytics**.

## 💡 LLM Model & Pricing

DocuGardener has three ways to run the AI analysis engine. Understanding this upfront prevents surprises:

| Mode | Who pays for LLM? | Cost to you | Notes |
|---|---|---|---|
| **Platform LLM (default)** | DocuGardener | Free up to limits | Uses a bundled Gemini Flash key. FREE plan: 50 PR analyses / month, capped at $0.50 platform cost. |
| **BYOK — Cloud API** | You (your API key) | $0 to DocuGardener | Bring your own Gemini / OpenAI key in Settings. No platform cost cap, but your key is billed by the provider. |
| **BYOK — Local (Ollama)** | You (CPU/GPU) | $0 to anyone | Run any Ollama model locally. Set `LLM_PROVIDER=ollama` and `OLLAMA_URL` in your `.env`. |

### What changes with BYOK?

Core features work with all three modes — PR drift detection, GitHub check runs, inbox triage, auto-fix PRs, VS Code extension.

The following **additional DocuGardener services** require the platform LLM (they run server-side on our infrastructure and consume our API credits):

- **Hosted Nightly Rollup** — automated daily GitHub issue with drift summary (self-hosted instances can run their own scheduler)
- **Platform Analytics** — aggregate drift trends across your org (future)

BYOK users who self-host get full control of all features without restriction. The distinction only applies to the managed cloud offering.

### Setting up BYOK

In **Settings → Intelligence tab**:

1. Select your provider (Gemini, OpenAI, Ollama)
2. Enter your API key (stored encrypted with AES-256-GCM, never logged)
3. Optionally run **Test Connection** to validate before saving

For local Ollama, set in your server `.env`:
```bash
LLM_PROVIDER=ollama
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2
```

## 📦 Plans

| | Free | Pro | Team |
|---|:---:|:---:|:---:|
| Repositories | 1 public | 5 | Unlimited |
| PR analyses / month | 50 | 500 | Unlimited |
| Seat count | 1 | 10 | 100 |
| Private repos | — | ✅ | ✅ |
| 14-day PRO trial | ✅ (once) | — | — |
| Slack & Jira integrations | — | ✅ | ✅ |
| Ignore-rate analytics | — | ✅ | ✅ |
| Prompt engineering playground | — | ✅ (+ trial) | ✅ |
| Nightly rollup digest | — | ✅ | ✅ |
| Audit log | — | ✅ | ✅ |
| Evidence export (CSV/JSON) | — | — | ✅ |
| AUDITOR / BILLING_ADMIN roles | — | ✅ | ✅ |
| Holistic scoring model | — | ✅ | ✅ |
| BYOK (cloud or local) | ✅ | ✅ | ✅ |
| SSO / SAML 2.0 | — | — | ✅ |
| Session idle timeout | — | — | ✅ |
| On-premise Helm chart (K8s) | — | — | ✅ |
| Priority support | — | — | ✅ |

## 👥 Team Management & Multi-Tenancy

DocuGardener uses a **Tenant-based** architecture to support teams and organizations.

### Core Concepts

- **Tenant**: A secure workspace that holds your configuration, repositories, and job history. All data is isolated to the tenant.
- **User Association**: Users are linked to a single Tenant via their email address.

### Invitation Flow

1. **Admin Invite**: An existing Admin goes to the Dashboard and enters a colleague's email (e.g., `alice@example.com`).
2. **Pre-Provisioning**: The system creates a user record linked to your Tenant.
3. **Seamless Onboarding**: When `alice@example.com` logs in via GitHub (or other providers), she is automatically matched to your workspace.

### Strict Isolation Layer

- **`TenantContextMiddleware`**: Every API request is intercepted to establish a secure tenant context using `contextvars`.
- **Isolated Storage**: The Weaviate client is refactored to be context-aware, automatically scoping all searches and upserts to the current tenant's namespace.
- **Worker Safety**: Background jobs inherit and enforce the tenant context from the moment they are dequeued.

### Roles

| Role | Plan | Permissions |
| :--- | :--- | :--- |
| **ADMIN** | All | Full access — manages LLM keys, prompts, team members, billing, and all settings. |
| **AUDITOR** | Pro+ | Read-only access to the audit log, jobs, and reports. Cannot mutate data. |
| **BILLING_ADMIN** | Pro+ | Manages billing settings and views usage dashboards. No access to code-related features. |
| **VIEWER** | All | Read-only access to dashboards, inbox, and drift reports. |

> AUDITOR and BILLING_ADMIN roles are available on Pro and Team plans only.

## 🧠 Intelligence & Customization

DocuGardener adapts to your team's workflow and culture.

### 🎭 Tone Settings

Configure the personality of the AI verification agent:

- **Strict (Default)**: Best for high-compliance environments. Concise and factual.
- **Detailed**: Best for junior teams. Explains the "why" behind the code/doc mismatch.
- **Friendly**: Best for culture building. Uses encouraging language and emojis.

### 🙈 Ignore Patterns

Sometimes documentation isn't needed (e.g., legacy code, generated files).

- Add custom glob patterns (like `.gitignore`) in the Settings UI.
- Use the **Real-time Tester** to verify if a file matches your rules before saving.

### 🎮 Drift Simulator & Prompt Playground

DocuGardener provides a full suite of tools for "Red Teaming" your documentation:

- **Prompt Engineering Playground**: Override system prompts (e.g., `GENERATOR_SYSTEM_PROMPT`) per tenant to change the AI's "voice" or verification strictness.
- **Git Diff Simulator**: Paste raw Git Diffs to see how the bot would score them against your current rules and prompts.
- **Real-time Feedback**: Visualize the **Drift Score** and reasoning breakdown instantly.

## Configuration

See [.env.example](.env.example) for all configuration options.

Key settings (root `.env` — Python backend):

- `GITHUB_APP_ID`: Your GitHub App ID
- `GITHUB_PRIVATE_KEY_PATH`: Path to GitHub App private key
- `VECTOR_DB_PROVIDER`: `pinecone` or `weaviate`
- `LLM_PROVIDER`: `gemini` or `ollama`
- `GEMINI_API_KEY`: Google Gemini API key (BYOK)
- `BUNDLED_GEMINI_KEY`: Operator-level fallback key for zero-config first run (optional)
- `BUNDLED_GEMINI_MODEL`: Model used with the bundled key (default: `gemini-2.0-flash`)

Key settings (`web/.env` — Next.js frontend):

- `DATABASE_URL`: PostgreSQL connection string
- `NEXTAUTH_SECRET`: Random secret for session signing
- `GITHUB_ID` / `GITHUB_SECRET`: GitHub OAuth App credentials
- `BUNDLED_GEMINI_KEY`: Must match the root `.env` value — controls "Platform Default" card visibility in Settings

## License

DocuGardener is open source under the [GNU Affero General Public License v3.0 (AGPL-3.0)](LICENSE).

You are free to self-host, modify, and distribute the software. If you run a modified version as a network service, you must make the source available under the same license.

A managed SaaS offering is available at [docugardener.dev](https://docugardener.dev) — same code, zero ops.
