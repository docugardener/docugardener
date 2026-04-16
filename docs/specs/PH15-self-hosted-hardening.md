# Phase 15 — Self-Hosted Hardening & Settings Readiness

**Created:** 2026-04-16  
**Status:** Planned — next sprint  
**Trigger:** Post-launch audit of self-hosted UX, platform LLM cost exposure, Settings feature readiness, and README accuracy.  
**Source:** 2026-04-16 SA audit + product review session.

---

## Context

DocuGardener went live on 2026-04-15. The first public-readiness audit (B1–B5) is complete. This sprint addresses the next layer: product claims accuracy, cost protection, and Settings features that are real but need validation or framing adjustments before being presented as production-ready.

---

## PH15-01 — Platform LLM: Hard Cap for All Plans

**Priority:** P0 | **Effort:** S | **Type:** Backend code + README

### Problem

The bundled Gemini key (`BUNDLED_GEMINI_KEY`) is the operator's cost. Currently only FREE tenants have a hard cap ($0.50/month). PRO and TEAM tenants using platform LLM have no cost ceiling — a single runaway tenant could exhaust the platform budget.

### Decision

A single **€10/month hard cap across all plans** for platform LLM usage. This is an operator-level backstop, not a per-user entitlement:

- **~8,000 PRs/month** at Gemini Flash 2.0 rates (€0.075/M input + €0.30/M output, ~1,500 tokens per PR analysis)
- For 20–50 users at launch: ~160–400 PRs/month — the cap provides **20–50× headroom** before hitting the ceiling
- Once the cap is reached platform-wide (not per-tenant), new analyses fall back to BYOK with a clear message
- Self-hosters: the cap only applies when `BUNDLED_GEMINI_KEY` is set; operators who don't set it see no change

### Implementation

**`src/core/config.py`**
```python
# Platform LLM cost protection — applies to all plans when operator sets BUNDLED_GEMINI_KEY
platform_llm_monthly_cap_eur: float = Field(default=10.0)
```

**`src/api/webhooks.py`** — replace the current FREE-only block (`lines ~505–543`):
```python
# Platform LLM hard cap — all plans, operator-configurable
_platform_cap = settings.platform_llm_monthly_cap_eur
_using_platform_llm = not _llm_cfg.get("apiKey") and not _llm_cfg.get("baseUrl")
if _using_platform_llm and _platform_cap > 0:
    # Sum platform spend across ALL tenants this calendar month
    _month_start_cap = datetime.now(UTC).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    _platform_spend_total = (
        _db_budget.query(func.sum(_BudgetJob.result["llm_usage"]["estimated_cost_usd"].as_float()))
        .filter(
            _BudgetJob.status == "COMPLETED",
            _BudgetJob.createdAt >= _month_start_cap,
            # Only jobs that used platform LLM (no tenant apiKey/baseUrl configured at time of run)
            _BudgetJob.usedPlatformLlm == True,
        )
        .scalar() or 0.0
    )
    _eur_spend = _platform_spend_total * 1.08  # approximate USD→EUR (or use a configurable rate)
    if _eur_spend >= _platform_cap:
        return {
            "status": "skipped",
            "reason": (
                f"Platform LLM monthly budget exhausted (€{_eur_spend:.2f} / €{_platform_cap:.2f}). "
                f"Add your own LLM API key in Settings → AI Configuration to continue."
            ),
        }
```

> **Note:** Summing across all tenants (not per-tenant) is the right model — this is an operator cost cap, not a per-user entitlement. Individual per-tenant budgets remain the existing per-tenant `monthlyBudgetUsd` feature.

**DB schema addition** — track whether each job used the platform key:  
`BudgetJob.usedPlatformLlm: Boolean` (Prisma + Alembic migration)

**`.env.example` addition:**
```
# Platform LLM monthly cost ceiling — all tenants combined (EUR).
# Applies only when BUNDLED_GEMINI_KEY is set. 0 = no cap.
PLATFORM_LLM_MONTHLY_CAP_EUR=10.0
```

