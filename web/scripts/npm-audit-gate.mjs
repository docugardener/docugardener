// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * CI-04 dependency gate: `npm audit` at high severity, minus an explicit allowlist.
 *
 * Fails on any high/critical advisory in prod OR dev dependencies unless its
 * GHSA id is listed in ALLOWLIST below. Every entry needs a reason and must be
 * removed once a patched version exists.
 *
 * Usage (from web/): node scripts/npm-audit-gate.mjs
 */
import { spawnSync } from "node:child_process"

const ALLOWLIST = {
    // braces <=3.0.3, stack-exhaustion DoS on deeply nested patterns. No patched
    // release exists. Dev-only: eslint-config-next -> @next/eslint-plugin-next
    // (pins fast-glob 3.3.1, still true in 16.4.0) -> micromatch -> braces.
    // Never ships (standalone build); input is our own lint globs. Added 2026-10-11.
    "GHSA-vfj7-8cjw-p6xm": "braces: no fix upstream, dev-only eslint chain",
}

const BLOCKING = new Set(["high", "critical"])

const res = spawnSync("npm", ["audit", "--json"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
let report
try {
    report = JSON.parse(res.stdout)
} catch {
    console.error("npm audit did not return JSON:\n", res.stdout, res.stderr)
    process.exit(2)
}
if (report.error) {
    console.error("npm audit failed:", report.error)
    process.exit(2)
}

// Root advisories are the object entries in `via`; string entries only point at
// another vulnerable package, whose own entry carries the advisory.
const blocking = new Map()
const allowed = new Map()
for (const [pkg, vuln] of Object.entries(report.vulnerabilities ?? {})) {
    for (const via of vuln.via ?? []) {
        if (typeof via !== "object" || !BLOCKING.has(via.severity)) continue
        const ghsa = (via.url ?? "").split("/").pop()
        const target = ALLOWLIST[ghsa] ? allowed : blocking
        target.set(`${ghsa} ${pkg}`, `${via.severity}: ${via.title} (${via.url})`)
    }
}

for (const [key, desc] of allowed) console.log(`ALLOWLISTED ${key} — ${desc} — ${ALLOWLIST[key.split(" ")[0]]}`)
if (blocking.size > 0) {
    for (const [key, desc] of blocking) console.error(`BLOCKING   ${key} — ${desc}`)
    console.error(`\n${blocking.size} high/critical advisory(ies) not allowlisted. Fix them, or allowlist with a reason in scripts/npm-audit-gate.mjs.`)
    process.exit(1)
}
const stale = Object.keys(ALLOWLIST).filter((id) => ![...allowed.keys()].some((k) => k.startsWith(id + " ")))
for (const id of stale) console.log(`NOTE: allowlist entry ${id} no longer matches anything — remove it.`)
console.log(`npm audit gate passed (${allowed.size} allowlisted, 0 blocking).`)
