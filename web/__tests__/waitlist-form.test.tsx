// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { WaitlistForm } from '../components/billing/WaitlistForm'

/**
 * Tests for components/billing/WaitlistForm.tsx
 *
 * Client component — no API route tested here. fetch is stubbed globally.
 *
 * Covers:
 *  - Renders form fields and plan label correctly
 *  - Successful submit shows success message and calls onSuccess
 *  - API error response shows inline error
 *  - Network error shows inline error
 *  - Button shows loading state during in-flight request
 *  - Form fields are disabled during submission
 *  - Plan label reflects "pro" / "team" prop correctly
 */

// ── Dependency mocks ──────────────────────────────────────────────────────────

// shadcn/ui components re-export Radix primitives with extra DOM; the jsdom
// environment handles them fine without mocking. No mocks needed here.

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockFetchOk() {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true }),
    }),
  )
}

function mockFetchError(errorMessage = 'Email already registered') {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: errorMessage }),
    }),
  )
}

function mockFetchNetworkError() {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network failure')))
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('WaitlistForm', () => {
  const onSuccess = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // ── Rendering ──────────────────────────────────────────────────────────────

  it('renders the name, email and message fields', () => {
    render(<WaitlistForm plan="pro" onSuccess={onSuccess} />)

    expect(screen.getByLabelText(/name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/message/i)).toBeInTheDocument()
  })

  it('renders the submit button with correct initial label', () => {
    render(<WaitlistForm plan="pro" onSuccess={onSuccess} />)

    expect(screen.getByRole('button', { name: /reserve your spot/i })).toBeInTheDocument()
  })

  it('shows the pro plan label when plan="pro"', () => {
    render(<WaitlistForm plan="pro" onSuccess={onSuccess} />)

    expect(screen.getByText('Pro — $29/mo')).toBeInTheDocument()
  })

  it('shows the team plan label when plan="team"', () => {
    render(<WaitlistForm plan="team" onSuccess={onSuccess} />)

    expect(screen.getByText('Team — $79/mo')).toBeInTheDocument()
  })

  // ── Successful submission ──────────────────────────────────────────────────

  it('shows success message after a successful API response', async () => {
    mockFetchOk()
    render(<WaitlistForm plan="pro" onSuccess={onSuccess} />)

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'user@example.com' },
    })
    fireEvent.submit(screen.getByRole('button', { name: /reserve your spot/i }).closest('form')!)

    await waitFor(() => {
      expect(screen.getByText(/you're on the list/i)).toBeInTheDocument()
    })
  })

  it('calls onSuccess after a successful API response', async () => {
    mockFetchOk()
    render(<WaitlistForm plan="pro" onSuccess={onSuccess} />)

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'user@example.com' },
    })
    fireEvent.submit(screen.getByRole('button', { name: /reserve your spot/i }).closest('form')!)

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledOnce()
    })
  })

  it('sends email, plan, name and message in the POST body', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true }),
    })
    vi.stubGlobal('fetch', fetchSpy)

    render(<WaitlistForm plan="team" onSuccess={onSuccess} />)

    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Alice' } })
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'alice@corp.com' } })
    fireEvent.change(screen.getByLabelText(/message/i), {
      target: { value: 'Excited to try it!' },
    })
    fireEvent.submit(screen.getByRole('button', { name: /reserve your spot/i }).closest('form')!)

    await waitFor(() => expect(onSuccess).toHaveBeenCalled())

    const callArgs = fetchSpy.mock.calls[0]
    expect(callArgs[0]).toBe('/api/waitlist')
    const sentBody = JSON.parse(callArgs[1].body)
    expect(sentBody).toMatchObject({
      email: 'alice@corp.com',
      name: 'Alice',
      plan: 'team',
      message: 'Excited to try it!',
    })
  })

  it('omits name from the request body when left blank', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true }),
    })
    vi.stubGlobal('fetch', fetchSpy)

    render(<WaitlistForm plan="pro" onSuccess={onSuccess} />)

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'anon@example.com' } })
    fireEvent.submit(screen.getByRole('button', { name: /reserve your spot/i }).closest('form')!)

    await waitFor(() => expect(onSuccess).toHaveBeenCalled())

    const sentBody = JSON.parse(fetchSpy.mock.calls[0][1].body)
    // When name is empty the component sends undefined which JSON.stringify omits
    expect(sentBody.name).toBeUndefined()
  })

  // ── Error states ───────────────────────────────────────────────────────────

  it('shows inline error message returned by the API on failure', async () => {
    mockFetchError('This email is already registered')
    render(<WaitlistForm plan="pro" onSuccess={onSuccess} />)

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'existing@example.com' },
    })
    fireEvent.submit(screen.getByRole('button', { name: /reserve your spot/i }).closest('form')!)

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('This email is already registered')
    })
    expect(onSuccess).not.toHaveBeenCalled()
  })

  it('shows a generic error message when the API returns no error field', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({}),
      }),
    )
    render(<WaitlistForm plan="pro" onSuccess={onSuccess} />)

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'user@example.com' },
    })
    fireEvent.submit(screen.getByRole('button', { name: /reserve your spot/i }).closest('form')!)

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/something went wrong/i)
    })
  })

  it('shows a network error message when fetch rejects', async () => {
    mockFetchNetworkError()
    render(<WaitlistForm plan="pro" onSuccess={onSuccess} />)

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'user@example.com' },
    })
    fireEvent.submit(screen.getByRole('button', { name: /reserve your spot/i }).closest('form')!)

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/network error/i)
    })
    expect(onSuccess).not.toHaveBeenCalled()
  })

  // ── Loading state ──────────────────────────────────────────────────────────

  it('shows "Submitting…" on the button while the request is in flight', async () => {
    // Never resolves — holds the loading state open
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))

    render(<WaitlistForm plan="pro" onSuccess={onSuccess} />)

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'user@example.com' },
    })
    fireEvent.submit(screen.getByRole('button', { name: /reserve your spot/i }).closest('form')!)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /submitting/i })).toBeInTheDocument()
    })
  })

  it('disables the email input while the request is in flight', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))

    render(<WaitlistForm plan="pro" onSuccess={onSuccess} />)

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'user@example.com' },
    })
    fireEvent.submit(screen.getByRole('button', { name: /reserve your spot/i }).closest('form')!)

    await waitFor(() => {
      expect(screen.getByLabelText(/email/i)).toBeDisabled()
    })
  })
})
