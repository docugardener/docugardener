import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Sidebar } from '../components/layout/Sidebar'

// Stub global fetch for inbox badge tests
const mockFetch = vi.fn()
global.fetch = mockFetch as any

// Mock next/navigation
const mockPathname = vi.fn(() => '/dashboard/inbox')
vi.mock('next/navigation', () => ({
    usePathname: () => mockPathname(),
}))

// Mock next/link
vi.mock('next/link', () => ({
    default: ({ href, children, className }: any) => (
        <a href={href} className={className}>{children}</a>
    ),
}))

// Mock next-auth/react
vi.mock('next-auth/react', () => ({
    useSession: () => ({
        data: {
            user: {
                name: 'Test User',
                email: 'test@example.com',
                image: null,
                role: 'ADMIN',
            },
        },
    }),
    signOut: vi.fn(),
}))

describe('Sidebar', () => {
    beforeEach(() => {
        mockPathname.mockReturnValue('/dashboard/inbox')
        // Default fetch: empty inbox
        mockFetch.mockResolvedValue({ ok: true, json: async () => [] })
    })

    describe('Main navigation', () => {
        it('renders Inbox, Jobs, and Reports in the main nav', () => {
            render(<Sidebar />)
            expect(screen.getByRole('link', { name: /inbox/i })).toBeInTheDocument()
            expect(screen.getByRole('link', { name: /jobs/i })).toBeInTheDocument()
            expect(screen.getByRole('link', { name: /reports/i })).toBeInTheDocument()
        })

        it('Inbox links to /dashboard/inbox', () => {
            render(<Sidebar />)
            const inboxLink = screen.getByRole('link', { name: /^inbox$/i })
            expect(inboxLink).toHaveAttribute('href', '/dashboard/inbox')
        })

        it('Jobs links to /dashboard/jobs', () => {
            render(<Sidebar />)
            const jobsLink = screen.getByRole('link', { name: /^jobs$/i })
            expect(jobsLink).toHaveAttribute('href', '/dashboard/jobs')
        })

        it('Reports links to /dashboard/reports', () => {
            render(<Sidebar />)
            const reportsLink = screen.getByRole('link', { name: /^reports$/i })
            expect(reportsLink).toHaveAttribute('href', '/dashboard/reports')
        })

        it('applies active style to Inbox when on /dashboard/inbox', () => {
            mockPathname.mockReturnValue('/dashboard/inbox')
            render(<Sidebar />)
            const inboxLink = screen.getByRole('link', { name: /^inbox$/i })
            expect(inboxLink.className).toContain('bg-primary/20')
        })

        it('does not apply active style to Jobs when on /dashboard/inbox', () => {
            mockPathname.mockReturnValue('/dashboard/inbox')
            render(<Sidebar />)
            const jobsLink = screen.getByRole('link', { name: /^jobs$/i })
            expect(jobsLink.className).not.toContain('bg-primary/20')
        })
    })

    describe('Developer Tools (collapsible)', () => {
        it('renders the Developer Tools toggle button', () => {
            render(<Sidebar />)
            expect(screen.getByRole('button', { name: /developer tools/i })).toBeInTheDocument()
        })

        it('is collapsed by default on a non-devtool page', () => {
            mockPathname.mockReturnValue('/dashboard/inbox')
            render(<Sidebar />)
            // Prompt Engineering should NOT be visible
            expect(screen.queryByRole('link', { name: /prompt engineering/i })).not.toBeInTheDocument()
        })

        it('expands when the toggle is clicked', () => {
            mockPathname.mockReturnValue('/dashboard/inbox')
            render(<Sidebar />)
            const toggle = screen.getByRole('button', { name: /developer tools/i })
            fireEvent.click(toggle)
            expect(screen.getByRole('link', { name: /prompt engineering/i })).toBeInTheDocument()
            expect(screen.getByRole('link', { name: /simulator/i })).toBeInTheDocument()
            expect(screen.getByRole('link', { name: /components/i })).toBeInTheDocument()
        })

        it('collapses again when the toggle is clicked a second time', () => {
            mockPathname.mockReturnValue('/dashboard/inbox')
            render(<Sidebar />)
            const toggle = screen.getByRole('button', { name: /developer tools/i })
            fireEvent.click(toggle)
            expect(screen.getByRole('link', { name: /prompt engineering/i })).toBeInTheDocument()
            fireEvent.click(toggle)
            expect(screen.queryByRole('link', { name: /prompt engineering/i })).not.toBeInTheDocument()
        })

        it('is auto-expanded when current path is /dashboard/prompts', () => {
            mockPathname.mockReturnValue('/dashboard/prompts')
            render(<Sidebar />)
            // Should be open automatically — Prompt Engineering link should be visible
            expect(screen.getByRole('link', { name: /prompt engineering/i })).toBeInTheDocument()
        })

        it('is auto-expanded when current path is /dashboard/simulation', () => {
            mockPathname.mockReturnValue('/dashboard/simulation')
            render(<Sidebar />)
            expect(screen.getByRole('link', { name: /simulator/i })).toBeInTheDocument()
        })
    })

    describe('Settings link', () => {
        it('renders the Settings link at the bottom', () => {
            render(<Sidebar />)
            const settingsLink = screen.getByRole('link', { name: /^settings$/i })
            expect(settingsLink).toBeInTheDocument()
            expect(settingsLink).toHaveAttribute('href', '/dashboard/settings')
        })

        it('applies active style when on /dashboard/settings', () => {
            mockPathname.mockReturnValue('/dashboard/settings')
            render(<Sidebar />)
            const settingsLink = screen.getByRole('link', { name: /^settings$/i })
            expect(settingsLink.className).toContain('bg-primary/20')
        })
    })

    describe('User section', () => {
        it('renders the user email', () => {
            render(<Sidebar />)
            expect(screen.getByText('test@example.com')).toBeInTheDocument()
        })

        it('renders the Sign Out button', () => {
            render(<Sidebar />)
            expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument()
        })
    })

    describe('Issue 6 — Inbox badge', () => {
        it('shows badge when there are COMPLETED jobs, even while on inbox page', async () => {
            mockPathname.mockReturnValue('/dashboard/inbox')
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => [
                    { triageStatus: 'COMPLETED' },
                    { triageStatus: 'COMPLETED' },
                ],
            })
            render(<Sidebar />)
            await waitFor(() => {
                expect(screen.getByText('2')).toBeInTheDocument()
            })
        })

        it('does not show badge when all jobs are PENDING (not yet triaged)', async () => {
            mockPathname.mockReturnValue('/dashboard/jobs')
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => [
                    { triageStatus: 'PENDING' },
                    { triageStatus: 'PROCESSING' },
                ],
            })
            render(<Sidebar />)
            // Wait a tick for the effect to settle, badge should not appear
            await waitFor(() => {
                expect(screen.queryByText('2')).not.toBeInTheDocument()
            })
        })

        it('counts only COMPLETED jobs, ignoring non-COMPLETED statuses', async () => {
            mockPathname.mockReturnValue('/dashboard/jobs')
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => [
                    { triageStatus: 'COMPLETED' },
                    { triageStatus: 'PENDING' },
                    { triageStatus: 'IGNORED' },
                ],
            })
            render(<Sidebar />)
            await waitFor(() => {
                expect(screen.getByText('1')).toBeInTheDocument()
            })
        })

        it('does not show badge when fetch returns no jobs', async () => {
            mockFetch.mockResolvedValue({ ok: true, json: async () => [] })
            render(<Sidebar />)
            await waitFor(() => {
                expect(screen.queryByRole('generic', { name: /\d+/ })).not.toBeInTheDocument()
            })
        })
    })
})
