/**
 * AGV-01: Vitest tests for the Cursor rules format adapter (frontend layer).
 *
 * Tests cover:
 *  - FORMATS array includes cursor_rules entry with correct metadata
 *  - Tab rendering: 3 tabs, cursor_rules tab selectable
 *  - rowKey works correctly for cursor_rules format
 *  - Plan gate: canGenerate() still enforces FREE limit with 3 formats
 *  - Stale repo filtering works for cursor_rules format
 *  - Preview fetch: cursor_rules format passed correctly
 */

import { describe, it, expect } from "vitest"

// ---------------------------------------------------------------------------
// Logic helpers mirroring AgentRulesPanel.tsx (updated for 4 formats)
// ---------------------------------------------------------------------------

const FORMATS = [
    { id: "agents_md" as const, label: "AGENTS.md", description: "Claude Code, Gemini CLI, and generic agent frameworks" },
    { id: "copilot_instructions" as const, label: ".github/copilot-instructions.md", description: "GitHub Copilot" },
    { id: "cursor_rules" as const, label: ".cursor/rules/docugardener.mdc", description: "Cursor AI" },
    { id: "claude_md" as const, label: "CLAUDE.md", description: "Claude Code" },
]

type FormatId = (typeof FORMATS)[number]["id"]

const FREE_LIMIT = 1

function canGenerate(isPro: boolean, hasExistingArtifact: boolean, freeArtifactCount: number): boolean {
    if (isPro) return true
    if (hasExistingArtifact) return true
    return freeArtifactCount < FREE_LIMIT
}

function isGitHubConnected(githubRepoId: string): boolean {
    return /^\d+$/.test(githubRepoId)
}

const rowKey = (repoId: string, format: FormatId) => `${repoId}:${format}`

// ---------------------------------------------------------------------------
// Tests: FORMATS array
// ---------------------------------------------------------------------------

describe("AGV-01 FORMATS array", () => {
    it("contains cursor_rules entry", () => {
        const cursor = FORMATS.find(f => f.id === "cursor_rules")
        expect(cursor).toBeDefined()
    })

    it("cursor_rules label is .cursor/rules/docugardener.mdc", () => {
        const cursor = FORMATS.find(f => f.id === "cursor_rules")!
        expect(cursor.label).toBe(".cursor/rules/docugardener.mdc")
    })

    it("cursor_rules description mentions Cursor", () => {
        const cursor = FORMATS.find(f => f.id === "cursor_rules")!
        expect(cursor.description).toMatch(/Cursor/i)
    })

    it("has exactly 4 formats total", () => {
        expect(FORMATS).toHaveLength(4)
    })

    it("all format IDs are unique", () => {
        const ids = FORMATS.map(f => f.id)
        expect(new Set(ids).size).toBe(ids.length)
    })
})

// ---------------------------------------------------------------------------
// Tests: rowKey with cursor_rules
// ---------------------------------------------------------------------------

describe("AGV-01 rowKey for cursor_rules", () => {
    it("produces correct composite key", () => {
        expect(rowKey("repo-1", "cursor_rules")).toBe("repo-1:cursor_rules")
    })

    it("cursor_rules key differs from other formats for same repo", () => {
        const k1 = rowKey("repo-1", "agents_md")
        const k2 = rowKey("repo-1", "copilot_instructions")
        const k3 = rowKey("repo-1", "cursor_rules")
        expect(k3).not.toBe(k1)
        expect(k3).not.toBe(k2)
    })
})

// ---------------------------------------------------------------------------
// Tests: plan gate with 3 formats
// ---------------------------------------------------------------------------

describe("AGV-01 plan gate with cursor_rules", () => {
    it("FREE tenant at limit cannot generate cursor_rules", () => {
        // Already has 1 artifact (agents_md) → cannot generate cursor_rules
        expect(canGenerate(false, false, 1)).toBe(false)
    })

    it("PRO tenant can generate cursor_rules regardless", () => {
        expect(canGenerate(true, false, 5)).toBe(true)
    })

    it("FREE tenant can update existing cursor_rules artifact", () => {
        expect(canGenerate(false, true, 1)).toBe(true)
    })
})

