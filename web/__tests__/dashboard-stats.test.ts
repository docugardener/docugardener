import { describe, it, expect } from 'vitest'
import {
    buildVelocityData,
    computeDashboardStats,
    computeWitheringZones,
    type JobResult,
    type RepoWithJobs,
} from '../lib/dashboard-stats'

const makeJob = (status: string, drift_score?: number, daysAgo = 1): JobResult => ({
    status,
    result: drift_score !== undefined ? { drift_score } : null,
    createdAt: new Date(Date.now() - daysAgo * 86400000),
    prNumber: 1,
    repository: { name: 'test-repo' },
})

describe('buildVelocityData', () => {
    it('returns empty array when no jobs', () => {
        expect(buildVelocityData([])).toEqual([])
    })

    it('excludes non-COMPLETED jobs', () => {
        const jobs = [makeJob('PROCESSING', 50), makeJob('FAILED', 80)]
        expect(buildVelocityData(jobs)).toHaveLength(0)
    })

    it('excludes COMPLETED jobs without drift_score', () => {
        const jobs = [makeJob('COMPLETED', undefined)]
        expect(buildVelocityData(jobs)).toHaveLength(0)
    })

    it('returns velocity points in chronological order (oldest first)', () => {
        const jobs = [
            makeJob('COMPLETED', 60, 1),  // newest
            makeJob('COMPLETED', 30, 2),  // older
        ]
        const result = buildVelocityData(jobs)
        expect(result).toHaveLength(2)
        // After .reverse(), older job should come first
        expect(result[0].score).toBe(30)
        expect(result[1].score).toBe(60)
    })
})

describe('computeDashboardStats', () => {
    it('returns zeros for empty input', () => {
        expect(computeDashboardStats([])).toEqual({ avgDrift: 0, criticalBlocks: 0 })
    })

    it('calculates correct average from two scores', () => {
        const jobs = [makeJob('COMPLETED', 80), makeJob('COMPLETED', 20)]
        const { avgDrift } = computeDashboardStats(jobs)
        expect(avgDrift).toBe(50)
    })

    it('counts criticalBlocks only for drift > 80', () => {
        const jobs = [makeJob('COMPLETED', 85), makeJob('COMPLETED', 80), makeJob('COMPLETED', 50)]
        const { criticalBlocks } = computeDashboardStats(jobs)
        expect(criticalBlocks).toBe(1) // only 85 qualifies (> 80, not >= 80)
    })

    it('ignores jobs with null result', () => {
        const jobs = [makeJob('COMPLETED', undefined), makeJob('COMPLETED', 60)]
        const { avgDrift, criticalBlocks } = computeDashboardStats(jobs)
        expect(avgDrift).toBe(60)
        expect(criticalBlocks).toBe(0)
    })
})

describe('computeWitheringZones', () => {
    const makeRepo = (name: string, scores: number[]): RepoWithJobs => ({
        name,
        jobs: scores.map(s => ({
            result: { drift_score: s },
            createdAt: new Date(),
        })),
    })

    it('returns empty array for repos with no scores', () => {
        const repos: RepoWithJobs[] = [{ name: 'empty', jobs: [] }]
        expect(computeWitheringZones(repos)).toHaveLength(0)
    })

    it('sorts repos by avgDrift descending', () => {
        const repos = [makeRepo('low', [20]), makeRepo('high', [80])]
        const result = computeWitheringZones(repos)
        expect(result[0].name).toBe('high')
        expect(result[1].name).toBe('low')
    })

    it('caps the result at 3 zones', () => {
        const repos = [
            makeRepo('a', [90]),
            makeRepo('b', [80]),
            makeRepo('c', [70]),
            makeRepo('d', [60]),
        ]
        expect(computeWitheringZones(repos)).toHaveLength(3)
    })

    it('computes correct average drift', () => {
        const repos = [makeRepo('mixed', [40, 60])]
        const result = computeWitheringZones(repos)
        expect(result[0].avgDrift).toBe(50)
    })
})
