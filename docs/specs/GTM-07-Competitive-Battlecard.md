# DocuGardener — Competitive Battlecard

**Internal use only. Do not share with prospects.**
**Last updated:** 2026-03-10
**Source:** Owner Review Decision Record A-7 / IDEA-16

---

## One-Line Positioning

> DocuGardener is the only **CI-native documentation verification gate** that produces tamper-evident audit evidence without retaining any source code.

---

## Differentiator Summary Table

| Capability | DocuGardener | Swimm | Mintlify | Archbee / GitBook |
|---|:---:|:---:|:---:|:---:|
| Blocks merges on stale docs | ✅ | ❌ | ❌ | ❌ |
| Zero source code retention | ✅ | ❌ | ❌ | N/A |
| SHA-256 tamper-evident audit log | ✅ | ❌ | ❌ | ❌ |
| Local LLM (Ollama, air-gap) | ✅ | ❌ | ❌ | ❌ |
| BYOK (cloud API key) | ✅ | ❌ | ❌ | ❌ |
| SSO / SAML 2.0 | ✅ | ✅ | ✅ | ✅ |
| SCIM provisioning | ✅ | ❌ | Partial | Partial |
| Evidence export (CSV/JSON) | ✅ | ❌ | ❌ | ❌ |
| PR check run (GitHub native) | ✅ | ❌ | ❌ | ❌ |
| Auto-fix PR (AI author mode) | ✅ | ❌ | ❌ | ❌ |
| IDE pre-push check (VS Code) | ✅ | ✅ | ❌ | ❌ |
| Docs publishing / portal | ❌ | Partial | ✅ | ✅ |
| In-editor inline doc suggestions | ❌ | ✅ | ❌ | ❌ |

---

## Swimm

### What Swimm is

Swimm is an IDE-centric documentation coupling tool. It links documentation snippets directly to specific lines of code and warns developers when those lines change. It is primarily a developer-experience tool aimed at keeping internal knowledge docs (wikis, how-it-works docs) in sync with code — from the IDE, not from the CI gate.

### Where we win against Swimm

| Win | Explanation |
|---|---|
| **CI-native gate** | DocuGardener lives in the PR check run — it is enforced by the pipeline, not by developer discipline. Swimm can be ignored; DocuGardener blocks the merge. |
| **Zero-retention** | Swimm stores code snippets and coupling metadata on their servers. DocuGardener processes code in RAM and wipes it. For regulated industries (FinTech, MedTech, defense), this is a hard requirement. |
| **Tamper-evident audit log** | DocuGardener's SHA-256 hash chain produces a cryptographically verifiable evidence trail — every drift decision is attributed and timestamped. Swimm has no equivalent. |
| **Air-gap / local LLM** | DocuGardener runs entirely on-premise with Ollama — no external API calls, no code egress. Swimm requires cloud connectivity. |
| **Compliance evidence export** | DocuGardener exports the audit log as CSV/JSON for SOC2, ISO 27001, and custom audit workflows. Swimm has no evidence export. |
| **Auto-fix PR** | DocuGardener drafts the documentation update and opens a PR. Swimm flags the issue; the developer still has to write the fix. |

### Where Swimm is stronger

| Swimm strength | Our position |
|---|---|
| Deep code coupling (line-level sync) | DocuGardener works at the semantic / PR-diff level — no coupling to specific lines. This is a feature for us (less brittle to refactors), but Swimm's coupling can catch smaller incremental changes. |
| In-editor inline doc suggestions | Swimm integrates directly into VS Code and JetBrains to suggest doc updates as you type. DocuGardener's VS Code extension checks staged files pre-push — not the same. |
| Internal wiki / knowledge docs | Swimm is optimized for internal team knowledge bases. DocuGardener focuses on docs-as-code (API docs, READMEs, runbooks). |

### Objection handling

**"We already use Swimm."**
> DocuGardener and Swimm serve different purposes. Swimm helps developers write better docs in their IDE. DocuGardener enforces that those docs were actually updated before a PR merges — and produces the audit evidence to prove it. They are complementary: Swimm is the authoring layer, DocuGardener is the verification gate.

**"Swimm doesn't retain our code."**
> Swimm stores code coupling metadata — the specific code snippets linked to documentation — on their servers. DocuGardener processes the diff in RAM and immediately discards it. Nothing is persisted. For regulated industries this distinction matters at the DPA level.

