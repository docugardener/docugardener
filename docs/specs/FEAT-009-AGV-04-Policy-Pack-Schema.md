# AGV-04 — Policy Pack Schema Design

Date: 2026-03-14
Status: Design document (no implementation)
Dependency: RULES-01 + AGV-01 + AGV-02 (all complete)

---

## 1. Purpose

This document defines the data model, inheritance algorithm, and API contract for **Policy Packs** — the mechanism that will allow org-level documentation policies to be compiled into per-repo, per-vendor agent instruction files.

Currently (RULES-01 / AGV-01 / AGV-02), policy rules are defined per-repo via `docugardener.yml`. Policy Packs add a centralized layer on top: define once at org level, inherit and override at repo level.

**This is a design artifact.** Implementation is post-production (AGV-05, gated on >=50 tenants).

---

## 2. Inheritance Model

```
Org PolicyPack (base)
  └── Team Override (optional, per team/group)
       └── Repo Override (per repository)
            └── Effective Policy (computed at compile time)
```

### Resolution Rules

1. **Org rules** apply to all repos by default
2. **Team overrides** can ADD rules, MODIFY enforcement level, or REMOVE rules (set `disabled: true`)
3. **Repo overrides** follow same semantics as team overrides
4. **Higher level wins on locks** — if org admin marks a rule as `locked: true`, team/repo cannot override it
5. **Conflict resolution** — if multiple team packs match a repo, most specific wins (explicit assignment > wildcard)
6. **Empty override** — a repo with no overrides inherits the full org + team effective policy

### Example

```
Org Pack: "default"
  - api-docs-required (blocking)       [locked]
  - changelog-update (advisory)

Team Pack: "platform-team"
  - changelog-update (blocking)        # escalated from advisory
  - infra-runbook (advisory)           # added

Repo Override: "billing-service"
  - api-docs-required: cannot override  # locked at org level
  - changelog-update: blocking          # inherited from team
  - compliance-docs (blocking-with-reason)  # added at repo level
```

---

## 3. Prisma Schema (Draft)

```prisma
model PolicyPack {
  id          String              @id @default(cuid())
  tenantId    String
  tenant      Tenant              @relation(fields: [tenantId], references: [id])
  name        String              // e.g. "default", "platform-team", "high-risk"
  description String?
  level       PolicyPackLevel     // ORG | TEAM | REPO
  isDefault   Boolean             @default(false)  // exactly 1 per tenant at ORG level
  createdAt   DateTime            @default(now())
  updatedAt   DateTime            @updatedAt
  rules       PolicyPackRule[]
  assignments PolicyPackAssignment[]
  @@unique([tenantId, name])
  @@index([tenantId, level])
}

enum PolicyPackLevel {
  ORG
  TEAM
  REPO
}

model PolicyPackRule {
  id            String      @id @default(cuid())
  packId        String
  pack          PolicyPack  @relation(fields: [packId], references: [id], onDelete: Cascade)
  name          String      // rule name, e.g. "api-docs-required"
  paths         String[]    // glob patterns
  requireDocs   String[]    // documentation targets
  enforcement   String      // "advisory" | "blocking" | "blocking-with-reason"
  locked        Boolean     @default(false)  // only ORG level can set this
  disabled      Boolean     @default(false)  // overrides can disable inherited rules
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt
  @@unique([packId, name])
}

model PolicyPackAssignment {
  id            String      @id @default(cuid())
  packId        String
  pack          PolicyPack  @relation(fields: [packId], references: [id], onDelete: Cascade)
  targetType    AssignmentTarget  // TEAM | REPO
  targetId      String            // team ID or repository ID
  priority      Int         @default(0)  // higher = takes precedence when multiple packs match
  createdAt     DateTime    @default(now())
  @@unique([packId, targetId])
  @@index([targetType, targetId])
}

enum AssignmentTarget {
  TEAM
  REPO
}
```

### SQLAlchemy Mirror (Backend)

The backend reads via SQLAlchemy ORM. Mirror models will be added to `src/storage/sql_models.py` following the same pattern as `RulesArtifact`.

---

## 4. Effective Policy Algorithm

