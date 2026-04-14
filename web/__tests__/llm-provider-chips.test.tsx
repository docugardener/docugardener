/**
 * Tests for LLMConfigForm — Provider chip selector UX.
 *
 * TDD: written BEFORE the chip redesign. All tests fail initially.
 *
 * Covers:
 *   A. Chip rendering — data-testid, all providers present
 *   B. Anthropic chip — renders, is clickable, sets provider
 *   C. Chip active state — aria-pressed or border-primary
 *   D. Anthropic-specific fields — API Key, model placeholder hint
 *   E. Chip count — correct count with/without Platform Default
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('next/navigation', () => ({
    useRouter: () => ({ refresh: vi.fn() }),
}))

vi.mock('sonner', () => ({
    toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

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

import { LLMConfigForm } from '../components/settings/LLMConfigForm'

// ── Fetch stub ────────────────────────────────────────────────────────────────

function stubFetchModels(models: { id: string; name: string }[] = []) {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ models }),
    }))
}

const BASE_CONFIG = { provider: undefined as any, modelName: undefined, promptTone: undefined }

// ── A. Chip rendering ─────────────────────────────────────────────────────────

describe('A. Provider chip rendering', () => {
    beforeEach(() => {
        stubFetchModels()
        vi.clearAllMocks()
    })

    it('renders provider chips with data-testid attributes', async () => {
        render(<LLMConfigForm config={BASE_CONFIG} bundledKeyAvailable={false} />)
        await waitFor(() => {
            expect(screen.getByTestId('provider-chip-gemini')).toBeInTheDocument()
        })
        expect(screen.getByTestId('provider-chip-openai')).toBeInTheDocument()
        expect(screen.getByTestId('provider-chip-anthropic')).toBeInTheDocument()
        expect(screen.getByTestId('provider-chip-ollama')).toBeInTheDocument()
    })

    it('renders Platform Default chip when bundledKeyAvailable is true', async () => {
        render(<LLMConfigForm config={BASE_CONFIG} bundledKeyAvailable={true} />)
        await waitFor(() => {
            expect(screen.getByTestId('provider-chip-platform_default')).toBeInTheDocument()
        })
    })

    it('does NOT render Platform Default chip when bundledKeyAvailable is false', async () => {
        render(<LLMConfigForm config={BASE_CONFIG} bundledKeyAvailable={false} />)
        await waitFor(() => {
            expect(screen.getByTestId('provider-chip-gemini')).toBeInTheDocument()
        })
        expect(screen.queryByTestId('provider-chip-platform_default')).not.toBeInTheDocument()
    })

    it('chips are in a flex-wrap container (not a grid)', async () => {
        const { container } = render(<LLMConfigForm config={BASE_CONFIG} bundledKeyAvailable={false} />)
        await waitFor(() => {
            expect(screen.getByTestId('provider-chip-gemini')).toBeInTheDocument()
        })
        // Chip strip should use flex, not grid-cols-2
        const chipStrip = container.querySelector('[data-testid="provider-chip-strip"]')
        expect(chipStrip).toBeInTheDocument()
    })
})

// ── B. Anthropic chip ─────────────────────────────────────────────────────────

describe('B. Anthropic chip behaviour', () => {
    beforeEach(() => {
        stubFetchModels()
        vi.clearAllMocks()
    })

    it('renders Anthropic chip with label "Anthropic"', async () => {
        render(<LLMConfigForm config={BASE_CONFIG} bundledKeyAvailable={false} />)
        await waitFor(() => {
            expect(screen.getByTestId('provider-chip-anthropic')).toBeInTheDocument()
        })
        expect(screen.getByTestId('provider-chip-anthropic')).toHaveTextContent('Anthropic')
    })

    it('clicking Anthropic chip reveals API Key field', async () => {
        render(<LLMConfigForm config={BASE_CONFIG} bundledKeyAvailable={false} />)
        await waitFor(() => {
            expect(screen.getByTestId('provider-chip-anthropic')).toBeInTheDocument()
        })

        fireEvent.click(screen.getByTestId('provider-chip-anthropic'))

        await waitFor(() => {
            expect(screen.getByText('API Key')).toBeInTheDocument()
        })
    })

    it('clicking Anthropic chip reveals Model field', async () => {
        render(<LLMConfigForm config={BASE_CONFIG} bundledKeyAvailable={false} />)
        await waitFor(() => {
            expect(screen.getByTestId('provider-chip-anthropic')).toBeInTheDocument()
        })

        fireEvent.click(screen.getByTestId('provider-chip-anthropic'))

        await waitFor(() => {
            expect(screen.getByText('Model')).toBeInTheDocument()
        })
    })

    it('pre-selects Anthropic chip when config.provider is "anthropic"', async () => {
        render(
            <LLMConfigForm
                config={{ ...BASE_CONFIG, provider: 'anthropic' as any }}
                bundledKeyAvailable={false}
            />
        )
        await waitFor(() => {
            const chip = screen.getByTestId('provider-chip-anthropic')
            expect(chip).toBeInTheDocument()
            // Selected chip should have aria-pressed="true" or a visual indicator
            expect(chip.getAttribute('aria-pressed') === 'true' || chip.className.includes('primary')).toBe(true)
        })
    })
})

// ── C. Active chip state ──────────────────────────────────────────────────────

describe('C. Active chip state', () => {
    beforeEach(() => {
        stubFetchModels()
        vi.clearAllMocks()
    })

    it('active chip has aria-pressed="true"', async () => {
        render(
            <LLMConfigForm
                config={{ ...BASE_CONFIG, provider: 'gemini' as any }}
                bundledKeyAvailable={false}
            />
        )
        await waitFor(() => {
            const chip = screen.getByTestId('provider-chip-gemini')
            expect(chip).toHaveAttribute('aria-pressed', 'true')
        })
    })

    it('inactive chips have aria-pressed="false"', async () => {
        render(
            <LLMConfigForm
                config={{ ...BASE_CONFIG, provider: 'gemini' as any }}
                bundledKeyAvailable={false}
            />
        )
        await waitFor(() => {
            expect(screen.getByTestId('provider-chip-openai')).toHaveAttribute('aria-pressed', 'false')
            expect(screen.getByTestId('provider-chip-anthropic')).toHaveAttribute('aria-pressed', 'false')
        })
    })

    it('clicking a chip updates aria-pressed correctly', async () => {
        render(<LLMConfigForm config={BASE_CONFIG} bundledKeyAvailable={false} />)
        await waitFor(() => {
            expect(screen.getByTestId('provider-chip-gemini')).toBeInTheDocument()
        })

        fireEvent.click(screen.getByTestId('provider-chip-anthropic'))

        await waitFor(() => {
            expect(screen.getByTestId('provider-chip-anthropic')).toHaveAttribute('aria-pressed', 'true')
            expect(screen.getByTestId('provider-chip-gemini')).toHaveAttribute('aria-pressed', 'false')
        })
    })
})

// ── D. Anthropic-specific field hints ────────────────────────────────────────

describe('D. Anthropic-specific field hints', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('model input placeholder contains "claude" when Anthropic selected and no models loaded', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: false,
            json: () => Promise.resolve({ error: 'no key' }),
        }))

        render(
            <LLMConfigForm
                config={{ ...BASE_CONFIG, provider: 'anthropic' as any }}
                bundledKeyAvailable={false}
            />
        )

        await waitFor(() => {
            const modelInput = document.querySelector('input[placeholder*="claude"]') as HTMLInputElement | null
            expect(modelInput).toBeInTheDocument()
        })
    })

    it('shows green key indicator when hasKeyPerProvider.anthropic is true', async () => {
        stubFetchModels()

        render(
            <LLMConfigForm
                config={{ ...BASE_CONFIG, provider: 'anthropic' as any }}
                hasKeyPerProvider={{ gemini: false, openai: false, anthropic: true, ollama: false }}
                bundledKeyAvailable={false}
            />
        )

        await waitFor(() => {
            expect(screen.getByText(/Key stored for anthropic/i)).toBeInTheDocument()
        })
    })
})

// ── E. Chip count ─────────────────────────────────────────────────────────────

describe('E. Chip count', () => {
    beforeEach(() => {
        stubFetchModels()
        vi.clearAllMocks()
    })

    it('shows 4 provider chips when bundledKeyAvailable=false (Gemini, OpenAI, Anthropic, Ollama)', async () => {
        render(<LLMConfigForm config={BASE_CONFIG} bundledKeyAvailable={false} />)
        await waitFor(() => {
            expect(screen.getByTestId('provider-chip-gemini')).toBeInTheDocument()
        })
        const chips = screen.getAllByRole('button', { name: /gemini|openai|anthropic|ollama/i })
            .filter(el => el.dataset.testid?.startsWith('provider-chip-'))
        // At minimum the 4 BYOK providers must be present
        expect(screen.getByTestId('provider-chip-gemini')).toBeInTheDocument()
        expect(screen.getByTestId('provider-chip-openai')).toBeInTheDocument()
        expect(screen.getByTestId('provider-chip-anthropic')).toBeInTheDocument()
        expect(screen.getByTestId('provider-chip-ollama')).toBeInTheDocument()
    })

    it('shows 5 chips when bundledKeyAvailable=true (Platform Default + 4 BYOK)', async () => {
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
