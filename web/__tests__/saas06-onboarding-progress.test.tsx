import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { OnboardingProgress } from '../components/onboarding/OnboardingProgress'

/**
 * Tests for components/onboarding/OnboardingProgress.tsx
 *
 * A shared 3-step wizard progress indicator used across the DG-SAAS-06
 * onboarding flow: Connect → Repos → Ready.
 *
 * These are RED tests — the component does not exist yet.
 */

// ── Dependency mocks ──────────────────────────────────────────────────────────

vi.mock('next/link', () => ({
    default: ({ href, children, className }: any) => (
        <a href={href} className={className}>{children}</a>
    ),
}))

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('OnboardingProgress', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('renders all 3 step labels: Connect, Repos, Ready', () => {
        render(<OnboardingProgress currentStep={1} />)
        expect(screen.getByText('Connect')).toBeInTheDocument()
        expect(screen.getByText('Repos')).toBeInTheDocument()
        expect(screen.getByText('Ready')).toBeInTheDocument()
    })

    it('step 1 active: step 1 has aria-current="step", steps 2 and 3 do not', () => {
        render(<OnboardingProgress currentStep={1} />)

        // Find step elements by test id
        const step1 = screen.getByTestId('step-dot-1')
        const step2 = screen.getByTestId('step-dot-2')
        const step3 = screen.getByTestId('step-dot-3')

        expect(step1).toHaveAttribute('aria-current', 'step')
        expect(step2).not.toHaveAttribute('aria-current', 'step')
        expect(step3).not.toHaveAttribute('aria-current', 'step')
    })

    it('step 2 active: step 2 has aria-current="step", step 1 is done (no aria-current), step 3 is not active', () => {
        render(<OnboardingProgress currentStep={2} />)

        // Step 1 is done — shows check mark, not dot
        expect(screen.queryByTestId('step-dot-1')).not.toBeInTheDocument()
        expect(screen.getByTestId('step-check-1')).toBeInTheDocument()

        // Step 2 is active — dot with aria-current
        const step2 = screen.getByTestId('step-dot-2')
        expect(step2).toHaveAttribute('aria-current', 'step')

        // Step 3 is pending
        const step3 = screen.getByTestId('step-dot-3')
        expect(step3).not.toHaveAttribute('aria-current', 'step')
    })

    it('step 3 active: step 3 has aria-current="step"', () => {
        render(<OnboardingProgress currentStep={3} />)

        const step3 = screen.getByTestId('step-dot-3')
        expect(step3).toHaveAttribute('aria-current', 'step')
    })

    it('completed steps show a check mark via data-testid="step-check-{n}"', () => {
        render(<OnboardingProgress currentStep={2} />)
        // Step 1 is complete when currentStep=2
        expect(screen.getByTestId('step-check-1')).toBeInTheDocument()
        // Step 2 is active (dot), not yet checked
        expect(screen.queryByTestId('step-check-2')).not.toBeInTheDocument()
    })

    it('step 1 shows check mark when currentStep is 2', () => {
        render(<OnboardingProgress currentStep={2} />)
        expect(screen.getByTestId('step-check-1')).toBeInTheDocument()
        expect(screen.queryByTestId('step-dot-1')).not.toBeInTheDocument()
    })

    it('step 1 shows check mark when currentStep is 3', () => {
        render(<OnboardingProgress currentStep={3} />)
        expect(screen.getByTestId('step-check-1')).toBeInTheDocument()
        expect(screen.queryByTestId('step-dot-1')).not.toBeInTheDocument()
    })

    it('step 2 shows check mark when currentStep is 3', () => {
        render(<OnboardingProgress currentStep={3} />)
        expect(screen.getByTestId('step-check-2')).toBeInTheDocument()
        expect(screen.queryByTestId('step-dot-2')).not.toBeInTheDocument()
    })
})
