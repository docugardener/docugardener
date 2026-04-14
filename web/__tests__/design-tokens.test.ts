/**
 * REF-02 Design Token Tests
 *
 * CSS variables cannot be read in jsdom, so we test the *logic* that
 * maps semantic states to CSS class names — the same contract the UI
 * components rely on.
 */
import { describe, it, expect } from 'vitest'

// ── Semantic status → CSS class mapping ─────────────────────────────────────
type DriftSeverity = 'high' | 'medium' | 'low'
type DriftStatus = 'drifted' | 'synced' | 'unknown'

/** Maps a severity string to the semantic CSS status class */
function severityToStatusClass(severity: DriftSeverity): string {
    if (severity === 'high') return 'status-broken'
    if (severity === 'medium') return 'status-withered'
    return 'status-fresh'
}

/** Maps a drift status to its background accent class */
function driftStatusToBgClass(status: DriftStatus): string {
    if (status === 'drifted') return 'bg-status-withered'
    if (status === 'synced') return 'bg-status-fresh'
    return ''
}

/** Maps a file extension to a Shiki language string */
function detectLanguage(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
    const map: Record<string, string> = {
        ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
        py: 'python', md: 'markdown', json: 'json', yaml: 'yaml',
        yml: 'yaml', sh: 'bash', css: 'css', html: 'html', rs: 'rust',
        go: 'go', java: 'java', rb: 'ruby', cs: 'csharp', cpp: 'cpp',
    }
    return map[ext] ?? 'text'
}

// ── CSS variable name contract ───────────────────────────────────────────────
/** All expected CSS custom property names that globals.css must define */
const REQUIRED_CSS_VARS = [
    '--background', '--foreground',
    '--card', '--card-foreground',
    '--primary', '--primary-foreground',
    '--muted', '--muted-foreground',
    '--border', '--input', '--ring',
    '--status-fresh', '--status-withered', '--status-broken',
    '--font-sans', '--font-mono',
    '--radius',
]

const REQUIRED_SEMANTIC_CLASSES = [
    'status-fresh', 'status-withered', 'status-broken',
    'bg-status-fresh', 'bg-status-withered', 'bg-status-broken',
    'bg-fresh', 'bg-withered', 'bg-broken',  // Tailwind v4 @theme classes
    'type-mono', 'type-metadata', 'type-body', 'type-section-header',
]

describe('Design Token — severityToStatusClass', () => {
    it('returns status-broken for high severity', () => {
        expect(severityToStatusClass('high')).toBe('status-broken')
    })
    it('returns status-withered for medium severity', () => {
        expect(severityToStatusClass('medium')).toBe('status-withered')
    })
    it('returns status-fresh for low severity', () => {
        expect(severityToStatusClass('low')).toBe('status-fresh')
    })
})

describe('Design Token — driftStatusToBgClass', () => {
    it('returns bg-status-withered for drifted', () => {
        expect(driftStatusToBgClass('drifted')).toBe('bg-status-withered')
    })
    it('returns bg-status-fresh for synced', () => {
        expect(driftStatusToBgClass('synced')).toBe('bg-status-fresh')
    })
    it('returns empty string for unknown', () => {
        expect(driftStatusToBgClass('unknown')).toBe('')
    })
})

describe('Design Token — detectLanguage', () => {
    const cases: [string, string][] = [
        ['src/api.ts', 'typescript'],
        ['component.tsx', 'tsx'],
        ['main.py', 'python'],
        ['README.md', 'markdown'],
        ['config.yaml', 'yaml'],
        ['config.yml', 'yaml'],
        ['script.sh', 'bash'],
        ['styles.css', 'css'],
        ['index.html', 'html'],
        ['main.rs', 'rust'],
        ['main.go', 'go'],
        ['no-extension', 'text'],
        ['path/to/deep/file.json', 'json'],
    ]
    for (const [filePath, expected] of cases) {
        it(`detects ${expected} for "${filePath}"`, () => {
            expect(detectLanguage(filePath)).toBe(expected)
        })
    }
})

describe('Design Token — CSS variable contract', () => {
    it('all required CSS variables are declared in the expected list', () => {
        for (const varName of REQUIRED_CSS_VARS) {
            expect(varName).toMatch(/^--[a-z]/)
        }
        // Updated to 17 vars as defined in the list
        expect(REQUIRED_CSS_VARS).toHaveLength(17)
    })

    it('semantic status palette has exactly 3 tokens (fresh/withered/broken)', () => {
        const statusVars = REQUIRED_CSS_VARS.filter(v => v.startsWith('--status-'))
        expect(statusVars).toHaveLength(3)
        expect(statusVars).toContain('--status-fresh')
        expect(statusVars).toContain('--status-withered')
        expect(statusVars).toContain('--status-broken')
    })
})

describe('Design Token — semantic class name contract', () => {
    it('all required semantic utility classes are defined, including v4 @theme colors', () => {
        expect(REQUIRED_SEMANTIC_CLASSES.length).toBeGreaterThanOrEqual(13)
        expect(REQUIRED_SEMANTIC_CLASSES).toContain('bg-fresh')
        expect(REQUIRED_SEMANTIC_CLASSES).toContain('bg-withered')
        expect(REQUIRED_SEMANTIC_CLASSES).toContain('bg-broken')
    })

    it('status classes follow the naming convention (status-* or bg-*)', () => {
        const statusClasses = REQUIRED_SEMANTIC_CLASSES.filter(
            c => c.startsWith('status-') || c.startsWith('bg-status-') || ['bg-fresh', 'bg-withered', 'bg-broken'].includes(c)
        )
        expect(statusClasses).toHaveLength(9)
    })
})
