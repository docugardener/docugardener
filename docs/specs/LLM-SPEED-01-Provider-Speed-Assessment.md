# LLM-SPEED-01 — LLM Provider Speed & Cost Assessment

**Date:** 2026-03-28
**Author:** SA (automated)
**Status:** Active — review quarterly

---

## Context

DocuGardener's drift evaluation pipeline makes 3 LLM calls per PR (draft generation, hallucination verification, drift proposal + verification). This assessment identifies the fastest and most cost-effective providers for this workload.

---

## DocuGardener's LLM Call Profile

| Parameter | Value |
|---|---|
| Calls per PR | 3 (generation → verification → drift analysis) |
| Input tokens per call | 2K–5K |
| Output tokens per call | 500–2K (generation) / 100–500 (verification JSON) |
| Temperature | 0.0 (deterministic) |
| Current default model | `gemini-2.0-flash` |
| Current cost per PR | ~$0.002 |
| Execution context | Background RQ worker (async, not user-blocking) |
| Workload type | Throughput-sensitive, latency-tolerant |

**Key insight:** TTFT matters less than total completion time and cost per PR, since analysis runs in a background worker — not blocking a user's browser.

---

## Speed Benchmarks (March 2026)

| Model | Output Speed (t/s) | TTFT (s) | Price (in/out per 1M tokens) | Quality Tier | Notes |
|---|---|---|---|---|---|
| **Llama 4 Scout** (Groq) | **750** | 0.59 | $0.11–0.17 (blended) | Good | 109B MoE, 17B active; fastest raw option |
| **Gemini 2.5 Flash-Lite** | **393** | 0.29 | ~$0.02/$0.10 | Good | Fastest TTFT; lightweight |
| **Gemini 2.0 Flash** (current) | **247** | 0.46 | $0.10/$0.40 | Good | Current DG default |
| **GPT-4o** | **232** | ~0.7 | $2.50/$10.00 | Very good | 25x more expensive than Gemini Flash |
| **Gemini 2.5 Flash** | **212** | 0.46 | $0.15/$0.60 | Very good | Better reasoning than 2.0 |
| **GPT-4.1 mini** | ~**200** | ~0.5 | $0.40/$1.60 | Good | 4x more expensive than Gemini Flash |
| **Claude Haiku 4.5** | **185** | 0.61 | $0.80/$4.00 | Good | 8x more expensive than Gemini Flash |
| **GPT-4.1** | ~**140** | ~0.8 | $2.00/$8.00 | Very good | Overkill for this workload |
| **GPT-4o mini** | **85** | ~0.6 | $0.15/$0.60 | Good | Slowest in tier |
| **Claude Sonnet 4.6** | **77** | 2.0 | $3.00/$15.00 | Excellent | Quality overkill; 3x slower, 37x cost |

---

## Cost Per PR Analysis (estimated 8K input + 3K output tokens)

| Model | Cost per PR | Speed (total ~3K output) | Monthly cost at 500 PRs |
|---|---|---|---|
| Gemini 2.0 Flash | **$0.002** | ~12s | $1.00 |
| Gemini 2.5 Flash-Lite | **$0.0005** | ~8s | $0.25 |
| Gemini 2.5 Flash | **$0.003** | ~14s | $1.50 |
| Llama 4 Scout (Groq) | **$0.001** | ~4s | $0.50 |
| GPT-4o mini | **$0.003** | ~35s | $1.50 |
| Claude Haiku 4.5 | **$0.018** | ~16s | $9.00 |
| GPT-4o | **$0.050** | ~13s | $25.00 |
| Claude Sonnet 4.6 | **$0.069** | ~39s | $34.50 |

---

## Recommendation

### Current Default: Gemini 2.0 Flash — Keep. Already optimal.

247 t/s, cheapest tier ($0.10/$0.40), 1M context window. Already integrated, tested, cost-tracked. No change needed.

### Upgrade Path

| Priority | Action | When | Why |
|---|---|---|---|
| P2 | **Monitor Gemini 2.5 Flash** for GA | When stable | Better reasoning quality, similar speed, slight cost increase |
| P2 | **Add Groq (Llama 4 Scout) as BYOK provider** | When capacity allows | 3x faster, cheapest overall — but quality needs validation on DG's prompt templates |
| P3 | **Evaluate Gemini 2.5 Flash-Lite** for verification calls | Future | Fastest TTFT, cheapest — may be sufficient for JSON verdict calls |

### Not Recommended

| Model | Why Not |
|---|---|
| Claude Haiku 4.5 | 8x more expensive, slower than Gemini Flash |
| GPT-4o mini | 3x slower, 4x more expensive |
| GPT-4o / GPT-4.1 | Quality overkill for deterministic verification; 25x cost |
| Claude Sonnet 4.6 | Excellent quality but 37x cost and 3x slower — no ROI for this workload |

---

## Provider Configuration Reference

Current DG cost table (`src/agents/verifier.py` lines 44–49):

```python
_PROVIDER_COSTS: dict[str, dict[str, float]] = {
    "gemini": {"input": 0.10, "output": 0.40},   # USD per 1M tokens
    "openai": {"input": 2.50, "output": 10.00},   # gpt-4o tier
    "ollama": {"input": 0.00, "output": 0.00},     # self-hosted
}
```

Supported providers: Gemini, OpenAI, Ollama (self-hosted). Groq not yet integrated.

---

## Sources

- [Artificial Analysis — LLM Leaderboard](https://artificialanalysis.ai/leaderboards/models)
- [LLM Latency Benchmark by Use Cases 2026](https://research.aimultiple.com/llm-latency-benchmark/)
- [Llama 4 Scout Provider Benchmarks](https://artificialanalysis.ai/models/llama-4-scout/providers)
- [Gemini 2.0 Flash Provider Benchmarks](https://artificialanalysis.ai/models/gemini-2-0-flash/providers)
- [Groq — Llama 4 Now Live](https://groq.com/blog/llama-4-now-live-on-groq-build-fast-at-the-lowest-cost-without-compromise)
- [Choosing an LLM in 2026 — Practical Comparison](https://dev.to/superorange0707/choosing-an-llm-in-2026-the-practical-comparison-table-specs-cost-latency-compatibility-354g)