---

## Mintlify

### What Mintlify is

Mintlify is a docs-site publishing platform. It generates beautiful, interactive developer portals from markdown and code comments. Its recent "Mintlify Writer" feature uses AI to generate doc drafts. Mintlify is primarily a docs portal and developer experience tool — it does not verify docs against code and does not produce compliance evidence.

### Where we win against Mintlify

| Win | Explanation |
|---|---|
| **Verification gate** | Mintlify publishes docs; DocuGardener verifies them. Mintlify has no mechanism to detect that published docs are out of date with code. DocuGardener blocks the merge when they diverge. |
| **Zero-retention** | Mintlify hosts your documentation. DocuGardener does not store anything — not code, not docs. |
| **Compliance evidence** | Mintlify has no audit log, no tamper-evident trail, no evidence export. DocuGardener's entire compliance story is absent in Mintlify. |
| **CI/CD pipeline integration** | Mintlify is a docs destination. DocuGardener is a CI gate. These are different integration points. |
| **Air-gap / local LLM** | Mintlify is cloud-hosted. DocuGardener can run fully on-premise. |

### Where Mintlify is stronger

| Mintlify strength | Our position |
|---|---|
| Docs-site aesthetics | Mintlify produces beautiful developer portals with search, versioning, and API playgrounds. DocuGardener has no docs publishing capability — we explicitly do not compete here. |
| AI doc generation | Mintlify Writer generates doc drafts from code. DocuGardener's auto-fix PR is similar but operates at the PR level on detected drift, not as a general generation tool. |

### Objection handling

**"We use Mintlify for our docs."**
> DocuGardener verifies that your code changes are reflected in your documentation before merging — wherever that documentation lives. If it lives in Mintlify, we still verify it. The two are complementary. You use Mintlify to publish; you use DocuGardener to make sure what you publish stays accurate.

**"Mintlify has AI doc generation."**
> Mintlify generates doc drafts. DocuGardener detects when code changed but docs didn't, then drafts the specific update needed and opens a PR. DocuGardener's AI is verification-first: it compares code against existing docs and identifies the drift, rather than generating docs from scratch.

---

## Archbee / GitBook

### What they are

Archbee and GitBook are team documentation portals — collaborative wikis designed for internal and external documentation. They provide beautiful interfaces, version control, and team collaboration on documentation content. They are not CI-native verification tools and have no compliance evidence capabilities.

### Competitive position: Non-competing

**DocuGardener does not compete with Archbee or GitBook on their core value proposition.** We are not a docs portal, wiki, or publishing platform. The correct framing in any conversation where these tools come up:

> DocuGardener and GitBook/Archbee are complementary. Your team can write and publish documentation in GitBook. DocuGardener's job is to make sure that documentation never gets stale — by verifying every PR against it before it merges.

### Where we add value on top of Archbee / GitBook

| Value add | Explanation |
|---|---|
| Drift gate | GitBook/Archbee have no mechanism to detect that docs in their portal are out of date with code changes in GitHub PRs. DocuGardener fills that gap. |
| Audit trail | Neither tool produces cryptographic evidence of documentation governance decisions. |
| Compliance workflow | Neither tool is designed for SOC2, ISO 27001, or regulated-industry audit workflows. |

---

## One-Page Differentiator Sheet (use in demos)

**The three questions that win deals:**

1. **"What happens when a developer merges a PR without updating docs?"**
   - Swimm: They get a warning in their IDE if they remember to open it.
   - Mintlify / GitBook: Nothing. The portal gets out of date.
   - **DocuGardener: The PR is blocked. They cannot merge without a decision.**

2. **"Can you prove to an auditor that every API change this quarter had a documented review?"**
   - Swimm: No.
   - Mintlify / GitBook: No.
   - **DocuGardener: Yes. Export the SHA-256 hash-chained audit log as CSV. Every drift decision, with actor, timestamp, and justification.**

3. **"Does your tool send our source code to a third-party server?"**
   - Swimm: Yes (coupling metadata stored in cloud).
   - Mintlify: Yes (docs hosted in cloud).
   - **DocuGardener: No. Code is analyzed in RAM and wiped. Nothing is persisted. Run fully on-premise with Ollama.**

---

*Maintained by: GTM / Product Owner*
*Review cycle: Before each major release and before first enterprise outreach*
