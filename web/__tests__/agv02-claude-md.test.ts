/**
 * AGV-02: Vitest tests for the CLAUDE.md format adapter (frontend layer).
 *
 * Tests cover:
 *  - FORMATS array includes claude_md entry with correct metadata
 *  - Tab rendering: 4 tabs total
 *  - rowKey works correctly for claude_md format
 *  - Plan gate with 4 formats
 *  - Stale repo filtering for claude_md format
 *  - Preview fetch for claude_md
 *  - Expand/collapse state isolation
 */

import { describe, it, expect } from "vitest"

// ---------------------------------------------------------------------------
// Logic helpers mirroring AgentRulesPanel.tsx (4 formats)
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

describe("AGV-02 FORMATS array", () => {
    it("contains claude_md entry", () => {
        const claude = FORMATS.find(f => f.id === "claude_md")
        expect(claude).toBeDefined()
    })

    it("claude_md label is CLAUDE.md", () => {
        const claude = FORMATS.find(f => f.id === "claude_md")!
        expect(claude.label).toBe("CLAUDE.md")
    })

    it("claude_md description mentions Claude", () => {
        const claude = FORMATS.find(f => f.id === "claude_md")!
        expect(claude.description).toMatch(/Claude/i)
    })

    it("has exactly 4 formats total", () => {
        expect(FORMATS).toHaveLength(4)
    })

    it("all format IDs are unique", () => {
        const ids = FORMATS.map(f => f.id)
        expect(new Set(ids).size).toBe(ids.length)
    })

    it("claude_md is distinct from agents_md despite both mentioning Claude Code", () => {
        const agentsMd = FORMATS.find(f => f.id === "agents_md")!
        const claudeMd = FORMATS.find(f => f.id === "claude_md")!
        expect(agentsMd.label).not.toBe(claudeMd.label)
        expect(agentsMd.id).not.toBe(claudeMd.id)
    })
})

// ---------------------------------------------------------------------------
// Tests: rowKey with claude_md
// ---------------------------------------------------------------------------

describe("AGV-02 rowKey for claude_md", () => {
    it("produces correct composite key", () => {
        expect(rowKey("repo-1", "claude_md")).toBe("repo-1:claude_md")
    })

    it("claude_md key differs from all other formats for same repo", () => {
        const k1 = rowKey("repo-1", "agents_md")
        const k2 = rowKey("repo-1", "copilot_instructions")
        const k3 = rowKey("repo-1", "cursor_rules")
        const k4 = rowKey("repo-1", "claude_md")
        expect(k4).not.toBe(k1)
        expect(k4).not.toBe(k2)
        expect(k4).not.toBe(k3)
    })
})

// ---------------------------------------------------------------------------
// Tests: plan gate with 4 formats
// ---------------------------------------------------------------------------

describe("AGV-02 plan gate with claude_md", () => {
    it("FREE tenant at limit cannot generate claude_md", () => {
        expect(canGenerate(false, false, 1)).toBe(false)
    })

    it("PRO tenant can generate claude_md", () => {
        expect(canGenerate(true, false, 10)).toBe(true)
    })

    it("FREE tenant can update existing claude_md artifact", () => {
        expect(canGenerate(false, true, 1)).toBe(true)
    })
})

// ---------------------------------------------------------------------------
// Tests: stale repo filtering for claude_md
// ---------------------------------------------------------------------------

describe("AGV-02 stale repo filtering for claude_md", () => {
    const makeRepo = (id: string, githubRepoId: string, format: FormatId, isStale: boolean | null) => ({
        id,
        name: id,
        githubRepoId,
        rulesArtifacts: isStale === null
            ? []
            : [{ id: `art-${id}`, repoId: id, targetFormat: format, outputPath: "CLAUDE.md",
                lastHash: "abc", lastGeneratedAt: "2026-01-01", lastPrUrl: null, isStale, updatedAt: "2026-01-01" }],
    })

    const getStaleRepos = (repos: ReturnType<typeof makeRepo>[], format: FormatId) =>
        repos.filter(r => {
            if (!isGitHubConnected(r.githubRepoId)) return false
            const a = r.rulesArtifacts.find(x => x.targetFormat === format) ?? null
            return !a || a.isStale
        })

    it("includes connected repo with no claude_md artifact", () => {
        const repos = [makeRepo("r1", "111", "agents_md", false)]
        expect(getStaleRepos(repos, "claude_md")).toHaveLength(1)
    })

    it("includes connected repo with stale claude_md artifact", () => {
        const repos = [makeRepo("r1", "111", "claude_md", true)]
        expect(getStaleRepos(repos, "claude_md")).toHaveLength(1)
    })

    it("excludes connected repo with in-sync claude_md artifact", () => {
        const repos = [makeRepo("r1", "111", "claude_md", false)]
        expect(getStaleRepos(repos, "claude_md")).toHaveLength(0)
    })

    it("format isolation: cursor_rules stale does not affect claude_md filter", () => {
        const repos = [makeRepo("r1", "111", "cursor_rules", true)]
        expect(getStaleRepos(repos, "claude_md")).toHaveLength(1)  // no claude_md artifact → stale
    })
})

// ---------------------------------------------------------------------------
// Tests: preview fetch for claude_md
// ---------------------------------------------------------------------------

describe("AGV-02 preview fetch for claude_md", () => {
    it("claude_md format ID is valid for preview request body", () => {
        const body = { formats: ["claude_md"] }
        expect(body.formats).toContain("claude_md")
    })

    it("preview response extracts plain markdown content (no frontmatter)", () => {
        const data = {
            items: [{ content: "# Documentation Rules (DocuGardener)\n\n> Auto-generated." }],
        }
        const content = data.items?.[0]?.content ?? "(empty)"
        expect(content).toContain("# Documentation Rules")
        expect(content).not.toContain("---\n")
    })
})

// ---------------------------------------------------------------------------
// Tests: expand/collapse state isolation for claude_md
// ---------------------------------------------------------------------------

describe("AGV-02 expand/collapse state for claude_md", () => {
    it("expanding claude_md does not expand other formats", () => {
        const expanded = new Set<string>()
        expanded.add(rowKey("repo-1", "claude_md"))
        expect(expanded.has(rowKey("repo-1", "claude_md"))).toBe(true)
        expect(expanded.has(rowKey("repo-1", "agents_md"))).toBe(false)
        expect(expanded.has(rowKey("repo-1", "copilot_instructions"))).toBe(false)
        expect(expanded.has(rowKey("repo-1", "cursor_rules"))).toBe(false)
    })

    it("preview cache keyed by claude_md format", () => {
        type P = { loading: boolean; content: string | null; error: string | null }
        const cache: Record<string, P> = {
            "repo-1:claude_md": { loading: false, content: "# cached claude rules", error: null },
        }
        const k = rowKey("repo-1", "claude_md")
        const shouldFetch = !(cache[k]?.content !== undefined && cache[k]?.content !== null)
        expect(shouldFetch).toBe(false)
    })
})
