/**
 * Tests for LLMConfigForm — Platform Default provider behaviour.
 *
 * Covers UX-03 UI completion: the "Platform Default" card that lets tenants
 * switch back to the bundled Gemini key without deleting their stored API key.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('next/navigation', () => ({
    useRouter: () => ({ refresh: vi.fn() }),
}))

vi.mock('sonner', () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
    },
}))

// Stub Select to a plain <select> so tests can interact without Radix portal
vi.mock('@/components/ui/select', () => ({
    Select: ({ value, onValueChange, children }: any) => (
        <select
            data-testid="model-select"
            value={value}
            onChange={(e) => onValueChange?.(e.target.value)}
        >
            {children}
        </select>
    ),
    SelectTrigger: ({ children }: any) => <>{children}</>,
    SelectValue: ({ placeholder }: any) => <option value="">{placeholder}</option>,
    SelectContent: ({ children }: any) => <>{children}</>,
    SelectItem: ({ value, children }: any) => <option value={value}>{children}</option>,
}))

// ── LLMConfigForm import ──────────────────────────────────────────────────────

import { LLMConfigForm } from '../components/settings/LLMConfigForm'

// ── Fetch helpers ─────────────────────────────────────────────────────────────

function stubFetchModels(models: { id: string; name: string }[] = []) {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ models }),
    }))
}

function stubFetchSaveSuccess() {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
    }))
}

// ── Base props ────────────────────────────────────────────────────────────────

const BASE_CONFIG = { provider: undefined as any, modelName: undefined, promptTone: undefined }

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('LLMConfigForm — Platform Default card', () => {

    beforeEach(() => {
        stubFetchModels()
        vi.clearAllMocks()
    })

    it('does NOT render Platform Default card when bundledKeyAvailable is false', async () => {
        render(<LLMConfigForm config={BASE_CONFIG} bundledKeyAvailable={false} />)
        await waitFor(() => {
            expect(screen.queryByText('Platform Default')).not.toBeInTheDocument()
        })
    })

    it('renders Platform Default as first card when bundledKeyAvailable is true', async () => {
        render(<LLMConfigForm config={BASE_CONFIG} bundledKeyAvailable={true} />)
        await waitFor(() => {
            expect(screen.getByText('Platform Default')).toBeInTheDocument()
        })
        // Verify sublabel
        expect(screen.getByText('Free tier · Gemini Flash')).toBeInTheDocument()
    })

    it('pre-selects Platform Default when config.provider is "platform_default"', async () => {
        render(
            <LLMConfigForm
                config={{ ...BASE_CONFIG, provider: 'platform_default' as any }}
                bundledKeyAvailable={true}
            />
        )
        await waitFor(() => {
            expect(screen.getByText('Platform Default')).toBeInTheDocument()
        })
        // Info banner should be visible (confirming the card is active)
        expect(screen.getByText('Using the platform bundled key')).toBeInTheDocument()
    })

    it('shows info banner and hides API Key + Model fields when Platform Default is selected', async () => {
        render(<LLMConfigForm config={BASE_CONFIG} bundledKeyAvailable={true} />)

        // Platform Default is the default when bundledKeyAvailable and no config.provider
        await waitFor(() => {
            expect(screen.getByText('Using the platform bundled key')).toBeInTheDocument()
        })

        // API Key label and password input must not be present
        expect(screen.queryByText('API Key')).not.toBeInTheDocument()
        expect(document.querySelector('input[type="password"]')).not.toBeInTheDocument()
        // Model label must not be present
        expect(screen.queryByText('Model')).not.toBeInTheDocument()
    })

    it('keeps Prompt Tone visible when Platform Default is selected', async () => {
        render(<LLMConfigForm config={BASE_CONFIG} bundledKeyAvailable={true} />)

        await waitFor(() => {
            expect(screen.getByText('Using the platform bundled key')).toBeInTheDocument()
        })

        expect(screen.getByText('Bot Personality (Tone)')).toBeInTheDocument()
        expect(screen.getByText('Strict')).toBeInTheDocument()
    })

    it('clicking a BYOK card from Platform Default re-shows API Key and Model fields', async () => {
        render(<LLMConfigForm config={BASE_CONFIG} bundledKeyAvailable={true} />)

        await waitFor(() => {
            expect(screen.getByText('Using the platform bundled key')).toBeInTheDocument()
        })

        // Click Google Gemini card
        fireEvent.click(screen.getByText('Google Gemini'))

        await waitFor(() => {
            expect(screen.getByText('API Key')).toBeInTheDocument()
        })

        expect(screen.queryByText('Using the platform bundled key')).not.toBeInTheDocument()
    })

    it('clicking Platform Default from Gemini switches back and shows banner', async () => {
        render(
            <LLMConfigForm
                config={{ ...BASE_CONFIG, provider: 'gemini' as any, modelName: 'gemini-2.0-flash' }}
                bundledKeyAvailable={true}
            />
        )

        await waitFor(() => {
            // Gemini is selected — API Key label and Model label must be visible
            expect(screen.getByText('API Key')).toBeInTheDocument()
        })

        // Switch to Platform Default
        fireEvent.click(screen.getByText('Platform Default'))

        await waitFor(() => {
            expect(screen.getByText('Using the platform bundled key')).toBeInTheDocument()
        })

        expect(screen.queryByText('API Key')).not.toBeInTheDocument()
    })

    it('submit with Platform Default sends llmProvider:"platform_default" without apiKey or modelName', async () => {
        stubFetchSaveSuccess()

        render(<LLMConfigForm config={BASE_CONFIG} bundledKeyAvailable={true} />)

        await waitFor(() => {
            expect(screen.getByText('Using the platform bundled key')).toBeInTheDocument()
        })

        // Mark form dirty by changing tone
        fireEvent.click(screen.getByText('Friendly'))

        // Submit
        fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

        await waitFor(() => {
            expect(vi.mocked(fetch)).toHaveBeenCalledWith(
                '/api/settings',
                expect.objectContaining({ method: 'POST' })
            )
        })

        const fetchCall = vi.mocked(fetch).mock.calls.find(
            (c) => c[0] === '/api/settings'
        )
        expect(fetchCall).toBeDefined()
        const body = JSON.parse((fetchCall![1] as any).body)
        expect(body.llmProvider).toBe('platform_default')
        expect(body.llmApiKey).toBeUndefined()
        expect(body.llmModelName).toBeUndefined()
    })

    it('shows all 5 provider chips when bundledKeyAvailable (Platform Default + Gemini + OpenAI + Anthropic + Ollama)', async () => {
        render(<LLMConfigForm config={BASE_CONFIG} bundledKeyAvailable={true} />)

        await waitFor(() => {
            expect(screen.getByTestId('provider-chip-platform_default')).toBeInTheDocument()
        })

        expect(screen.getByTestId('provider-chip-gemini')).toBeInTheDocument()
        expect(screen.getByTestId('provider-chip-openai')).toBeInTheDocument()
        expect(screen.getByTestId('provider-chip-anthropic')).toBeInTheDocument()
        expect(screen.getByTestId('provider-chip-ollama')).toBeInTheDocument()
    })
})
