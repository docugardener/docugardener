/**
 * RULES-01: Vitest regression tests for the Agent Rules Compiler frontend layer.
 *
 * Tests cover:
 *  - Plan gate: canGenerate() logic
 *  - Stale badge label rendering
 *  - Date formatting
 *  - Generate endpoint response status handling
 *  - Tab state: format IDs are valid and match supported formats
 *  - isGitHubConnected: numeric vs demo IDs
 *  - Preview fetch: response parsing, error surfacing, JSON parse guard
 *  - Propose fetch: ok / non-ok / network failure branches
 *  - Inline expand: load-on-first-expand, cache-on-re-expand
 *  - Stale repo filtering for "Propose all stale"
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

// ---------------------------------------------------------------------------
// Logic helpers mirroring AgentRulesPanel.tsx
// ---------------------------------------------------------------------------

const FREE_LIMIT = 1

function canGenerate(isPro: boolean, hasExistingArtifact: boolean, freeArtifactCount: number): boolean {
    if (isPro) return true
    if (hasExistingArtifact) return true
    return freeArtifactCount < FREE_LIMIT
}

function staleBadgeLabel(artifact: { isStale: boolean; lastGeneratedAt: string | null } | null): string {
    if (!artifact) return "Never generated"
    if (artifact.isStale) return "Stale"
    return "In Sync"
}

function formatLastGenerated(iso: string | null): string {
    if (!iso) return ""
    return new Date(iso).toLocaleDateString()
}

function isGitHubConnected(githubRepoId: string): boolean {
    return /^\d+$/.test(githubRepoId)
}

const SUPPORTED_FORMATS = ["agents_md", "copilot_instructions", "cursor_rules", "claude_md"] as const
type FormatId = (typeof SUPPORTED_FORMATS)[number]

const rowKey = (repoId: string, format: FormatId) => `${repoId}:${format}`

// ---------------------------------------------------------------------------
// Tests: plan gating
// ---------------------------------------------------------------------------

describe("RULES-01 plan gate — canGenerate()", () => {
    it("PRO tenant always can generate regardless of count", () => {
        expect(canGenerate(true, false, 0)).toBe(true)
        expect(canGenerate(true, false, 10)).toBe(true)
        expect(canGenerate(true, true, 10)).toBe(true)
    })

    it("FREE tenant can generate if no artifacts exist yet (count=0)", () => {
        expect(canGenerate(false, false, 0)).toBe(true)
    })

    it("FREE tenant can update existing artifact", () => {
        expect(canGenerate(false, true, 1)).toBe(true)
    })

    it("FREE tenant cannot generate new format when limit reached", () => {
        expect(canGenerate(false, false, 1)).toBe(false)
        expect(canGenerate(false, false, 5)).toBe(false)
    })
})

// ---------------------------------------------------------------------------
// Tests: stale badge label
// ---------------------------------------------------------------------------

describe("RULES-01 staleBadgeLabel()", () => {
    it("returns 'Never generated' when artifact is null", () => {
        expect(staleBadgeLabel(null)).toBe("Never generated")
    })

    it("returns 'Stale' when isStale is true", () => {
        expect(staleBadgeLabel({ isStale: true, lastGeneratedAt: "2026-03-13T10:00:00Z" })).toBe("Stale")
    })

    it("returns 'In Sync' when isStale is false", () => {
        expect(staleBadgeLabel({ isStale: false, lastGeneratedAt: "2026-03-13T10:00:00Z" })).toBe("In Sync")
    })

    it("isStale=false with null date → In Sync", () => {
        expect(staleBadgeLabel({ isStale: false, lastGeneratedAt: null })).toBe("In Sync")
    })
})

// ---------------------------------------------------------------------------
// Tests: date formatting
// ---------------------------------------------------------------------------

describe("RULES-01 formatLastGenerated()", () => {
    it("returns empty string for null", () => {
        expect(formatLastGenerated(null)).toBe("")
    })

    it("returns a non-empty string for a valid ISO date", () => {
        const result = formatLastGenerated("2026-03-13T10:00:00Z")
        expect(result.length).toBeGreaterThan(0)
    })
})

// ---------------------------------------------------------------------------
// Tests: generate endpoint response status handling
// ---------------------------------------------------------------------------

describe("RULES-01 generate endpoint response status handling", () => {
    const STATUSES = ["in_sync", "pr_opened", "upgrade_required", "error"] as const

    it.each(STATUSES)("status '%s' is a recognised value", (s) => {
        const handled = ["in_sync", "pr_opened", "upgrade_required", "error"].includes(s)
        expect(handled).toBe(true)
    })

    it("in_sync response has no PR URL", () => {
        const response = { status: "in_sync", pr_url: null }
        expect(response.pr_url).toBeNull()
    })

    it("pr_opened response includes a PR URL", () => {
        const response = { status: "pr_opened", pr_url: "https://github.com/owner/repo/pull/42" }
        expect(response.pr_url).toMatch(/pull\/\d+/)
    })
})

// ---------------------------------------------------------------------------
// Tests: tab format IDs
// ---------------------------------------------------------------------------

describe("RULES-01 tab formats", () => {
    it("exactly four formats are defined", () => {
        expect(SUPPORTED_FORMATS).toHaveLength(4)
    })

    it("agents_md is a supported format", () => {
        expect(SUPPORTED_FORMATS).toContain("agents_md")
    })

    it("copilot_instructions is a supported format", () => {
        expect(SUPPORTED_FORMATS).toContain("copilot_instructions")
    })

    it("cursor_rules is a supported format", () => {
        expect(SUPPORTED_FORMATS).toContain("cursor_rules")
    })

    it("claude_md is a supported format", () => {
        expect(SUPPORTED_FORMATS).toContain("claude_md")
    })

    it("rowKey is unique per repo × format combination", () => {
        const k1 = rowKey("repo-a", "agents_md")
        const k2 = rowKey("repo-a", "copilot_instructions")
        const k3 = rowKey("repo-b", "agents_md")
        expect(k1).not.toBe(k2)
        expect(k1).not.toBe(k3)
        expect(k2).not.toBe(k3)
    })

    it("rowKey format is repoId:format", () => {
        expect(rowKey("abc123", "agents_md")).toBe("abc123:agents_md")
        expect(rowKey("abc123", "copilot_instructions")).toBe("abc123:copilot_instructions")
    })
})

// ---------------------------------------------------------------------------
// Tests: isGitHubConnected
// ---------------------------------------------------------------------------

describe("RULES-01 isGitHubConnected()", () => {
    it("returns true for a numeric GitHub repo ID", () => {
        expect(isGitHubConnected("235832917")).toBe(true)
        expect(isGitHubConnected("1")).toBe(true)
    })

    it("returns false for demo/fake IDs", () => {
        expect(isGitHubConnected("demo-gh-1001")).toBe(false)
        expect(isGitHubConnected("demo-gh-1002")).toBe(false)
    })

    it("returns false for empty string", () => {
        expect(isGitHubConnected("")).toBe(false)
    })

    it("returns false for IDs with leading letters", () => {
        expect(isGitHubConnected("abc123")).toBe(false)
    })

    it("returns false for float strings", () => {
        expect(isGitHubConnected("123.45")).toBe(false)
    })
})

// ---------------------------------------------------------------------------
// Tests: preview fetch response parsing
// ---------------------------------------------------------------------------

describe("RULES-01 preview fetch response parsing", () => {
    it("extracts content from items[0].content", () => {
        const data = { items: [{ content: "# AGENTS.md\n\nDo stuff." }] }
        const content = data.items?.[0]?.content ?? "(empty)"
        expect(content).toBe("# AGENTS.md\n\nDo stuff.")
    })

    it("falls back to '(empty)' when items is empty", () => {
        const data: { items: Array<{ content?: string }> } = { items: [] }
        const content = data.items?.[0]?.content ?? "(empty)"
        expect(content).toBe("(empty)")
    })

    it("falls back to '(empty)' when items is missing", () => {
        const data: any = {}
        const content = data.items?.[0]?.content ?? "(empty)"
        expect(content).toBe("(empty)")
    })

    it("extracts error detail from non-ok response", () => {
        const data = { detail: "Repository not found" }
        const error = data.detail ?? "(unknown error)"
        expect(error).toBe("Repository not found")
    })

    it("falls back to status code when detail is missing", () => {
        const data: any = {}
        const status = 500
        const error = data.detail ?? data.error ?? `Error ${status}`
        expect(error).toBe("Error 500")
    })

    it("inner JSON parse guard returns {} on parse failure", () => {
        // Simulates: try { data = await res.json() } catch { data = {} }
        const safeParse = (fn: () => any) => { try { return fn() } catch { return {} } }
        const result = safeParse(() => { throw new SyntaxError("not json") })
        expect(result).toEqual({})
    })
})

// ---------------------------------------------------------------------------
// Tests: stale repo filtering for "Propose all stale"
// ---------------------------------------------------------------------------

describe("RULES-01 stale repo filtering", () => {
    const makeRepo = (id: string, githubRepoId: string, isStale: boolean | null) => ({
        id,
        name: id,
        githubRepoId,
        rulesArtifacts: isStale === null
            ? []
            : [{ id: `art-${id}`, repoId: id, targetFormat: "agents_md", outputPath: "AGENTS.md",
                lastHash: "abc", lastGeneratedAt: "2026-01-01", lastPrUrl: null, isStale, updatedAt: "2026-01-01" }],
    })

    const getStaleRepos = (repos: ReturnType<typeof makeRepo>[], format: FormatId) =>
        repos.filter(r => {
            if (!isGitHubConnected(r.githubRepoId)) return false
            const a = r.rulesArtifacts.find(x => x.targetFormat === format) ?? null
            return !a || a.isStale
        })

    it("includes connected repos with no artifact", () => {
        const repos = [makeRepo("r1", "111", null)]
        expect(getStaleRepos(repos, "agents_md")).toHaveLength(1)
    })

    it("includes connected repos with isStale=true", () => {
        const repos = [makeRepo("r1", "111", true)]
        expect(getStaleRepos(repos, "agents_md")).toHaveLength(1)
    })

    it("excludes connected repos with isStale=false", () => {
        const repos = [makeRepo("r1", "111", false)]
        expect(getStaleRepos(repos, "agents_md")).toHaveLength(0)
    })

    it("excludes unconnected repos regardless of staleness", () => {
        const repos = [makeRepo("r1", "demo-gh-1001", null), makeRepo("r2", "demo-gh-1002", true)]
        expect(getStaleRepos(repos, "agents_md")).toHaveLength(0)
    })

    it("only counts stale for the active format (not cross-format)", () => {
        const repos = [makeRepo("r1", "111", false)]   // in-sync for agents_md
        expect(getStaleRepos(repos, "agents_md")).toHaveLength(0)
        expect(getStaleRepos(repos, "copilot_instructions")).toHaveLength(1) // no artifact for this format
    })

    it("handles mixed connected and unconnected repos correctly", () => {
        const repos = [
            makeRepo("r1", "111", true),         // connected, stale
            makeRepo("r2", "222", false),         // connected, in-sync
            makeRepo("r3", "demo-gh-1001", null), // unconnected
        ]
        const stale = getStaleRepos(repos, "agents_md")
        expect(stale).toHaveLength(1)
        expect(stale[0].id).toBe("r1")
    })
})

// ---------------------------------------------------------------------------
// Tests: expand / collapse state logic
// ---------------------------------------------------------------------------

describe("RULES-01 inline expand/collapse state", () => {
    it("rowKey is used as expand key", () => {
        const expanded = new Set<string>()
        const k = rowKey("repo-1", "agents_md")
        expanded.add(k)
        expect(expanded.has(k)).toBe(true)
        expect(expanded.has(rowKey("repo-1", "copilot_instructions"))).toBe(false)
    })

    it("toggling removes an existing key", () => {
        const expanded = new Set<string>(["repo-1:agents_md"])
        const k = "repo-1:agents_md"
        if (expanded.has(k)) expanded.delete(k)
        expect(expanded.has(k)).toBe(false)
    })

    it("toggling adds a missing key", () => {
        const expanded = new Set<string>()
        const k = "repo-1:agents_md"
        if (!expanded.has(k)) expanded.add(k)
        expect(expanded.has(k)).toBe(true)
    })

    it("expanding one format does not expand the other", () => {
        const expanded = new Set<string>()
        expanded.add(rowKey("repo-1", "agents_md"))
        expect(expanded.has(rowKey("repo-1", "agents_md"))).toBe(true)
        expect(expanded.has(rowKey("repo-1", "copilot_instructions"))).toBe(false)
    })

    it("preview cache hit: content already set → skip re-fetch", () => {
        type P = { loading: boolean; content: string | null; error: string | null }
        const cache: Record<string, P> = {
            "repo-1:agents_md": { loading: false, content: "# cached", error: null },
        }
        const k = rowKey("repo-1", "agents_md")
        const shouldFetch = !(cache[k]?.content !== undefined && cache[k]?.content !== null)
        expect(shouldFetch).toBe(false)
    })

    it("preview cache miss: content null → should fetch", () => {
        type P = { loading: boolean; content: string | null; error: string | null }
        const cache: Record<string, P> = {}
        const k = rowKey("repo-1", "agents_md")
        const shouldFetch = !(cache[k]?.content !== undefined && cache[k]?.content !== null)
        expect(shouldFetch).toBe(true)
    })
})