### README claim (honest + marketable)
```markdown
**Platform LLM** is available on all plans with a shared €10/month operator budget 
(~8,000 PR analyses). Once the monthly budget is reached, new analyses prompt users 
to configure their own API key. Self-hosters control this limit via 
`PLATFORM_LLM_MONTHLY_CAP_EUR` in their `.env`.
```

### Acceptance criteria
- [ ] `PLATFORM_LLM_MONTHLY_CAP_EUR=10.0` is the default; `0` disables the cap
- [ ] When platform spend ≥ cap, new webhook events return `skipped` with user-facing message
- [ ] `BudgetJob.usedPlatformLlm` is stamped `true` when bundled key was used, `false` for BYOK
- [ ] Per-tenant `monthlyBudgetUsd` still works independently (existing feature, not replaced)
- [ ] Unit tests: cap reached → skip; cap not reached → proceed; BYOK tenant → not counted against cap; `cap=0` → no enforcement
- [ ] README updated with accurate claim
- [ ] `PLATFORM_LLM_MONTHLY_CAP_EUR` in `.env.example` and developer docs environment page

---

## PH15-02 — README Self-Hosted Plan Framing

**Priority:** P0 | **Effort:** XS | **Type:** Docs only

### Problem

The Plans table reads as DocuGardener-imposed limits. Self-hosters who see "50 PR analyses/month" on FREE may think they need to pay DocuGardener to unlock more — when in fact they own the infrastructure and can change the plan in Settings or the DB instantly.

### Changes

1. **Below the plans table** — add a self-hosted callout:
```markdown
> **Self-hosted operators:** Plan limits are configurable defaults, not hard walls.
> Change a tenant's plan in **Settings → Billing** (owner console) or directly:
> `UPDATE "Tenant" SET plan = 'TEAM' WHERE id = '<tenant-id>';`
> The limits exist to help you manage your own LLM costs — see Platform LLM above.
```

2. **Plans table footnote** — rename "PR analyses / month" to "PR analyses / month ¹" and add:
> ¹ Platform LLM analyses using the bundled key. BYOK tenants are limited by their own API quota and the optional per-tenant budget in Settings.

3. **Helm section** — update from overclaim to accurate:
```markdown
The Helm chart (`helm/docugardener/`) ships with PSA-restricted manifests,
NetworkPolicies, and air-gap mode. CI-validated via kind cluster. OCI registry
publishing (`oci://ghcr.io/docugardener/helm/docugardener`) and first enterprise
K8s validation are planned for Q2 2026.
```

### Acceptance criteria
- [ ] Self-hosted plan framing callout added below Plans table
- [ ] Table footnote distinguishes platform LLM vs BYOK limits
- [ ] Helm claim updated to match actual tested state
- [ ] No other overclaims in README (full re-read)

---

## PH15-03 — SAML/SSO: Production Validation + Early Access Gate

**Priority:** P1 | **Effort:** M | **Type:** Test + UI

### Context

SAML/SSO was implemented and unit-tested. A local sandbox test with a free Okta developer account succeeded — the SP metadata import, login initiation, SAML assertion, JIT user provisioning, and role mapping all worked. However:

- The sandbox test was on a local non-TLS environment (Okta allows HTTP for dev orgs)
- Production requires HTTPS + valid SP metadata URL — never tested against `docugardener.dev`
- Entra ID (Microsoft) uses different NameID formats and attribute schemas — untested
- Google Workspace SSO has its own quirks — untested
- SCIM provisioning (Okta → DG user lifecycle) has never been tested end-to-end against a live IdP

**Current confidence: 75%.** Target before removing Early Access gate: 90%.

### Validation plan

**Stage 1 — Okta production smoke test (against docugardener.dev)**

| Step | Detail |
|------|--------|
| Create Okta dev org (free) | Use `dev-XXXXXXX.okta.com` |
| Add DG as SAML 2.0 app in Okta | Import SP metadata from `https://docugardener.dev/api/saml/metadata` |
| Configure attribute mapping in Okta | `email` → `email`, `role` → `role` (or static `VIEWER`) |
| Test SSO login flow end-to-end | Button → Okta redirect → assertion → DG session |
| Test JIT provisioning | First-time login creates user with correct tenantId + role |
| Test session timeout | Set `sessionIdleTimeoutMinutes=5`, idle, verify redirect to login |
| Test SP-initiated logout | DG logout → Okta session terminated |

