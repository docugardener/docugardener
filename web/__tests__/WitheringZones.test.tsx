import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WitheringZones } from '../components/dashboard/WitheringZones'

vi.mock('lucide-react', () => ({
    AlertTriangle: (props: any) => <svg data-testid="alert-triangle" {...props} />,
    Droplets: (props: any) => <svg data-testid="droplets" {...props} />,
}))

vi.mock('@/components/ui/progress', () => ({
    Progress: ({ value }: { value: number }) => <div data-testid="progress-bar" data-value={value} />,
}))

const makeZone = (name: string, avgDrift: number, lastScan = '20 Feb 2026') =>
    ({ name, avgDrift, lastScan })

describe('WitheringZones', () => {
    it('shows empty state when zones array is empty', () => {
        render(<WitheringZones zones={[]} />)
        expect(screen.getByText('Your garden is fully hydrated.')).toBeInTheDocument()
        expect(screen.getByTestId('droplets')).toBeInTheDocument()
    })

    it('renders zone name and lastScan correctly', () => {
        render(<WitheringZones zones={[makeZone('docugardener-core', 45, 'Feb 20')]} />)
        expect(screen.getByText('docugardener-core')).toBeInTheDocument()
        expect(screen.getByText(/last scan: feb 20/i)).toBeInTheDocument()
    })

    it('shows AlertTriangle when avgDrift > 70', () => {
        render(<WitheringZones zones={[makeZone('hot-repo', 85)]} />)
        expect(screen.getByTestId('alert-triangle')).toBeInTheDocument()
        expect(screen.getByText('85% Drift')).toBeInTheDocument()
    })

    it('does NOT show AlertTriangle when avgDrift <= 70', () => {
        render(<WitheringZones zones={[makeZone('cool-repo', 40)]} />)
        expect(screen.queryByTestId('alert-triangle')).not.toBeInTheDocument()
        expect(screen.getByText('40% Drift')).toBeInTheDocument()
    })
})
