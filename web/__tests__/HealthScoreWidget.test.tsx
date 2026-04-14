import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HealthScoreWidget } from '../components/dashboard/HealthScoreWidget'

// Framer Motion does real animations in jsdom which can error — stub it
vi.mock('framer-motion', () => ({
    motion: {
        circle: (props: any) => <circle {...props} />,
        div: (props: any) => <div {...props} />,
    },
}))

describe('HealthScoreWidget', () => {
    it('shows 100% vitality and "Garden thriving" when score is 0', () => {
        render(<HealthScoreWidget score={0} />)
        expect(screen.getByText('100%')).toBeInTheDocument()
        expect(screen.getByText('Garden thriving')).toBeInTheDocument()
    })

    it('shows 60% vitality and "Doc maintenance needed" when score is 40', () => {
        render(<HealthScoreWidget score={40} />)
        expect(screen.getByText('60%')).toBeInTheDocument()
        expect(screen.getByText('Doc maintenance needed')).toBeInTheDocument()
    })

    it('shows "Critical Overgrowth" when health drops to 20 (score=80)', () => {
        render(<HealthScoreWidget score={80} />)
        expect(screen.getByText('20%')).toBeInTheDocument()
        expect(screen.getByText('Critical Overgrowth')).toBeInTheDocument()
    })

    it('renders without crashing for boundary score 100', () => {
        render(<HealthScoreWidget score={100} />)
        expect(screen.getByText('0%')).toBeInTheDocument()
    })
})
