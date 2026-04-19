#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * FEAT-020 Stories 4 + 5 — complete migration script.
 *
 * Applies all changes described in the spec:
 *   Story 4: Remove border-l-8 / border-l-<color>, insert <StatusChip> chips
 *   Story 5: Replace Table primitives with DataTable, update imports
 *
 * Run from repo root:
 *   node web/scripts/feat-020-apply.mjs [--dry-run]
 *
 * Flags:
 *   --dry-run   Print diff without writing files
 */

import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const WEB = path.resolve(__dirname, "..")
const DRY_RUN = process.argv.includes("--dry-run")

// ─── I/O ────────────────────────────────────────────────────────────────────

function read(p) {
  return fs.readFileSync(p, "utf8")
}

function commit(p, content, original) {
  if (content === original) {
    console.log(`  [=] ${path.relative(WEB, p)}`)
    return
  }
  if (DRY_RUN) {
    console.log(`  [dry] Would write ${path.relative(WEB, p)}`)
    return
  }
  fs.writeFileSync(p, content, "utf8")
  console.log(`  [✓] ${path.relative(WEB, p)}`)
}

function exists(p) {
  return fs.existsSync(p)
}

function abs(...parts) {
  return path.join(WEB, ...parts)
}

// ─── Import insertion ───────────────────────────────────────────────────────

function addImport(src, importLine) {
  if (src.includes(importLine)) return src
  // Find last "import" line and insert after it
  const lines = src.split("\n")
  let lastIdx = -1
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*import\s/.test(lines[i])) lastIdx = i
  }
  if (lastIdx === -1) return importLine + "\n" + src
  lines.splice(lastIdx + 1, 0, importLine)
  return lines.join("\n")
}

function ensureStatusChipImport(src) {
  if (src.includes("@/components/ui/status-chip")) return src
  return addImport(src, `import { StatusChip } from "@/components/ui/status-chip"`)
}

function ensureDataTableImport(src) {
  const imp = `import { DataTable, DataTableHeader, DataTableBody, DataTableRow, DataTableHead, DataTableCell } from "@/components/ui/data-table"`
  if (src.includes("@/components/ui/data-table")) return src
  return addImport(src, imp)
}

// ─── border-l-8 removal ─────────────────────────────────────────────────────
//
// Handles all orderings. Works on both " and ` delimited className values.

function removeBorderL(src) {
  // Remove paired "border-l-8 border-l-<x>" or "border-l-<x> border-l-8"
  src = src.replace(/\bborder-l-8\s+border-l-[\w-]+/g, "")
  src = src.replace(/\bborder-l-[\w-]+\s+border-l-8\b/g, "")
  // Remove standalone border-l-8
  src = src.replace(/\bborder-l-8\b/g, "")
  // Remove border-l-<dynamic> (e.g. ${meta.borderClass})
  src = src.replace(/\s*\$\{[^}]*borderClass[^}]*\}/g, "")
  src = src.replace(/\bmeta\.borderClass\b/g, "")
  // Collapse double spaces inside class strings
  src = src.replace(/(className=["'`][^"'`]*?)  +([^"'`]*?["'`])/g, "$1 $2")
  return src
}

// ─── StatusChip insertion ────────────────────────────────────────────────────
//
// Strategy: find the line(s) matching `titleRegex` and insert chipJsx
// as the PREVIOUS sibling of the first element containing that title text.
// We look for <CardHeader>, <CardTitle>, or heading elements.

function esc(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Insert `chipJsx` as first child of the CardHeader that contains `titleText`.
 *
 * Tries three strategies:
 *  A) <CardHeader>\n  <chipJsx>\n  <CardTitle>titleText</CardTitle>
 *  B) Insert chip line before <CardTitle>titleText line
 *  C) Insert chip line before <h3/h4>titleText line
 */
