import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RecentActivity } from '../components/dashboard/RecentActivity'

vi.mock('lucide-react', () => ({
    Activity: () => <svg data-testid="activity-icon" />,
    GitPullRequest: () => <svg data-testid="pr-icon" />,
    CheckCircle2: () => <svg data-testid="check-icon" />,
    XCircle: () => <svg data-testid="x-icon" />,
    Clock: () => <svg data-testid="clock-icon" />,
}))

const baseJob = {
    id: 'job-1',
    repo: 'docugardener-core',
    pr: 42,
    drift: 35,
    date: new Date('2026-02-20T12:00:00Z'),
}

describe('RecentActivity', () => {
    it('renders nothing when activity list is empty', () => {
        const { container } = render(<RecentActivity activity={[]} />)
        // Should render but with no job rows
        expect(container.querySelectorAll('[data-testid="activity-row"]').length).toBe(0)
    })

    it('renders the repo name and drift score for a completed job', () => {
        render(
            <RecentActivity
                activity={[{ ...baseJob, status: 'COMPLETED' }]}
            />
        )
        expect(screen.getByText('docugardener-core')).toBeInTheDocument()
        expect(screen.getByText(/35/)).toBeInTheDocument()
    })

    it('renders a PROCESSING status job without crashing', () => {
        render(
            <RecentActivity
                activity={[{ ...baseJob, status: 'PROCESSING', drift: 0 }]}
            />
        )
        expect(screen.getByText('docugardener-core')).toBeInTheDocument()
    })
})
