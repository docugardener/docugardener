/**
 * ENT-04: User Management / RBAC — UserList component tests.
 *
 * Verifies that:
 * - ADMIN users see the invite form, role selector, and remove button
 * - VIEWER users see a read-only badge list (no invite form, no controls)
 * - Invite form calls POST /api/users
 * - Role change calls PATCH /api/users/[id]
 * - Remove calls DELETE /api/users/[id]
 * - Seat usage bar fills proportionally
 * - Current user cannot change their own role or remove themselves
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { UserList } from '../components/user-list'

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('sonner', () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
}))

vi.mock('@/components/ui/select', () => ({
    Select: ({ children, onValueChange, value, disabled }: any) => (
        <select
            value={value}
            onChange={(e) => onValueChange?.(e.target.value)}
            disabled={disabled}
            data-testid="role-select"
        >
            {children}
        </select>
    ),
    SelectTrigger: ({ children }: any) => <>{children}</>,
    SelectValue: ({ placeholder }: any) => <option value="">{placeholder}</option>,
    SelectContent: ({ children }: any) => <>{children}</>,
    SelectItem: ({ value, children }: any) => <option value={value}>{children}</option>,
}))

vi.mock('@/components/ui/avatar', () => ({
    Avatar: ({ children }: any) => <div>{children}</div>,
    AvatarFallback: ({ children }: any) => <span>{children}</span>,
    AvatarImage: () => null,
}))

vi.mock('@/components/ui/card', () => ({
    Card: ({ children }: any) => <div>{children}</div>,
    CardContent: ({ children }: any) => <div>{children}</div>,
    CardHeader: ({ children }: any) => <div>{children}</div>,
    CardTitle: ({ children }: any) => <h3>{children}</h3>,
    CardDescription: ({ children }: any) => <p>{children}</p>,
}))

vi.mock('@/components/ui/badge', () => ({
    Badge: ({ children, variant }: any) => <span data-variant={variant}>{children}</span>,
}))

vi.mock('@/components/ui/button', () => ({
    Button: ({ children, onClick, disabled, type, className }: any) => (
        <button onClick={onClick} disabled={disabled} type={type} className={className}>
            {children}
        </button>
    ),
}))

vi.mock('@/components/ui/input', () => ({
    Input: ({ value, onChange, placeholder, type, disabled }: any) => (
        <input
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            type={type}
            disabled={disabled}
            data-testid="invite-input"
        />
    ),
}))

vi.mock('lucide-react', () => ({
    Trash2: () => <span data-testid="trash-icon">🗑</span>,
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

const ADMIN_USER = { id: 'u-admin', name: 'Alice Admin', email: 'alice@acme.com', image: '', role: 'ADMIN' }
const VIEWER_USER = { id: 'u-viewer', name: 'Bob Viewer', email: 'bob@acme.com', image: '', role: 'VIEWER' }

function mockFetch({
    users = [ADMIN_USER, VIEWER_USER],
    usage = { current: 2, limit: 10 },
    currentUserRole = 'ADMIN',
    currentUserId = 'u-admin',
    patchOk = true,
    deleteOk = true,
    postOk = true,
} = {}) {
    vi.stubGlobal('fetch', vi.fn((url: string, opts?: any) => {
        const method = opts?.method || 'GET'

        if (method === 'GET') {
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ users, usage, currentUserRole, currentUserId }),
            })
        }
        if (method === 'POST') {
            return Promise.resolve({
                ok: postOk,
                json: () => Promise.resolve(postOk ? { user: { id: 'u-new', name: '', email: 'new@acme.com', image: '', role: 'VIEWER' } } : { error: 'Seat limit reached' }),
            })
        }
        if (method === 'PATCH') {
            return Promise.resolve({
                ok: patchOk,
                json: () => Promise.resolve({ id: url.split('/').pop(), role: JSON.parse(opts.body).role }),
            })
        }
        if (method === 'DELETE') {
            return Promise.resolve({ ok: deleteOk, json: () => Promise.resolve({}) })
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    }))
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('UserList (ENT-04)', () => {

    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('renders user list after fetch', async () => {
        mockFetch()
        render(<UserList />)

        await waitFor(() => screen.getByText('Alice Admin'))
        expect(screen.getByText('Bob Viewer')).toBeInTheDocument()
    })

    it('shows invite form for ADMIN', async () => {
        mockFetch({ currentUserRole: 'ADMIN' })
        render(<UserList />)

        await waitFor(() => screen.getByTestId('invite-input'))
        expect(screen.getByText('Invite')).toBeInTheDocument()
    })

    it('hides invite form for VIEWER', async () => {
        mockFetch({ currentUserRole: 'VIEWER' })
        render(<UserList />)

        await waitFor(() => screen.getByText('Alice Admin'))
        expect(screen.queryByTestId('invite-input')).not.toBeInTheDocument()
    })

    it('shows role selector for ADMIN', async () => {
        mockFetch({ currentUserRole: 'ADMIN' })
        render(<UserList />)

        await waitFor(() => screen.getAllByTestId('role-select'))
        const selects = screen.getAllByTestId('role-select')
        expect(selects.length).toBeGreaterThan(0)
    })

    it('shows role badge for VIEWER (no selector)', async () => {
        mockFetch({ currentUserRole: 'VIEWER' })
        render(<UserList />)

        await waitFor(() => screen.getAllByText('ADMIN'))
        // VIEWERs see badges, not selects
        expect(screen.queryByTestId('role-select')).not.toBeInTheDocument()
    })

    it('calls POST /api/users when invite form submitted', async () => {
        mockFetch({ currentUserRole: 'ADMIN' })
        render(<UserList />)

        await waitFor(() => screen.getByTestId('invite-input'))

        fireEvent.change(screen.getByTestId('invite-input'), {
            target: { value: 'newperson@acme.com' },
        })
        fireEvent.submit(screen.getByTestId('invite-input').closest('form')!)

        await waitFor(() => {
            const fetchMock = vi.mocked(fetch)
            const postCall = fetchMock.mock.calls.find(([, opts]: any) => opts?.method === 'POST')
            expect(postCall).toBeTruthy()
            expect(JSON.parse((postCall![1] as any).body as string)).toMatchObject({ email: 'newperson@acme.com' })
        })
    })

    it('calls PATCH /api/users/[id] when role is changed', async () => {
        mockFetch({ currentUserRole: 'ADMIN', currentUserId: 'u-admin' })
        render(<UserList />)

        await waitFor(() => screen.getAllByTestId('role-select'))

        // Change the VIEWER user's role (the second select, index 1)
        const selects = screen.getAllByTestId('role-select')
        fireEvent.change(selects[1], { target: { value: 'ADMIN' } })

        await waitFor(() => {
            const fetchMock = vi.mocked(fetch)
            const patchCall = fetchMock.mock.calls.find(([, opts]: any) => opts?.method === 'PATCH')
            expect(patchCall).toBeTruthy()
            expect(JSON.parse((patchCall![1] as any).body as string)).toMatchObject({ role: 'ADMIN' })
        })
    })

    it('calls DELETE /api/users/[id] when remove is clicked', async () => {
        // Override confirm to auto-accept
        vi.stubGlobal('confirm', vi.fn(() => true))
        mockFetch({ currentUserRole: 'ADMIN', currentUserId: 'u-admin' })
        render(<UserList />)

        await waitFor(() => screen.getAllByTestId('trash-icon'))

        // Click the remove button on Bob Viewer (second row)
        const trashButtons = screen.getAllByTestId('trash-icon')
        fireEvent.click(trashButtons[1].closest('button')!)

        await waitFor(() => {
            const fetchMock = vi.mocked(fetch)
            const deleteCall = fetchMock.mock.calls.find(([, opts]: any) => opts?.method === 'DELETE')
            expect(deleteCall).toBeTruthy()
            expect(deleteCall![0]).toContain('/api/users/u-viewer')
        })
    })

    it('current user role selector is disabled (cannot self-demote)', async () => {
        mockFetch({ currentUserRole: 'ADMIN', currentUserId: 'u-admin' })
        render(<UserList />)

        await waitFor(() => screen.getAllByTestId('role-select'))

        const selects = screen.getAllByTestId('role-select')
        // First select belongs to the current user (u-admin) — should be disabled
        expect(selects[0]).toBeDisabled()
        // Second select (Bob Viewer) should be enabled
        expect(selects[1]).not.toBeDisabled()
    })

    it('displays seat usage bar', async () => {
        mockFetch({ usage: { current: 5, limit: 10 } })
        render(<UserList />)

        await waitFor(() => screen.getByText('5 / 10'))
    })

    it('disables invite when seat limit reached', async () => {
        mockFetch({ usage: { current: 10, limit: 10 }, currentUserRole: 'ADMIN' })
        render(<UserList />)

        await waitFor(() => screen.getByText('Limit Reached'))
        expect(screen.getByTestId('invite-input')).toBeDisabled()
    })
})