function insertChip(src, titleText, chipJsx) {
  const titlePattern = esc(titleText)

  // Strategy A: find CardHeader block containing the title, insert as first child
  // This regex finds the opening <CardHeader> tag that precedes the title text.
  // We use a non-greedy match that won't cross another CardHeader.
  const stratA = new RegExp(
    `(<CardHeader(?:\\s[^>]*)?>)(\\r?\\n)([ \\t]*)`,
    "g"
  )

  // We need to find specifically the CardHeader that contains our title.
  // Approach: split on <CardHeader, process each segment.
  if (src.includes("<CardHeader") && src.includes(titleText)) {
    const parts = src.split(/(<CardHeader(?:\s[^>]*)?>)/)
    // parts = [before0, tag0, content0+rest, tag1, content1+rest, ...]
    for (let i = 1; i < parts.length; i += 2) {
      const headerTag = parts[i]
      const rest = parts[i + 1] ?? ""
      // Check if this segment (before next <CardHeader) contains the title
      const nextHeaderIdx = rest.indexOf("<CardHeader")
      const segmentEnd = nextHeaderIdx === -1 ? rest.indexOf("</CardHeader>") + "</CardHeader>".length : nextHeaderIdx
      const segment = nextHeaderIdx === -1 ? rest : rest.slice(0, nextHeaderIdx)

      if (segment.includes(titleText) && !segment.includes(chipJsx.slice(0, 20))) {
        // Detect indent of first child (first non-empty line inside header)
        const firstContentLine = segment.match(/\r?\n([ \t]+)\S/)
        const childIndent = firstContentLine ? firstContentLine[1] : "          "
        // Insert chip as first child
        parts[i + 1] = rest.replace(
          /(\r?\n)([ \t]*)/,
          `$1${childIndent}${chipJsx}\n$2`
        )
        return parts.join("")
      }
    }
  }

  // Strategy B: Insert chip line before <CardTitle ...>titleText
  const titleLineRe = new RegExp(
    `([ \\t]*)(<CardTitle(?:\\s[^>]*)?>(?:[^<]*)?${titlePattern})`,
    "m"
  )
  if (titleLineRe.test(src) && !src.includes(chipJsx.slice(0, 20))) {
    return src.replace(titleLineRe, (_, indent, rest) => {
      return `${indent}${chipJsx}\n${indent}${rest}`
    })
  }

  // Strategy C: Insert chip before heading containing titleText
  const headingRe = new RegExp(
    `([ \\t]*)(<h[2-6](?:\\s[^>]*)?>(?:[^<]*)?${titlePattern})`,
    "m"
  )
  if (headingRe.test(src) && !src.includes(chipJsx.slice(0, 20))) {
    return src.replace(headingRe, (_, indent, rest) => {
      return `${indent}${chipJsx}\n${indent}${rest}`
    })
  }

  // Strategy D: Insert before a <p> or <span> with a strong class containing titleText
  const textRe = new RegExp(
    `([ \\t]*)(<(?:p|span|div)[^>]*font-(?:semibold|bold|medium)[^>]*>(?:[^<]*)?${titlePattern})`,
    "m"
  )
  if (textRe.test(src) && !src.includes(chipJsx.slice(0, 20))) {
    return src.replace(textRe, (_, indent, rest) => {
      return `${indent}${chipJsx}\n${indent}${rest}`
    })
  }

  console.warn(`    [WARN] no insertion point found for: "${titleText}"`)
  return src
}

// ─── DataTable migration ─────────────────────────────────────────────────────

function migrateToDataTable(src) {
  if (!src.match(/<Table[^\w]/)) return src // No Table usage found

  src = ensureDataTableImport(src)

  // Remove old shadcn table import
  src = src.replace(
    /import\s*\{[^}]*(?:Table(?:Header|Body|Row|Head|Cell|Caption)?[^}]*){1,}[^}]*\}\s*from\s*["']@\/components\/ui\/table["']\s*\n?/g,
    ""
  )

  // Replace JSX tags and usages
  // Order matters: do compound names first
  src = src
    .replace(/\bTableHeader\b/g, "DataTableHeader")
    .replace(/\bTableBody\b/g, "DataTableBody")
    .replace(/\bTableRow\b/g, "DataTableRow")
    .replace(/\bTableHead\b/g, "DataTableHead")
    .replace(/\bTableCell\b/g, "DataTableCell")
    .replace(/\bTableCaption\b/g, "DataTableCaption")
    // Replace root Table last (avoid matching already-replaced DataTable*)
    .replace(/(?<!Data)\bTable\b(?!Header|Body|Row|Head|Cell|Caption|Data)/g, "DataTable")

  return src
}

// ─── File migrations ──────────────────────────────────────────────────────────