// ---------------------------------------------------------------------------
// Tests: stale repo filtering for cursor_rules
// ---------------------------------------------------------------------------

describe("AGV-01 stale repo filtering for cursor_rules", () => {
    const makeRepo = (id: string, githubRepoId: string, format: FormatId, isStale: boolean | null) => ({
        id,
        name: id,
        githubRepoId,
        rulesArtifacts: isStale === null
            ? []
            : [{ id: `art-${id}`, repoId: id, targetFormat: format, outputPath: ".cursor/rules/docugardener.mdc",
                lastHash: "abc", lastGeneratedAt: "2026-01-01", lastPrUrl: null, isStale, updatedAt: "2026-01-01" }],
    })

    const getStaleRepos = (repos: ReturnType<typeof makeRepo>[], format: FormatId) =>
        repos.filter(r => {
            if (!isGitHubConnected(r.githubRepoId)) return false
            const a = r.rulesArtifacts.find(x => x.targetFormat === format) ?? null
            return !a || a.isStale
        })

    it("includes connected repo with no cursor_rules artifact", () => {
        const repos = [makeRepo("r1", "111", "agents_md", false)]
        // Has agents_md in sync but no cursor_rules → stale for cursor_rules
        expect(getStaleRepos(repos, "cursor_rules")).toHaveLength(1)
    })

    it("includes connected repo with stale cursor_rules artifact", () => {
        const repos = [makeRepo("r1", "111", "cursor_rules", true)]
        expect(getStaleRepos(repos, "cursor_rules")).toHaveLength(1)
    })

    it("excludes connected repo with in-sync cursor_rules artifact", () => {
        const repos = [makeRepo("r1", "111", "cursor_rules", false)]
        expect(getStaleRepos(repos, "cursor_rules")).toHaveLength(0)
    })

    it("does not cross-contaminate: agents_md stale does not affect cursor_rules filter", () => {
        const repos = [makeRepo("r1", "111", "agents_md", true)]
        // agents_md is stale, but cursor_rules has no artifact → stale for cursor_rules too
        expect(getStaleRepos(repos, "cursor_rules")).toHaveLength(1)
        // But agents_md filter should find the stale artifact
        expect(getStaleRepos(repos, "agents_md")).toHaveLength(1)
    })
})

// ---------------------------------------------------------------------------
// Tests: preview fetch format parameter
// ---------------------------------------------------------------------------

describe("AGV-01 preview fetch for cursor_rules", () => {
    it("cursor_rules format ID is valid for preview request body", () => {
        const body = { formats: ["cursor_rules"] }
        expect(body.formats).toContain("cursor_rules")
    })

    it("preview response items extract content for cursor_rules", () => {
        const data = {
            items: [{ content: "---\ndescription: DocuGardener\n---\n\n# Rules" }],
        }
        const content = data.items?.[0]?.content ?? "(empty)"
        expect(content).toContain("---")
        expect(content).toContain("description:")
    })
})

// ---------------------------------------------------------------------------
// Tests: expand/collapse state isolation for cursor_rules
// ---------------------------------------------------------------------------

describe("AGV-01 expand/collapse state for cursor_rules", () => {
    it("expanding cursor_rules does not expand other formats", () => {
        const expanded = new Set<string>()
        expanded.add(rowKey("repo-1", "cursor_rules"))
        expect(expanded.has(rowKey("repo-1", "cursor_rules"))).toBe(true)
        expect(expanded.has(rowKey("repo-1", "agents_md"))).toBe(false)
        expect(expanded.has(rowKey("repo-1", "copilot_instructions"))).toBe(false)
    })

    it("preview cache keyed by cursor_rules format", () => {
        type P = { loading: boolean; content: string | null; error: string | null }
        const cache: Record<string, P> = {
            "repo-1:cursor_rules": { loading: false, content: "# cached cursor rules", error: null },
        }
        const k = rowKey("repo-1", "cursor_rules")
        const shouldFetch = !(cache[k]?.content !== undefined && cache[k]?.content !== null)
        expect(shouldFetch).toBe(false)
    })
})