**Stage 2 — SCIM provisioning smoke test**

| Step | Detail |
|------|--------|
| Enable SCIM in Okta → DG | Configure Bearer token from SCIM settings page |
| Assign user in Okta | Verify user appears in DG with `VIEWER` role |
| Update user email in Okta | Verify DG user email updated |
| Deactivate user in Okta | Verify DG user `scimActive=false`, session rejected |
| Reassign user in Okta | Verify DG user reactivated |

**Stage 3 — Entra ID (stretch)**

Microsoft Entra uses `persistent` NameID format by default. Verify DG's SAML handler accepts it (currently expects `emailAddress` format in `src/api/saml.py`). Add NameID format fallback if needed.

**Stage 4 — E2E Playwright test**

New spec: `web/e2e/tests/auth/sso-saml.spec.ts`

```typescript
// SPEC-SSO-01: SAML callback with valid assertion → authenticated session
// SPEC-SSO-02: SAML callback with expired assertion → rejected
// SPEC-SSO-03: SCIM user deactivation → session rejected on next token refresh
```
Use mocked SAML assertions (no real Okta required in CI) — verify the NextAuth + DG exchange token flow.

**UI gate — Early Access banner (add now, remove after Stage 2 complete):**

In `web/components/settings/SsoConfigForm.tsx`, above the form:
```tsx
<Alert variant="info">
  <InfoIcon className="h-4 w-4" />
  <AlertDescription>
    SSO/SAML is in <strong>Early Access</strong>. The configuration below works with 
    Okta and standard SAML 2.0 IdPs. For assisted setup or to report issues, 
    contact <a href="mailto:support@docugardener.dev">support@docugardener.dev</a>.
  </AlertDescription>
</Alert>
```

Same banner for SCIM section.

### Acceptance criteria
- [ ] Stage 1: Full Okta SSO flow verified against `docugardener.dev` (human-tested)
- [ ] Stage 2: Full SCIM lifecycle verified against live Okta (human-tested)
- [ ] Stage 3: Entra ID NameID format confirmed compatible or fixed
- [ ] SPEC-SSO-01/02/03 Playwright specs passing
- [ ] Early Access banner in place until Stage 2 passes
- [ ] Docs page `web/app/docs/self-hosting/sso/page.tsx` updated with step-by-step Okta + Entra guides

---

## PH15-04 — Agent Governance: Honest Framing in UI

**Priority:** P1 | **Effort:** XS | **Type:** UI copy only

### Problem

The Agent Governance panel presents rule generation as a governance solution. It is — but the generated files are advisory (AGENTS.md, CLAUDE.md). DocuGardener does not currently enforce that AI agents follow the rules or fail PR checks when rules are violated. Presenting this as "governance" without the caveat is misleading.

### Change

In `web/components/settings/AgentRulesPanel.tsx`, add an info row at the top of the panel:

```tsx
<div className="flex items-start gap-2 rounded-md bg-muted/50 border p-3 text-sm text-muted-foreground mb-4">
  <InfoIcon className="h-4 w-4 mt-0.5 shrink-0" />
  <span>
    Rules are compiled into standard agent instruction files (AGENTS.md, CLAUDE.md, 
    .cursor/rules) and committed to your repo via PR. Enforcement relies on your 
    agents reading these files — DocuGardener does not block PRs that violate them.{" "}
    <a href="/docs/user-guide/agent-governance" className="underline">Learn more →</a>
  </span>
</div>
```

### Acceptance criteria
- [ ] Info banner visible on Agent Governance tab for all plan levels
- [ ] Banner links to docs page explaining the advisory model
- [ ] No other UI copy claims enforcement that doesn't exist

---

## PH15-05 — Helm: OCI Publish + k3s Validation Spike

**Priority:** P2 | **Effort:** S | **Type:** Ops + docs

### Problem