// reports/page.tsx
function migrateReports() {
  const p = abs("app/dashboard/reports/page.tsx")
  if (!exists(p)) return console.warn("  [skip] reports/page.tsx")
  let src = read(p)
  const orig = src

  src = ensureStatusChipImport(src)
  src = removeBorderL(src)

  const chips = [
    ["Drift Velocity",          `<StatusChip variant="primary" label="TRENDS" />`],
    ["Vitality Index",           `<StatusChip variant="primary" label="HEALTH" />`],
    ["Withering Zones",          `<StatusChip variant="broken" label="HOTSPOTS" />`],
    ["Documentation Risk Map",   `<StatusChip variant="withered" label="RISK MAP" />`],
    ["Governance Proof Points",  `<StatusChip variant="fresh" label="EVIDENCE" />`],
    ["Ignore Trend",             `<StatusChip variant="broken" label="ANALYTICS" />`],
    ["Dismiss Signals",          `<StatusChip variant="broken" label="SIGNALS" />`],
    ["Ignore-Rate Analytics",    `<StatusChip variant="neutral" label="PRO" />`],
  ]

  for (const [title, chip] of chips) {
    src = insertChip(src, title, chip)
  }

  // Handle PRO locked card for Documentation Risk Map (second instance)
  // It's the muted card, insertion via "Upgrade" or "PRO" near risk map context
  // Already handled above via Ignore-Rate Analytics; the Risk Map locked card
  // will be caught by a second "Documentation Risk Map" match attempt
  if (src.split("Documentation Risk Map").length > 2 &&
      !src.match(/Documentation Risk Map[\s\S]{0,200}label="PRO"/)) {
    src = src.replace(
      /(<CardHeader[^>]*>[\s\S]{0,300}Documentation Risk Map[\s\S]{0,300}(?:Upgrade|PRO|locked)[\s\S]{0,100}<\/CardHeader>)/,
      (m) => {
        if (m.includes('label="PRO"')) return m
        return m.replace(
          /(<CardHeader[^>]*>)(\s*)/,
          `$1$2          <StatusChip variant="neutral" label="PRO" />\n`
        )
      }
    )
  }

  commit(p, src, orig)
}

// settings/page.tsx
function migrateSettings() {
  const p = abs("app/dashboard/settings/page.tsx")
  if (!exists(p)) return console.warn("  [skip] settings/page.tsx")
  let src = read(p)
  const orig = src

  src = ensureStatusChipImport(src)
  src = removeBorderL(src)

  // Mapping: card title → chip (order from spec)
  const chips = [
    // border-l-blue-600 → primary ACTIVE (GitHub App / any blue-600 section)
    // border-l-amber-500 → withered WARNING
    // border-l-violet-600 → primary SSO (x2)
    // border-l-primary (GitHub App, API) → primary ACTIVE (x2)
    // border-l-green-600 → fresh ACTIVE
    // border-l-indigo-500 → primary ACTIVE
    // border-l-emerald-500 → fresh ACTIVE
    // border-l-foreground → neutral DEFAULT
    // border-l-muted → neutral DEFAULT
    // border-l-cyan-600 → fresh ACTIVE
    //
    // We match on likely section headings found in settings pages:
    ["GitHub App",              `<StatusChip variant="primary" label="ACTIVE" />`],
    ["API Keys",                `<StatusChip variant="primary" label="ACTIVE" />`],
    ["Okta",                    `<StatusChip variant="primary" label="SSO" />`],
    ["SAML",                    `<StatusChip variant="primary" label="SSO" />`],
    ["LLM Configuration",       `<StatusChip variant="fresh" label="ACTIVE" />`],
    ["AI Configuration",        `<StatusChip variant="fresh" label="ACTIVE" />`],
    ["Notifications",           `<StatusChip variant="primary" label="ACTIVE" />`],
    ["Webhook",                 `<StatusChip variant="fresh" label="ACTIVE" />`],
    ["Slack",                   `<StatusChip variant="fresh" label="ACTIVE" />`],
    ["Billing",                 `<StatusChip variant="withered" label="WARNING" />`],
    ["Rules",                   `<StatusChip variant="primary" label="ACTIVE" />`],
    ["Danger Zone",             `<StatusChip variant="neutral" label="DEFAULT" />`],
    ["Plugin",                  `<StatusChip variant="neutral" label="DEFAULT" />`],
  ]

  for (const [title, chip] of chips) {
    src = insertChip(src, title, chip)
  }

  commit(p, src, orig)
}

// PromptPlayground.tsx
function migratePromptPlayground() {
  const p = abs("components/dashboard/PromptPlayground.tsx")
  if (!exists(p)) return console.warn("  [skip] PromptPlayground.tsx")
  let src = read(p)
  const orig = src

  src = ensureStatusChipImport(src)
  src = removeBorderL(src)
  src = insertChip(src, "Context", `<StatusChip variant="neutral" label="CONTEXT" />`)
  src = insertChip(src, "Output",  `<StatusChip variant="primary" label="OUTPUT" />`)

  commit(p, src, orig)
}

