// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * LLM-09: Per-provider LLM config shape + silent migration from legacy single-key shape.
 *
 * NEW shape (written by this code):
 * {
 *   provider: "gemini" | "openai" | "ollama" | "platform_default",
 *   keys:     { gemini?: string, openai?: string },   // AES-256 encrypted
 *   models:   { gemini?: string, openai?: string, ollama?: string },
 *   baseUrls: { ollama?: string },
 *   promptTone?: string,
 *   scoringModel?: string,
 * }
 *
 * LEGACY shape (written by old code, still in DB for existing tenants):
 * {
 *   provider: string,
 *   apiKey?:  string,    // encrypted — belongs to whichever provider was active
 *   modelName?: string,
 *   baseUrl?: string,
 *   promptTone?: string,
 *   scoringModel?: string,
 * }
 *
 * migrateLlmConfig() is idempotent and can be called on both shapes.
 */

export interface LlmConfigNew {
    provider: string
    keys: Record<string, string | undefined>    // provider → encrypted key
    models: Record<string, string | undefined>  // provider → model ID
    baseUrls: Record<string, string | undefined>
    promptTone?: string
    scoringModel?: string
}

/**
 * Normalise any stored llmConfig (old or new shape) to LlmConfigNew.
 * Pure function — never writes to DB.
 */
export function migrateLlmConfig(raw: any): LlmConfigNew {
    // Already migrated if the `keys` sub-object is present
    if (raw?.keys && typeof raw.keys === "object") {
        return raw as LlmConfigNew
    }

    const provider: string = raw?.provider ?? "gemini"

    const result: LlmConfigNew = {
        provider,
        keys: {},
        models: {},
        baseUrls: {},
        promptTone: raw?.promptTone,
        scoringModel: raw?.scoringModel,
    }

    // Promote old apiKey to keys[provider] (already encrypted in DB)
    if (raw?.apiKey && provider !== "platform_default") {
        result.keys[provider] = raw.apiKey
    }

    // Promote old modelName to models[provider]
    if (raw?.modelName && provider !== "platform_default") {
        result.models[provider] = raw.modelName
    }

    // Promote old baseUrl to baseUrls.ollama
    if (raw?.baseUrl) {
        result.baseUrls.ollama = raw.baseUrl
    }

    return result
}

/**
 * Returns true if an encrypted key is stored for the given provider.
 * Handles both the new and legacy config shapes.
 */
export function hasStoredKey(config: any, provider: string): boolean {
    if (!config) return false
    // New shape
    if (config.keys?.[provider]) return true
    // Legacy shape — only counts if it was saved for this provider
    if (config.apiKey && (!config.provider || config.provider === provider)) return true
    return false
}

/**
 * Returns { gemini: bool, openai: bool, ollama: bool } indicating which providers
 * have stored API keys.  Ollama is always false (no key needed).
 */
export function getKeyStatusPerProvider(config: any): Record<string, boolean> {
    return {
        gemini: hasStoredKey(config, "gemini"),
        openai: hasStoredKey(config, "openai"),
        anthropic: hasStoredKey(config, "anthropic"),
        ollama: false,
    }
}
