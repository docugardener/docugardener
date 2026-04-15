// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Pure data utility functions extracted from dashboard/page.tsx.
 * These are stateless transforms on job/repo arrays with no DB or
 * Next.js dependencies — making them independently unit-testable.
 */

export interface JobResult {
    status: string
    result: Record<string, any> | null
    createdAt: Date
    prNumber?: number | null
    repository?: { name: string }
}

export interface RepoWithJobs {
    name: string
    jobs: { result: Record<string, any> | null; createdAt: Date }[]
}

export interface VelocityPoint {
    date: string
    score: number
}

export interface WitheringZone {
    name: string
    avgDrift: number
    lastScan: string
}

export interface DashboardStats {
    avgDrift: number
    criticalBlocks: number
}

/**
 * Build time-series velocity data from completed jobs with drift scores.
 * Returns in chronological order (oldest → newest).
 */
export function buildVelocityData(jobs: JobResult[]): VelocityPoint[] {
    return jobs
        .filter(j => j.status === 'COMPLETED' && j.result?.drift_score !== undefined)
        .map(j => ({
            date: new Date(j.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' }),
            score: j.result!.drift_score as number,
        }))
        .reverse()
}

/**
 * Calculate aggregate health stats from completed jobs.
 */
export function computeDashboardStats(jobs: JobResult[]): DashboardStats {
    let totalDrift = 0
    let count = 0
    let criticalBlocks = 0

    for (const job of jobs) {
        const score = job.result?.drift_score
        if (score !== undefined) {
            totalDrift += score
            count++
            if (score > 80) criticalBlocks++
        }
    }

    return {
        avgDrift: count > 0 ? Math.round(totalDrift / count) : 0,
        criticalBlocks,
    }
}

/**
 * Compute withering zones: repos ranked by avg drift score (highest first).
 * Only includes repos with at least one completed drift score.
 */
export function computeWitheringZones(repos: RepoWithJobs[]): WitheringZone[] {
    return repos
        .map(repo => {
            const scores = repo.jobs
                .map(j => j.result?.drift_score)
                .filter((s): s is number => s !== undefined)
            const avg = scores.length > 0
                ? scores.reduce((a, b) => a + b, 0) / scores.length
                : 0
            return {
                name: repo.name,
                avgDrift: Math.round(avg),
                lastScan: repo.jobs[0]
                    ? new Date(repo.jobs[0].createdAt).toLocaleDateString()
                    : 'Never',
            }
        })
        .filter(z => z.avgDrift > 0)
        .sort((a, b) => b.avgDrift - a.avgDrift)
        .slice(0, 3)
}