// DriftSimulator.tsx
function migrateDriftSimulator() {
  const p = abs("components/simulation/DriftSimulator.tsx")
  if (!exists(p)) return console.warn("  [skip] DriftSimulator.tsx")
  let src = read(p)
  const orig = src

  src = ensureStatusChipImport(src)
  src = removeBorderL(src)
  src = insertChip(src, "Input",  `<StatusChip variant="neutral" label="INPUT" />`)
  src = insertChip(src, "Result", `<StatusChip variant="primary" label="RESULT" />`)

  commit(p, src, orig)
}

// RepoImportWizard.tsx
function migrateRepoImportWizard() {
  const p = abs("components/repos/RepoImportWizard.tsx")
  if (!exists(p)) return console.warn("  [skip] RepoImportWizard.tsx")
  let src = read(p)
  const orig = src

  src = ensureStatusChipImport(src)
  src = removeBorderL(src)
  src = insertChip(src, "Import", `<StatusChip variant="primary" label="IMPORT" />`)

  commit(p, src, orig)
}

// simulation/page.tsx
function migrateSimulationPage() {
  const p = abs("app/dashboard/simulation/page.tsx")
  if (!exists(p)) return console.warn("  [skip] simulation/page.tsx")
  let src = read(p)
  const orig = src

  src = ensureStatusChipImport(src)
  src = removeBorderL(src)
  src = insertChip(src, "Simulation", `<StatusChip variant="neutral" label="SIMULATION" />`)

  commit(p, src, orig)
}

// team/page.tsx
function migrateTeamPage() {
  const p = abs("app/dashboard/team/page.tsx")
  if (!exists(p)) return console.warn("  [skip] team/page.tsx")
  let src = read(p)
  const orig = src

  src = ensureStatusChipImport(src)
  src = removeBorderL(src)
  src = insertChip(src, "Team", `<StatusChip variant="primary" label="TEAM" />`)

  commit(p, src, orig)
}

// prompts/page.tsx
function migratePromptsPage() {
  const p = abs("app/dashboard/prompts/page.tsx")
  if (!exists(p)) return console.warn("  [skip] prompts/page.tsx")
  let src = read(p)
  const orig = src

  src = ensureStatusChipImport(src)
  src = removeBorderL(src)
  src = insertChip(src, "Prompt", `<StatusChip variant="primary" label="PROMPT" />`)

  commit(p, src, orig)
}

// DeploymentProfileCard.tsx
function migrateDeploymentProfileCard() {
  const p = abs("components/settings/DeploymentProfileCard.tsx")
  if (!exists(p)) return console.warn("  [skip] DeploymentProfileCard.tsx")
  let src = read(p)
  const orig = src

  src = ensureStatusChipImport(src)
  src = removeBorderL(src)
  // The card's first heading is likely "Deployment Profile" or "Deployment"
  src = insertChip(src, "Deployment", `<StatusChip variant="neutral" label="ACTIVE" />`)

  commit(p, src, orig)
}

// ExecutionModeCard.tsx — special: replace borderClass field
function migrateExecutionModeCard() {
  const p = abs("components/settings/ExecutionModeCard.tsx")
  if (!exists(p)) return console.warn("  [skip] ExecutionModeCard.tsx")
  let src = read(p)
  const orig = src

  src = ensureStatusChipImport(src)

  // Add StatusChipVariant type import
  if (!src.includes("StatusChipVariant")) {
    src = src.replace(
      `import { StatusChip } from "@/components/ui/status-chip"`,
      `import { StatusChip } from "@/components/ui/status-chip"\nimport type { StatusChipVariant } from "@/components/ui/status-chip"`
    )
  }

  // Replace borderClass: string in interface/type definition
  src = src.replace(/\bborderClass\s*:\s*string\b/g, "chipVariant: StatusChipVariant\n  chipLabel: string")

  // Replace each mode's borderClass value with chipVariant + chipLabel
  const modeReplacements = [
    ["hosted",     "border-l-blue-500",    "primary",   "HOSTED"],
    ["byok",       "border-l-amber-500",   "withered",  "BYOK"],
    ["local",      "border-l-emerald-500", "fresh",     "LOCAL"],
    ["enterprise", "border-l-violet-500",  "primary",   "ENTERPRISE"],
  ]

  for (const [, , chipVariant, chipLabel] of modeReplacements) {
    // Replace borderClass: "border-l-XXX" inside any mode block
    src = src.replace(
      new RegExp(`borderClass:\\s*["']border-l-[\\w-]+["']`),
      `chipVariant: "${chipVariant}",\n    chipLabel: "${chipLabel}"`
    )
  }

  // Remove border-l-8 and border-l-* from className usages
  src = removeBorderL(src)

  // Replace the rendering: wherever borderClass was used in className,
  // add StatusChip instead. Look for the pattern where the card renders
  // the mode header.
  if (!src.includes("meta.chipVariant") && !src.includes("chipVariant}")) {
    // Find the div/element that had the border class and add StatusChip inside it
    // Common pattern: a flex header div containing the mode title
    src = src.replace(
      /(<div[^>]*flex[^>]*items-center[^>]*>)(\s*)/,
      (m, openDiv, ws) => {
        if (m.includes("StatusChip")) return m
        return `${openDiv}${ws}<StatusChip variant={meta.chipVariant} label={meta.chipLabel} />${ws}`
      }
    )
  }

  commit(p, src, orig)
}

