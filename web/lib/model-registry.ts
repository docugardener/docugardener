// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * LLM-08: TypeScript mirror of src/agents/model_registry.py for UI and API route use.
 *
 * Provides capability hints and context window sizes for known models.
 * Unknown models default to "standard" hint.
 */

export type CapabilityHint = "standard" | "oss" | "reasoning" | "thinking"

export interface ModelMeta {
    capability_hint: CapabilityHint
    context_window?: number
}

// Exact model ID → metadata
const MODEL_META: Record<string, ModelMeta> = {
    // Gemini standard
    "gemini-2.0-flash":               { capability_hint: "standard", context_window: 1_048_576 },
    "gemini-2.0-flash-lite":          { capability_hint: "standard", context_window: 1_048_576 },
    "gemini-2.5-flash":               { capability_hint: "standard", context_window: 1_048_576 },
    "gemini-2.5-pro":                 { capability_hint: "standard", context_window: 2_097_152 },
    "gemini-1.5-flash":               { capability_hint: "standard", context_window: 1_048_576 },
    "gemini-1.5-flash-8b":            { capability_hint: "standard", context_window: 1_048_576 },
    "gemini-1.5-pro":                 { capability_hint: "standard", context_window: 2_097_152 },
    // Gemini thinking
    "gemini-2.0-flash-thinking-exp":      { capability_hint: "thinking", context_window: 32_767 },
    "gemini-2.0-flash-thinking-exp-01-21":{ capability_hint: "thinking", context_window: 32_767 },
    "gemini-2.5-flash-thinking-exp":      { capability_hint: "thinking", context_window: 65_536 },
    // Gemma OSS
    "gemma-3-1b-it":   { capability_hint: "oss", context_window: 32_768 },
    "gemma-3-4b-it":   { capability_hint: "oss", context_window: 32_768 },
    "gemma-3-12b-it":  { capability_hint: "oss", context_window: 131_072 },
    "gemma-3-27b-it":  { capability_hint: "oss", context_window: 131_072 },
    // OpenAI standard
    "gpt-4o":       { capability_hint: "standard", context_window: 128_000 },
    "gpt-4o-mini":  { capability_hint: "standard", context_window: 128_000 },
    "gpt-4-turbo":  { capability_hint: "standard", context_window: 128_000 },
    "gpt-4":        { capability_hint: "standard", context_window: 8_192 },
    // OpenAI reasoning
    "o1":           { capability_hint: "reasoning", context_window: 200_000 },
    "o1-mini":      { capability_hint: "reasoning", context_window: 128_000 },
    "o1-preview":   { capability_hint: "reasoning", context_window: 128_000 },
    "o3":           { capability_hint: "reasoning", context_window: 200_000 },
    "o3-mini":      { capability_hint: "reasoning", context_window: 200_000 },
    "o4-mini":      { capability_hint: "reasoning", context_window: 200_000 },
}

// Prefix patterns for versioned snapshot IDs (e.g., gpt-4o-2024-11-20)
const PREFIX_PATTERNS: Array<{ prefix: string; meta: ModelMeta }> = [
    { prefix: "gemini-2.0-flash-thinking", meta: { capability_hint: "thinking" } },
    { prefix: "gemini-2.5-flash-thinking", meta: { capability_hint: "thinking" } },
    { prefix: "gemma-",                    meta: { capability_hint: "oss" } },
    { prefix: "gpt-4o",                    meta: { capability_hint: "standard" } },
    { prefix: "gpt-4",                     meta: { capability_hint: "standard" } },
    { prefix: "o1",                        meta: { capability_hint: "reasoning" } },
    { prefix: "o3",                        meta: { capability_hint: "reasoning" } },
    { prefix: "o4",                        meta: { capability_hint: "reasoning" } },
]

/**
 * Returns capability metadata for a given model ID.
 * Falls back to { capability_hint: "standard" } for unknown models.
 */
export function getModelMeta(modelId: string): ModelMeta {
    if (MODEL_META[modelId]) return MODEL_META[modelId]
    for (const { prefix, meta } of PREFIX_PATTERNS) {
        if (modelId.startsWith(prefix)) return meta
    }
    return { capability_hint: "standard" }
}

/**
 * OpenAI model IDs that are chat-capable and worth surfacing in the UI.
 * Used to filter the /v1/models endpoint which returns all model types.
 */
const OPENAI_CHAT_PREFIXES = ["gpt-4", "o1", "o3", "o4"]
const OPENAI_CHAT_EXACT = new Set(["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-4"])
const OPENAI_EXCLUDE_SUBSTRINGS = [
    "instruct", "embedding", "dall-e", "whisper", "tts", "babbage",
    "davinci", "curie", "ada", "audio", "realtime",
]

export function isOpenAIChatModel(modelId: string): boolean {
    if (OPENAI_CHAT_EXACT.has(modelId)) return true
    if (OPENAI_EXCLUDE_SUBSTRINGS.some(s => modelId.includes(s))) return false
    return OPENAI_CHAT_PREFIXES.some(p => modelId.startsWith(p))
}
