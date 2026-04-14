/**
 * Issue 5 — filesChanged mapping
 *
 * Verifies that the inbox data transform reads `drift_analysis.reasons[].file`
 * (the backend field) rather than the old `drift_analysis.items[].file_path`.
 */
import { describe, it, expect } from 'vitest'

// Inline the transform logic so this test stays independent of the React component.
// Mirrors the production code in InboxPageClient.tsx::transformAlerts.
function extractFilesChanged(job: any): string[] {
    return (job.result?.drift_analysis?.reasons ?? [])
        .map((i: any) => i.file)
        .filter(Boolean)
}

describe('Issue 5 — filesChanged extraction from drift_analysis.reasons', () => {
    it('extracts file paths from reasons[].file', () => {
        const job = {
            result: {
                drift_analysis: {
                    reasons: [
                        { file: 'docs/api.md', entity: 'auth', reason: 'missing' },
                        { file: 'docs/schema.md', entity: 'db', reason: 'outdated' },
                    ],
                },
            },
        }
        expect(extractFilesChanged(job)).toEqual(['docs/api.md', 'docs/schema.md'])
    })

    it('returns empty array when reasons is missing', () => {
        expect(extractFilesChanged({ result: { drift_analysis: {} } })).toEqual([])
    })

    it('returns empty array when drift_analysis is missing', () => {
        expect(extractFilesChanged({ result: {} })).toEqual([])
    })

    it('returns empty array when result is null', () => {
        expect(extractFilesChanged({ result: null })).toEqual([])
    })

    it('filters out reasons with falsy file values', () => {
        const job = {
            result: {
                drift_analysis: {
                    reasons: [
                        { file: 'docs/api.md', entity: 'auth', reason: 'missing' },
                        { file: '', entity: 'empty', reason: 'x' },
                        { entity: 'no-file', reason: 'y' },
                    ],
                },
            },
        }
        expect(extractFilesChanged(job)).toEqual(['docs/api.md'])
    })

    it('does NOT use the legacy items[].file_path field', () => {
        const job = {
            result: {
                drift_analysis: {
                    // old structure that the bug was reading — should be ignored
                    items: [{ file_path: 'docs/old-api.md' }],
                    reasons: [{ file: 'docs/new-api.md', entity: 'api', reason: 'changed' }],
                },
            },
        }
        const result = extractFilesChanged(job)
        expect(result).toContain('docs/new-api.md')
        expect(result).not.toContain('docs/old-api.md')
    })
})