// ─── Story 5: DataTable consumers ────────────────────────────────────────────

function migrateJobsPage() {
  const p = abs("app/dashboard/jobs/page.tsx")
  if (!exists(p)) return console.warn("  [skip] jobs/page.tsx")
  let src = read(p)
  const orig = src

  if (src.match(/<Table[^\w]/)) {
    src = migrateToDataTable(src)
    commit(p, src, orig)
  } else {
    console.log(`  [=] jobs/page.tsx (no Table found)`)
  }
}

function migrateAuditPage() {
  const p = abs("app/dashboard/audit/page.tsx")
  if (!exists(p)) return console.warn("  [skip] audit/page.tsx")
  let src = read(p)
  const orig = src

  if (src.match(/<Table[^\w]/)) {
    src = migrateToDataTable(src)
    commit(p, src, orig)
  } else {
    console.log(`  [=] audit/page.tsx (no Table found)`)
  }
}

function migrateOwnerTenantsPage() {
  const p = abs("app/admin/owner/tenants/page.tsx")
  if (!exists(p)) return console.warn("  [skip] owner/tenants/page.tsx")
  let src = read(p)
  const orig = src

  if (src.match(/<Table[^\w]/)) {
    src = migrateToDataTable(src)
    commit(p, src, orig)
  } else {
    console.log(`  [=] owner/tenants/page.tsx (no Table found)`)
  }
}

function migrateInboxPage() {
  // Inbox table could be in page.tsx or DriftAlertList.tsx
  const candidates = [
    abs("app/dashboard/inbox/page.tsx"),
    abs("components/inbox/DriftAlertList.tsx"),
  ]

  for (const p of candidates) {
    if (!exists(p)) continue
    const src = read(p)
    if (src.match(/<Table[^\w]/)) {
      const migrated = migrateToDataTable(src)
      commit(p, migrated, src)
      return
    }
  }
  console.log("  [=] inbox table not found in expected locations")
}

// ─── Main ────────────────────────────────────────────────────────────────────

console.log("=== FEAT-020 Stories 4+5 migration ===\n")
console.log("Story 4: border-l-8 → StatusChip")
migrateReports()
migrateSettings()
migratePromptPlayground()
migrateDriftSimulator()
migrateRepoImportWizard()
migrateSimulationPage()
migrateTeamPage()
migratePromptsPage()
migrateDeploymentProfileCard()
migrateExecutionModeCard()

console.log("\nStory 5: Table → DataTable")
migrateJobsPage()
migrateAuditPage()
migrateInboxPage()
migrateOwnerTenantsPage()

// ─── Verification ────────────────────────────────────────────────────────────

if (!DRY_RUN) {
  console.log("\n=== Verification ===")
  const { execSync } = await import("child_process")
  try {
    const result = execSync(
      `grep -rn "border-l-8" "${abs("app")}" "${abs("components")}" 2>/dev/null || true`,
      { encoding: "utf8" }
    )
    const matches = result.split("\n").filter((l) => l.trim() && !l.includes("/.next/") && !l.includes("node_modules"))
    if (matches.length === 0) {
      console.log("  PASS: zero border-l-8 matches")
    } else {
      console.log(`  WARN: ${matches.length} border-l-8 match(es) remain:`)
      matches.forEach((l) => console.log("    " + l))
    }
  } catch {
    console.log("  (grep check skipped)")
  }

  console.log("\nNext steps:")
  console.log("  cd web && npx tsc --noEmit")
  console.log("  cd web && npx vitest run")
}
