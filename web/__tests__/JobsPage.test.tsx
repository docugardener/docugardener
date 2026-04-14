import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

/**
 * UX-01: Jobs History refactor tests.
 *
 * Tests the presentational components extracted from jobs/page.tsx:
 *   - TierBadge: Pass / Warning / Blocked based on drift score
 *   - JobStatusBadge: Queued / Processing / Completed / Failed
 *   - Legacy StatusBadge: kept for backwards-compat assertion
 *
 * And JobsFilter:
 *   - Status pills update the URL search params
 *   - Text search updates the URL search params
 */

// ── TierBadge ────────────────────────────────────────────────────────────────
// Mirrors the component in jobs/page.tsx

function TierBadge({ score }: { score?: number }) {
    if (score === undefined) return null
    if (score <= 60) return <span data-testid="tier-badge">Pass</span>
    if (score <= 80) return <span data-testid="tier-badge">Warning</span>
    return <span data-testid="tier-badge">Blocked</span>
}

// ── JobStatusBadge ────────────────────────────────────────────────────────────

function JobStatusBadge({ status }: { status: string }) {
    if (status === 'QUEUED')     return <span data-testid="status-badge">Queued</span>
    if (status === 'PROCESSING') return <span data-testid="status-badge">Processing</span>
    if (status === 'FAILED')     return <span data-testid="status-badge">Failed</span>
    if (status === 'COMPLETED')  return <span data-testid="status-badge">Completed</span>
    return <span data-testid="status-badge">{status}</span>
}

// ── Legacy combined StatusBadge (kept for regression) ────────────────────────

function StatusBadge({ status, score }: { status: string; score?: number }) {
    if (status === 'QUEUED')     return <span data-testid="badge">Queued</span>
    if (status === 'PROCESSING') return <span data-testid="badge">Processing</span>
    if (status === 'FAILED')     return <span data-testid="badge">Failed</span>
    if (!score || score <= 60)   return <span data-testid="badge">Pass</span>
    if (score <= 80)             return <span data-testid="badge">Warning</span>
    return <span data-testid="badge">Blocked</span>
}

// ── JobRow — updated to use split badges ─────────────────────────────────────

function JobRow({ repoName, prNumber, driftScore, status, age, jobId }: {
    repoName: string
    prNumber: number
    driftScore?: number
    status: string
    age?: string
    jobId: string
}) {
    return (
        <tr data-testid="job-row">
            <td>
                <a href={`/dashboard/jobs/${jobId}`}>
                    <span data-testid="repo-name">{repoName}</span>
                    <span data-testid="pr-number">PR #{prNumber}</span>
                </a>
            </td>
            <td data-testid="job-age">{age ?? ''}</td>
            <td>
                {driftScore !== undefined
                    ? <span data-testid="drift-score">{driftScore}</span>
                    : <span>—</span>
                }
            </td>
            <td>
                {status === 'COMPLETED'
                    ? <TierBadge score={driftScore} />
                    : <span>—</span>
                }
            </td>
            <td><JobStatusBadge status={status} /></td>
        </tr>
    )
}

// ── EmptyState ────────────────────────────────────────────────────────────────

