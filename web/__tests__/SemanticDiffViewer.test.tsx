import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { SemanticDiffViewer } from '../components/inbox/SemanticDiffViewer'

// Stub LiveCodeBlock to avoid GitHub API calls and shiki WASM in tests
vi.mock('../components/editor/LiveCodeBlock', () => ({
    LiveCodeBlock: ({ owner, repo, filePath, driftStatus }: any) => (
        <div
            data-testid="live-code-block"
            data-owner={owner}
            data-repo={repo}
            data-file={filePath}
            data-drift={driftStatus}
        />
    ),
}))

vi.mock('lucide-react', () => ({
    Check: () => <svg data-testid="check-icon" />,
    X: () => <svg data-testid="x-icon" />,
    FileCode: () => <svg data-testid="file-icon" />,
    Code2: () => <svg data-testid="code2-icon" />,
    ShieldAlert: () => <svg data-testid="shield-alert-icon" />,
    ShieldCheck: () => <svg data-testid="shield-check-icon" />,
    AlertTriangle: () => <svg data-testid="alert-triangle-icon" />,
    GitPullRequest: () => <svg data-testid="git-pr-icon" />,
    Zap: () => <svg data-testid="zap-icon" />,
    Clock: () => <svg data-testid="clock-icon" />,
    CheckCircle2: () => <svg data-testid="check-circle2-icon" />,
    XCircle: () => <svg data-testid="x-circle-icon" />,
    ExternalLink: () => <svg data-testid="external-link-icon" />,
    ChevronRight: () => <svg data-testid="chevron-right-icon" />,
    ChevronDown: () => <svg data-testid="chevron-down-icon" />,
    CircleDashed: () => <svg data-testid="circle-dashed-icon" />,
    Loader2: () => <svg data-testid="loader2-icon" />,
}))

vi.mock('@/components/ui/button', () => ({
    Button: ({ children, onClick, disabled, asChild, ...props }: any) =>
        asChild ? <div {...props}>{children}</div> : <button onClick={onClick} disabled={disabled} {...props}>{children}</button>,
}))

vi.mock('@/components/ui/badge', () => ({
    Badge: ({ children, className }: any) => <span className={className}>{children}</span>,
}))

vi.mock('@/lib/utils', () => ({
    cn: (...args: any[]) => args.filter(Boolean).join(' '),
}))

const baseAlert = {
    id: 'job-1',
    repositoryName: 'docugardener-core',
    repoOwner: 'my-org',
    headSha: 'abc1234def5678',
    prNumber: 42,
    driftScore: 75,
    result: null,
}

const makeItem = (file_path: string, severity = 'medium') => ({
    file_path,
    severity,
    current_content: 'Old doc content',
    semantic_change: 'Function signature changed',
    reasoning: 'The parameter list was modified.',
})

