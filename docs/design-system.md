# DocuGardener Design System

> Canonical reference for contributors. Full interactive docs and live examples at [`/docs/developer/design-system`](https://docugardener.dev/docs/developer/design-system).

---

## Primitives

Use these. Nothing else.

| Primitive | File | Replaces |
|---|---|---|
| `StatusChip` | `web/components/ui/status-chip.tsx` | Raw `Badge` with colour classes, `border-l-8` status rails |
| `DataTable` | `web/components/ui/data-table.tsx` | Raw `<table>` in dashboard pages |
| `PageHeader` | `web/components/layout/PageHeader.tsx` | Custom per-page header markup |
| `Card` (shadcn) | `web/components/ui/card.tsx` | Custom card divs with inline padding/shadow |

---

## CSS Tokens

Defined in `web/app/globals.css`. Never use raw hex values, hardcoded radii, or inline shadow utilities.

**Surface tokens**

| Token | Use |
|---|---|
| `--background` | Page / shell background |
| `--foreground` | Primary text |
| `--card` | Card surface |
| `--border` | Card and input borders |
| `--primary` | Brand accent — buttons, links, active states |
| `--muted` | Subdued surface (card headers, sidebars) |
| `--muted-foreground` | Secondary / helper text |

**Status palette tokens** (StatusChip tints — do not use directly in components)

| Token | Semantic meaning |
|---|---|
| `--status-fresh` | Healthy / live / connected |
| `--status-withered` | Degraded / warning / BYOK |
| `--status-broken` | Error / critical / failed |

**Layout & elevation classes**

| Class | Value | Use |
|---|---|---|
| `.rounded-card` | `0.75rem` | All Card components |
| `.shadow-card` | Subtle ring + drop-shadow | Default card elevation |
| `.shadow-card-hover` | Elevated on hover | Interactive cards |
| `.app-container` | `max-w-7xl` + responsive padding | Page content wrapper |

---

## Non-Negotiable Rules

1. **No `border-l-8`** — use `StatusChip` in card headers instead.
2. **No raw `<table>` in dashboard pages** — use `DataTable`.
3. **No inline shadow utilities** — use `.shadow-card` / `.shadow-card-hover`.
4. **No hardcoded hex or rgb values** — use CSS custom property tokens.
5. **No custom page headers** — use `PageHeader`.

PRs that violate these rules will be asked to revise before review.

---

## StatusChip

```tsx
import { StatusChip } from "@/components/ui/status-chip"

// In a CardHeader:
<StatusChip variant="primary" label="REPOSITORIES" className="mb-2" />
```

| Variant | When to use |
|---|---|
| `primary` | Main section label, active feature indicator |
| `fresh` | Healthy / live / connected |
| `withered` | Degraded / warning / BYOK |
| `broken` | Error / critical / failed |
| `neutral` | Informational / passive label |

---

## DataTable

```tsx
import {
  DataTable, DataTableHeader, DataTableBody,
  DataTableRow, DataTableHead, DataTableCell,
} from "@/components/ui/data-table"

<DataTable>
  <DataTableHeader>
    <DataTableRow>
      <DataTableHead>Name</DataTableHead>
      <DataTableHead>Status</DataTableHead>
    </DataTableRow>
  </DataTableHeader>
  <DataTableBody>
    {rows.map((row) => (
      <DataTableRow key={row.id}>
        <DataTableCell>{row.name}</DataTableCell>
        <DataTableCell>{row.status}</DataTableCell>
      </DataTableRow>
    ))}
  </DataTableBody>
</DataTable>
```

Dense defaults: `px-3 py-2` heads, `px-3 py-2.5` cells. Pass explicit `className` to override via tailwind-merge.

---

## Pre-PR Checks

Before opening any PR that touches `web/`:

```bash
# 1. No border-l-8 in source
grep -r "border-l-8" web/components web/app --include="*.tsx" | grep -v node_modules | grep -v __tests__
# → must return nothing

# 2. TypeScript clean
cd web && npx tsc --noEmit

# 3. Tests green
cd web && npx vitest run
```