README claims the chart "is published to `oci://ghcr.io/docugardener/helm/docugardener`". The `helm-publish.yml` workflow exists but the publish step (`workflow_dispatch` with `publish=true`) has never been manually triggered. The chart has never been deployed to a real K8s cluster with PSA enforcement.

### Steps

1. Trigger `helm-publish.yml` via `workflow_dispatch` with `publish=true`
2. Verify `helm pull oci://ghcr.io/docugardener/helm/docugardener --version 0.1.0` succeeds from a clean machine
3. Deploy to a local k3s cluster with PSA `restricted` namespace label:
   ```bash
   kubectl create namespace docugardener
   kubectl label namespace docugardener pod-security.kubernetes.io/enforce=restricted
   helm install docugardener oci://ghcr.io/docugardener/helm/docugardener -n docugardener -f helm/docugardener/values.yaml
   ```
4. Verify all pods reach `Running` state with no PSA admission violations
5. Verify NetworkPolicies block unexpected egress (test: `exec` into worker pod, `curl google.com` should fail)
6. Update `helm/README.md` with verified install command + version
7. Update README.md Helm claim to confirmed (remove "planned for Q2 2026" note from PH15-02)

### Acceptance criteria
- [ ] `helm pull oci://ghcr.io/docugardener/helm/docugardener` works
- [ ] Chart installs on k3s with PSA `restricted` without errors
- [ ] Worker pod cannot reach arbitrary internet destinations (NetworkPolicy tested)
- [ ] README Helm claim updated to accurate/verified state

---

## PH15-06 — Integrations: Surface Non-Fatal Failures to User

**Priority:** P2 | **Effort:** S | **Type:** Backend + UI

### Problem

Integration dispatch failures (Slack webhook unreachable, Jira auth expired, Linear API error) are currently caught and logged silently. Users have no idea their notifications stopped working. The only way to discover a broken integration is to notice missing Slack alerts days later.

### Implementation

1. **Backend** — `src/notifications/dispatcher.py`: store last dispatch result per integration:
   ```python
   # After each dispatch attempt, update tenant.integrationStatus in DB
   # { "slack": {"status": "ok"|"error", "lastError": "...", "lastAttemptAt": "..."} }
   ```

2. **Frontend** — `web/components/settings/IntegrationsForm.tsx`: the status dot already exists (from `GET /api/settings/integrations/status`). Extend with:
   - Amber dot + "Last attempt failed" tooltip if `status=error`
   - Timestamp of last successful dispatch
   - "Last error" expandable row (truncated message)

3. **Alert threshold**: Only update `integrationStatus` on actual dispatch attempts during analysis — not on "Send test" button clicks (those already show inline feedback).

### Acceptance criteria
- [ ] `Tenant.workflowConfig.integrationStatus` updated after each dispatch attempt
- [ ] Settings UI shows amber dot + error message for failed integrations
- [ ] Last successful dispatch timestamp shown per integration
- [ ] No change to existing test button behavior

---

## Sprint Summary

| ID | Item | Priority | Effort | Type | Gate |
|----|------|----------|--------|------|------|
| PH15-01 | Platform LLM €10 hard cap (all plans) | P0 | S | Code + README | Before any growth push |
| PH15-02 | README self-hosted framing + Helm claim fix | P0 | XS | Docs | Before any growth push |
| PH15-03 | SAML/SSO: Okta prod validation + Early Access banner | P1 | M | Test + UI | Before TEAM plan marketing |
| PH15-04 | Agent Governance: advisory framing in UI | P1 | XS | UI copy | This week |
| PH15-05 | Helm: OCI publish trigger + k3s spike | P2 | S | Ops | Before enterprise outreach |
| PH15-06 | Integrations: surface non-fatal failures | P2 | S | Code + UI | Before integration marketing |

**Estimated total:** ~1 week (P0s in 1 day, P1s in 2–3 days, P2s in parallel or next sprint).

---

## Revision History

| Date | Change |
|------|--------|
| 2026-04-16 | Initial spec — from SA/PO audit session. Bundled LLM cap: €10 operator-wide (single cap, all plans); ~8k PRs / 20–50 users. SAML: previously tested locally with Okta dev account (succeeded); needs prod validation. |