describe('SemanticDiffViewer', () => {
    it('renders the header with repo name and PR number', () => {
        render(
            <SemanticDiffViewer
                alert={baseAlert}
                onAccept={vi.fn()}
                onIgnore={vi.fn()}
            />
        )
        expect(screen.getByText('docugardener-core')).toBeInTheDocument()
        expect(screen.getByText(/PR #42/)).toBeInTheDocument()
        expect(screen.getByText(/75\/100/)).toBeInTheDocument()
    })

    it('shows the commit SHA badge in header when headSha is set', () => {
        render(
            <SemanticDiffViewer
                alert={baseAlert}
                onAccept={vi.fn()}
                onIgnore={vi.fn()}
            />
        )
        // headSha.substring(0, 7) = 'abc1234'
        expect(screen.getByText(/abc1234/)).toBeInTheDocument()
    })

    it('shows empty state when no drift items', () => {
        render(
            <SemanticDiffViewer
                alert={{ ...baseAlert, result: { drift_analysis: { items: [] } } }}
                onAccept={vi.fn()}
                onIgnore={vi.fn()}
            />
        )
        expect(screen.getByText('No semantic drift items detected')).toBeInTheDocument()
    })

    it('renders a LiveCodeBlock with driftStatus=drifted for high severity items', () => {
        const result = { drift_analysis: { items: [makeItem('src/api.ts', 'high')] } }
        render(
            <SemanticDiffViewer
                alert={{ ...baseAlert, result }}
                onAccept={vi.fn()}
                onIgnore={vi.fn()}
            />
        )
        // In the compact table design, expand the row then click Show code
        fireEvent.click(screen.getByText('src/api.ts').closest('[style]') ?? screen.getByText('src/api.ts'))
        fireEvent.click(screen.getByText('Show code'))
        const lcb = screen.getByTestId('live-code-block')
        expect(lcb).toBeInTheDocument()
        expect(lcb).toHaveAttribute('data-drift', 'drifted')
        expect(lcb).toHaveAttribute('data-owner', 'my-org')
        expect(lcb).toHaveAttribute('data-repo', 'docugardener-core')
        expect(lcb).toHaveAttribute('data-file', 'src/api.ts')
    })

    it('renders a LiveCodeBlock with driftStatus=synced for medium severity items', () => {
        const result = { drift_analysis: { items: [makeItem('README.md', 'medium')] } }
        render(
            <SemanticDiffViewer
                alert={{ ...baseAlert, result }}
                onAccept={vi.fn()}
                onIgnore={vi.fn()}
            />
        )
        // Expand the row then show code
        fireEvent.click(screen.getByText('README.md').closest('[style]') ?? screen.getByText('README.md'))
        fireEvent.click(screen.getByText('Show code'))
        expect(screen.getByTestId('live-code-block')).toHaveAttribute('data-drift', 'synced')
    })

    it('does NOT render LiveCodeBlock when headSha is null (legacy job)', () => {
        const result = { drift_analysis: { items: [makeItem('src/api.ts', 'high')] } }
        render(
            <SemanticDiffViewer
                alert={{ ...baseAlert, headSha: null, result }}
                onAccept={vi.fn()}
                onIgnore={vi.fn()}
            />
        )
        // Expand the row and click Show code — LiveCodeBlock should not appear because headSha is null
        fireEvent.click(screen.getByText('src/api.ts').closest('[style]') ?? screen.getByText('src/api.ts'))
        fireEvent.click(screen.getByText('Show code'))
        expect(screen.queryByTestId('live-code-block')).not.toBeInTheDocument()
    })

    it('shows "View Pull Request" button and hides triage buttons when fixPrUrl is set', () => {
        render(
            <SemanticDiffViewer
                alert={{ ...baseAlert, fixPrUrl: 'https://github.com/my-org/repo/pull/99' }}
                onAccept={vi.fn()}
                onIgnore={vi.fn()}
            />
        )
        expect(screen.getByText('View Pull Request')).toBeInTheDocument()
        expect(screen.queryByText('No Update Required')).not.toBeInTheDocument()
    })

    describe('Issue 4 — AI Author in-progress spinner', () => {
        it('shows spinner badge when autoFixEnqueued=true and fixPrUrl is absent', () => {
            render(
                <SemanticDiffViewer
                    alert={{ ...baseAlert, autoFixEnqueued: true }}
                    onAccept={vi.fn()}
                    onIgnore={vi.fn()}
                />
            )
            expect(screen.getByText(/AI generating fix PR/i)).toBeInTheDocument()
            expect(screen.queryByText('Accept Changes')).not.toBeInTheDocument()
            expect(screen.queryByText('No Update Required')).not.toBeInTheDocument()
        })

        it('does NOT show spinner when autoFixEnqueued=true and fixPrUrl is present', () => {
            render(
                <SemanticDiffViewer
                    alert={{ ...baseAlert, autoFixEnqueued: true, fixPrUrl: 'https://github.com/org/repo/pull/1' }}
                    onAccept={vi.fn()}
                    onIgnore={vi.fn()}
                />
            )
            expect(screen.queryByText(/AI generating fix PR/i)).not.toBeInTheDocument()
        })

        it('shows Accept/Ignore when autoFixEnqueued=false and no fixPrUrl', () => {
            render(
                <SemanticDiffViewer
                    alert={{ ...baseAlert, autoFixEnqueued: false }}
                    onAccept={vi.fn()}
                    onIgnore={vi.fn()}
                />
            )
            expect(screen.getByText('Accept Changes')).toBeInTheDocument()
            expect(screen.queryByText(/AI generating fix PR/i)).not.toBeInTheDocument()
        })

        it('does NOT show spinner when aiAuthored=true but autoFixEnqueued=false (no docs to fix)', () => {
            render(
                <SemanticDiffViewer
                    alert={{ ...baseAlert, aiAuthored: true, autoFixEnqueued: false }}
                    onAccept={vi.fn()}
                    onIgnore={vi.fn()}
                />
            )
            expect(screen.queryByText(/AI generating fix PR/i)).not.toBeInTheDocument()
            expect(screen.getByText('Accept Changes')).toBeInTheDocument()
        })
    })

    describe('Issue 3 — Policy violation next steps panel', () => {
        const makeViolation = (docs_missing: string[]) => ({
            rule_name: 'api-contract-required',
            enforcement: 'blocking',
            paths_matched: ['src/payments.py'],
            require_docs: docs_missing,
            docs_present: [],
            docs_missing,
        })

        it('renders "Recommended Next Steps" when policy violations include missing docs', () => {
            render(
                <SemanticDiffViewer
                    alert={{
                        ...baseAlert,
                        result: { policy_violations: [makeViolation(['docs/api-contract.md'])] },
                    }}
                    onAccept={vi.fn()}
                    onIgnore={vi.fn()}
                />
            )
            const heading = screen.getByText(/Recommended Next Steps/i)
            expect(heading).toBeInTheDocument()
            // Check the next-steps panel contains the missing doc path
            const panel = heading.closest('div') as HTMLElement
            expect(within(panel).getByText(/docs\/api-contract\.md/i)).toBeInTheDocument()
        })

        it('deduplicates missing docs across multiple violations in next steps panel', () => {
            render(
                <SemanticDiffViewer
                    alert={{
                        ...baseAlert,
                        result: {
                            policy_violations: [
                                makeViolation(['docs/api-contract.md', 'docs/changelog.md']),
                                makeViolation(['docs/api-contract.md']),
                            ],
                        },
                    }}
                    onAccept={vi.fn()}
                    onIgnore={vi.fn()}
                />
            )
            const heading = screen.getByText(/Recommended Next Steps/i)
            const panel = heading.closest('div') as HTMLElement
            const mentions = within(panel).getAllByText(/docs\/api-contract\.md/i)
            expect(mentions.length).toBe(1)
        })

        it('does NOT render next steps panel when there are no policy violations', () => {
            render(
                <SemanticDiffViewer
                    alert={{ ...baseAlert, result: { policy_violations: [] } }}
                    onAccept={vi.fn()}
                    onIgnore={vi.fn()}
                />
            )
            expect(screen.queryByText(/Recommended Next Steps/i)).not.toBeInTheDocument()
        })
    })
})