```python
def compute_effective_policy(tenant_id: str, repo_id: str) -> list[EffectiveRule]:
    """
    Resolve the effective policy for a repo by layering org → team → repo packs.

    Steps:
    1. Load org-level default pack (isDefault=True, level=ORG)
    2. Load team-level packs assigned to this repo's team (if any)
    3. Load repo-level packs assigned directly to this repo
    4. Merge rules using name as key:
       a. Start with org rules
       b. For each team rule: add/replace unless org rule is locked
       c. For each repo rule: add/replace unless org/team rule is locked
       d. Remove rules marked disabled=True
    5. Return final list of EffectiveRule objects
    """

    # Phase 1: Load all relevant packs
    org_pack = get_default_org_pack(tenant_id)
    team_packs = get_team_packs_for_repo(tenant_id, repo_id)  # sorted by priority desc
    repo_packs = get_repo_packs(tenant_id, repo_id)           # sorted by priority desc

    # Phase 2: Merge
    rules: dict[str, EffectiveRule] = {}
    locked: set[str] = set()

    # Layer 1: Org
    for rule in org_pack.rules:
        rules[rule.name] = EffectiveRule.from_pack_rule(rule, source="org")
        if rule.locked:
            locked.add(rule.name)

    # Layer 2: Team (skip locked rules)
    for pack in team_packs:
        for rule in pack.rules:
            if rule.name in locked:
                continue  # org locked this rule
            if rule.disabled:
                rules.pop(rule.name, None)
            else:
                rules[rule.name] = EffectiveRule.from_pack_rule(rule, source=f"team:{pack.name}")

    # Layer 3: Repo (skip locked rules)
    for pack in repo_packs:
        for rule in pack.rules:
            if rule.name in locked:
                continue
            if rule.disabled:
                rules.pop(rule.name, None)
            else:
                rules[rule.name] = EffectiveRule.from_pack_rule(rule, source=f"repo:{pack.name}")

    return list(rules.values())
```

### Performance Considerations

- **Cache key:** `(tenant_id, repo_id, pack_versions_hash)`
- **Invalidation:** on any PolicyPack or PolicyPackRule write, increment a per-tenant version counter
- **Staleness cron:** evaluates 200 repos × 4 formats = 800 effective policy lookups per tenant per day
- **Target:** <50ms per effective policy computation (with cache: <1ms)
- **Implementation:** Python `functools.lru_cache` or Valkey hash for cross-worker sharing

---

## 5. API Contract (Draft)

### Policy Packs CRUD

```
GET    /api/policy-packs                      → list all packs for tenant
POST   /api/policy-packs                      → create new pack
GET    /api/policy-packs/{id}                 → get pack with rules
PATCH  /api/policy-packs/{id}                 → update pack metadata
DELETE /api/policy-packs/{id}                 → delete pack (cascade rules + assignments)

POST   /api/policy-packs/{id}/rules           → add rule to pack
PATCH  /api/policy-packs/{id}/rules/{rule_id} → update rule
DELETE /api/policy-packs/{id}/rules/{rule_id} → remove rule

POST   /api/policy-packs/{id}/assign          → assign pack to team/repo
DELETE /api/policy-packs/{id}/assign/{target_id} → unassign
```

### Effective Policy Preview

```
GET    /api/repos/{repo_id}/effective-policy   → computed effective rules for repo
       Response: { rules: EffectiveRule[], sources: { [ruleName]: "org" | "team:name" | "repo:name" } }
```

### Compile with Policy Packs

The existing `/api/repos/{repo_id}/rules/preview` and `/generate` endpoints will be updated to:
1. First call `compute_effective_policy()` instead of reading `docugardener.yml` directly
2. Fall back to `docugardener.yml` if no policy packs exist (backward compatible)

---

## 6. Plan Gating

| Capability | FREE | PRO | TEAM | ENTERPRISE |
|---|---|---|---|---|
| Per-repo `docugardener.yml` (current) | 1 repo | All repos | All repos | All repos |
| Org-level policy packs | — | — | Yes | Yes |
| Team-level overrides | — | — | Yes | Yes |
| Repo-level overrides | — | — | Yes | Yes |
| Locked rules | — | — | — | Yes |
| Effective-policy preview | — | — | Yes | Yes |

---

## 7. Migration Path

1. Existing `docugardener.yml` per-repo configs continue to work unchanged
2. When a tenant creates their first Policy Pack, it becomes the primary source
3. Per-repo `docugardener.yml` rules are imported as a REPO-level pack on first Policy Pack creation
4. No breaking changes — gradual adoption

---

## 8. Open Questions (for implementation phase)

1. **Team abstraction:** Do we need a `Team` model or can we reuse repo tags/labels?
2. **UI:** Dedicated Policy Packs settings page or embedded in current Agent Governance tab?
3. **Audit:** Should every pack rule change create an audit log entry?  (Recommended: yes, at TEAM+ tier)
4. **Effective-policy diff:** Show "what changed" when a pack is modified before applying?

---

## 9. Dependencies

| Requires | Status | Notes |
|---|---|---|
| RULES-01 Agent Rules Compiler | ✅ Complete | Existing compile pipeline |
| AGV-01 Cursor adapter | ✅ Complete | 3rd format |
| AGV-02 CLAUDE.md adapter | ✅ Complete | 4th format |
| DOCPOL-01 Policy Parser | ✅ Complete | `parse_policies()` reads rules |
| Prisma migrations | Ready | Schema above needs migration |
| ≥50 paying tenants | Gate | Implementation starts post-prod |
