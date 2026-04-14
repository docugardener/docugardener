import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DriftVelocityChart } from '../components/dashboard/DriftVelocityChart'

// Recharts uses ResizeObserver + real DOM measurement which breaks in jsdom.
// Stub the entire module; we only test that the component doesn't crash.
vi.mock('recharts', () => ({
    ResponsiveContainer: ({ children }: any) => <div data-testid="chart-container">{children}</div>,
    AreaChart: ({ children }: any) => <svg data-testid="area-chart">{children}</svg>,
    Area: () => null,
    CartesianGrid: () => null,
    XAxis: () => null,
    YAxis: () => null,
    Tooltip: () => null,
    defs: () => null,
    linearGradient: () => null,
    stop: () => null,
}))

const sampleData = [
    { date: 'Feb 18', score: 45 },
    { date: 'Feb 19', score: 60 },
    { date: 'Feb 20', score: 23 },
]

describe('DriftVelocityChart', () => {
    it('renders the chart container with valid data', () => {
        render(<DriftVelocityChart data={sampleData} />)
        expect(screen.getByTestId('chart-container')).toBeInTheDocument()
    })

    it('renders without crashing when data is empty', () => {
        render(<DriftVelocityChart data={[]} />)
        expect(screen.getByTestId('chart-container')).toBeInTheDocument()
    })
})