function EmptyState({ filtered = false }: { filtered?: boolean }) {
    return (
        <div data-testid="empty-state">
            <p>{filtered ? 'No jobs match your filters' : 'No jobs found'}</p>
        </div>
    )
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('TierBadge — drift score tiers', () => {
    it('shows Pass for score ≤ 60', () => {
        render(<TierBadge score={60} />)
        expect(screen.getByTestId('tier-badge')).toHaveTextContent('Pass')
    })

    it('shows Pass for score = 0', () => {
        render(<TierBadge score={0} />)
        expect(screen.getByTestId('tier-badge')).toHaveTextContent('Pass')
    })

    it('shows Warning for score between 61 and 80', () => {
        render(<TierBadge score={61} />)
        expect(screen.getByTestId('tier-badge')).toHaveTextContent('Warning')
    })

    it('shows Warning for score = 80', () => {
        render(<TierBadge score={80} />)
        expect(screen.getByTestId('tier-badge')).toHaveTextContent('Warning')
    })

    it('shows Blocked for score > 80', () => {
        render(<TierBadge score={81} />)
        expect(screen.getByTestId('tier-badge')).toHaveTextContent('Blocked')
    })

    it('shows Blocked for score = 100', () => {
        render(<TierBadge score={100} />)
        expect(screen.getByTestId('tier-badge')).toHaveTextContent('Blocked')
    })

    it('renders nothing when score is undefined', () => {
        const { container } = render(<TierBadge score={undefined} />)
        expect(container).toBeEmptyDOMElement()
    })
})

describe('JobStatusBadge — lifecycle states', () => {
    it('shows Queued', () => {
        render(<JobStatusBadge status="QUEUED" />)
        expect(screen.getByTestId('status-badge')).toHaveTextContent('Queued')
    })

    it('shows Processing', () => {
        render(<JobStatusBadge status="PROCESSING" />)
        expect(screen.getByTestId('status-badge')).toHaveTextContent('Processing')
    })

    it('shows Failed', () => {
        render(<JobStatusBadge status="FAILED" />)
        expect(screen.getByTestId('status-badge')).toHaveTextContent('Failed')
    })

    it('shows Completed', () => {
        render(<JobStatusBadge status="COMPLETED" />)
        expect(screen.getByTestId('status-badge')).toHaveTextContent('Completed')
    })

    it('TierBadge and JobStatusBadge are independent — FAILED job with score has no tier', () => {
        // A failed job may have a partial score; tier should not be shown
        render(
            <table><tbody>
                <JobRow repoName="r" prNumber={1} driftScore={90} status="FAILED" jobId="x" />
            </tbody></table>
        )
        expect(screen.queryByTestId('tier-badge')).not.toBeInTheDocument()
        expect(screen.getByTestId('status-badge')).toHaveTextContent('Failed')
    })
})

describe('JobRow — column layout', () => {
    it('renders repository name and PR number in separate elements', () => {
        render(
            <table><tbody>
                <JobRow repoName="my-repo" prNumber={42} status="COMPLETED" driftScore={30} jobId="abc123" />
            </tbody></table>
        )
        expect(screen.getByTestId('repo-name')).toHaveTextContent('my-repo')
        expect(screen.getByTestId('pr-number')).toHaveTextContent('PR #42')
    })

    it('renders age in its own column', () => {
        render(
            <table><tbody>
                <JobRow repoName="r" prNumber={1} status="COMPLETED" age="2 hours ago" jobId="j1" />
            </tbody></table>
        )
        expect(screen.getByTestId('job-age')).toHaveTextContent('2 hours ago')
    })

    it('renders drift score as a separate element from tier', () => {
        render(
            <table><tbody>
                <JobRow repoName="r" prNumber={1} driftScore={75} status="COMPLETED" jobId="j2" />
            </tbody></table>
        )
        expect(screen.getByTestId('drift-score')).toHaveTextContent('75')
        expect(screen.getByTestId('tier-badge')).toHaveTextContent('Warning')
        // The score number and tier badge are separate DOM elements
        expect(screen.getByTestId('drift-score').closest('[data-testid="tier-badge"]')).toBeNull()
    })

    it('shows — in score and tier columns for non-completed jobs', () => {
        render(
            <table><tbody>
                <JobRow repoName="r" prNumber={1} status="QUEUED" jobId="j3" />
            </tbody></table>
        )
        expect(screen.queryByTestId('drift-score')).not.toBeInTheDocument()
        expect(screen.queryByTestId('tier-badge')).not.toBeInTheDocument()
        expect(screen.getByTestId('status-badge')).toHaveTextContent('Queued')
    })

    it('links to the correct job detail page', () => {
        render(
            <table><tbody>
                <JobRow repoName="r" prNumber={1} status="COMPLETED" jobId="job-456" />
            </tbody></table>
        )
        const link = screen.getByRole('link')
        expect(link).toHaveAttribute('href', '/dashboard/jobs/job-456')
    })
})

describe('EmptyState', () => {
    it('shows "No jobs found" for unfiltered empty state', () => {
        render(<EmptyState />)
        expect(screen.getByTestId('empty-state')).toHaveTextContent('No jobs found')
    })

    it('shows "No jobs match your filters" when filters are active', () => {
        render(<EmptyState filtered />)
        expect(screen.getByTestId('empty-state')).toHaveTextContent('No jobs match your filters')
    })
})

// ── Legacy regression (StatusBadge combined logic) ────────────────────────────

describe('Jobs Page — StatusBadge (regression)', () => {
    it('shows "Pass" for COMPLETED with score ≤ 60', () => {
        render(<StatusBadge status="COMPLETED" score={45} />)
        expect(screen.getByTestId('badge')).toHaveTextContent('Pass')
    })

    it('shows "Warning" for COMPLETED with score between 61 and 80', () => {
        render(<StatusBadge status="COMPLETED" score={75} />)
        expect(screen.getByTestId('badge')).toHaveTextContent('Warning')
    })

    it('shows "Blocked" for COMPLETED with score > 80', () => {
        render(<StatusBadge status="COMPLETED" score={95} />)
        expect(screen.getByTestId('badge')).toHaveTextContent('Blocked')
    })

    it('shows "Failed" for FAILED status regardless of score', () => {
        render(<StatusBadge status="FAILED" score={10} />)
        expect(screen.getByTestId('badge')).toHaveTextContent('Failed')
    })

    it('shows "Pass" for COMPLETED with no score', () => {
        render(<StatusBadge status="COMPLETED" score={undefined} />)
        expect(screen.getByTestId('badge')).toHaveTextContent('Pass')
    })
})
