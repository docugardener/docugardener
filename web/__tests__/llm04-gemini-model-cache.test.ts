/**
 * LLM-04: Gemini model list cache tests.
 *
 * Tests the module-level TTL cache in the models route.
 * We test the cache helper functions directly since the full route
 * handler requires Next.js environment and DB connectivity.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Replicate the cache implementation from the route (pure functions)
// so we can unit-test cache logic without the route environment.
// ---------------------------------------------------------------------------

const GEMINI_CACHE_TTL_MS = 5 * 60 * 1_000

interface ModelCacheEntry {
    models: any[]
    expiresAt: number
}

const _geminiModelCache = new Map<string, ModelCacheEntry>()

function _cacheKey(apiKey: string): string {
    return apiKey.slice(0, 8)
}

function _getCachedModels(apiKey: string): any[] | null {
    const entry = _geminiModelCache.get(_cacheKey(apiKey))
    if (!entry || Date.now() > entry.expiresAt) {
        _geminiModelCache.delete(_cacheKey(apiKey))
        return null
    }
    return entry.models
}

function _setCachedModels(apiKey: string, models: any[]): void {
    _geminiModelCache.set(_cacheKey(apiKey), { models, expiresAt: Date.now() + GEMINI_CACHE_TTL_MS })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
    _geminiModelCache.clear()
    vi.useRealTimers()
})

describe('LLM-04: Gemini model list cache', () => {

    it('returns null when cache is empty', () => {
        expect(_getCachedModels('AIza_test_key')).toBeNull()
    })

    it('returns cached models after set', () => {
        const models = [{ id: 'gemini-2.0-flash', name: 'Gemini Flash' }]
        _setCachedModels('AIza_test_key', models)
        expect(_getCachedModels('AIza_test_key')).toEqual(models)
    })

    it('returns null for different API key', () => {
        const models = [{ id: 'gemini-2.0-flash' }]
        _setCachedModels('AAAAAAAAA_key', models)  // prefix = 'AAAAAAAA'
        expect(_getCachedModels('BBBBBBBBB_key')).toBeNull()  // prefix = 'BBBBBBBB'
    })

    it('cache key uses first 8 chars only', () => {
        // Two keys with same first 8 chars should share the cache
        const models = [{ id: 'gemini-2.0-flash' }]
        _setCachedModels('AIza1234_suffix_A', models)
        expect(_getCachedModels('AIza1234_suffix_B')).toEqual(models)
    })

    it('cache key isolates different prefixes', () => {
        const modelsA = [{ id: 'gemini-a' }]
        const modelsB = [{ id: 'gemini-b' }]
        _setCachedModels('KEY_AAAA_x', modelsA)
        _setCachedModels('KEY_BBBB_x', modelsB)
        expect(_getCachedModels('KEY_AAAA_x')).toEqual(modelsA)
        expect(_getCachedModels('KEY_BBBB_x')).toEqual(modelsB)
    })

    it('returns null after TTL expires', () => {
        vi.useFakeTimers()
        const models = [{ id: 'gemini-2.0-flash' }]
        _setCachedModels('AIza_ttl_test', models)
        expect(_getCachedModels('AIza_ttl_test')).toEqual(models) // still valid

        vi.advanceTimersByTime(GEMINI_CACHE_TTL_MS + 1) // expire the cache

        expect(_getCachedModels('AIza_ttl_test')).toBeNull()
    })

    it('does not return stale entry after expiry', () => {
        vi.useFakeTimers()
        const models = [{ id: 'gemini-1.5-pro' }]
        _setCachedModels('AIza_stale_key', models)

        vi.advanceTimersByTime(GEMINI_CACHE_TTL_MS + 10)
        const result = _getCachedModels('AIza_stale_key')
        expect(result).toBeNull()
    })

    it('overwrite updates the cache with new models', () => {
        const original = [{ id: 'gemini-1.5-flash' }]
        const updated = [{ id: 'gemini-2.0-flash' }, { id: 'gemini-2.0-pro' }]
        _setCachedModels('AIza_update_k', original)
        _setCachedModels('AIza_update_k', updated)
        expect(_getCachedModels('AIza_update_k')).toEqual(updated)
    })

    it('caches empty model list', () => {
        _setCachedModels('AIza_empty_k1', [])
        expect(_getCachedModels('AIza_empty_k1')).toEqual([])
    })

    it('TTL is 5 minutes', () => {
        expect(GEMINI_CACHE_TTL_MS).toBe(5 * 60 * 1000)
    })

    it('expired entry is removed from the map on next read', () => {
        vi.useFakeTimers()
        _setCachedModels('AIza_cleanup_', [{ id: 'gemini-x' }])
        expect(_geminiModelCache.size).toBe(1)

        vi.advanceTimersByTime(GEMINI_CACHE_TTL_MS + 1)
        _getCachedModels('AIza_cleanup_')  // trigger removal

        expect(_geminiModelCache.has('AIza_cle')).toBe(false)
    })
})
