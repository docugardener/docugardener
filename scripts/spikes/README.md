# EPIC-11 Cross-Repo Drift — Pre-Prototype Spikes

Branch: `feat/EPIC-11-cross-repo-spike`

These scripts validate the feasibility of cross-repo drift detection before any
production code is touched. Run them sequentially — each is a go/no-go gate.

## Prerequisites

```bash
source .venv/bin/activate
export DOCKER_HOST="unix://$HOME/.colima/default/docker.sock"
make dev-up   # Weaviate + Redis must be running
```

## Run order (fail-fast — stop if any spike fails its hard ACs)

```bash
# Spike 1: Weaviate multi-namespace fan-out
python scripts/spikes/spike_01_weaviate_crossns.py

# Spike 2: LLM cross-repo prompt validation (run only if Spike 1 passes)
python scripts/spikes/spike_02_llm_crossrepo.py

# Spike 3: End-to-end integration (run only if Spike 2 passes)
python scripts/spikes/spike_03_e2e_demo.py

# Spike 1b: False positive calibration — realistic corpus + plan tier limits
#   Run after Spike 2. Final go/no-go gate.
python scripts/spikes/spike_01b_false_positives.py
```

## Acceptance criteria

See `docs/specs/FEAT-018-Cross-Repo-Drift-Prototype.md` and the spike plan
written in the session of 2026-04-19.

## Hard stops

- Spike 1 AC1.1 (latency) or AC1.4 (isolation) fail → EPIC-11 deferred to 2027
- Spike 2 AC2.2 (false positives) fails consistently across 5 runs → no-go
- Spike 1b AC1b-3 (HR namespace = 0 findings) fails → no-go (domain isolation broken)

---

## Results (run 2026-04-19)

| Spike | Status | Key numbers |
|-------|--------|-------------|
| Spike 1 — Weaviate fan-out | ✅ PASS | Fan-out latency ~0.01 s; namespace isolation hard-pass |
| Spike 2 — LLM prompt | ✅ PASS | True positive=100%, true negative=0 false positives across 3 runs |
| Spike 3 — E2E integration | ✅ PASS | 6/6 signal findings; empty result on no-impact scenario |
| Spike 1b — False positive calibration | ✅ PASS | See detail below |

### Spike 1b detail (2026-04-19)

Corpus: 90 docs across 3 sibling namespaces (SDK × 29, Docs × 29, HR-tool × 30).
HR namespace is pure noise — all 30 docs belong to a different domain (HR payroll tool
that happens to have a `users` table). This is the classic false-positive trap.

| AC | Description | TEAM config | ENT config | Result |
|----|-------------|-------------|------------|--------|
| AC1b-1 | Finding count ≤ tier limit | 3/3/3 ≤ 3 | — | ✅ PASS |
| AC1b-2 | Finding count ≤ tier limit | — | 4/4/4 ≤ 5 | ✅ PASS |
| **AC1b-3** | **HR namespace = 0 findings (HARD STOP)** | **0/0/0** | **0/0/0** | **✅ PASS** |
| AC1b-4 | Signal ranks above tangential | avg rank 5.0 vs 10.1 | | ✅ PASS |
| AC1b-5 | Consistent across 3 LLM runs | [3,3,3] | [4,4,4] | ✅ PASS |

**Configs validated:**
- TEAM: `top_k_per_ns=3`, `min_confidence=60` → exactly 3 SIGNAL findings per run
- ENTERPRISE: `top_k_per_ns=5`, `min_confidence=50` → exactly 4 SIGNAL findings per run
  (4th finding = `demo-sdk/README.md` conf=90–100, correctly excluded at TEAM threshold)

**Confidence scores on true positives:** 90–100 across all runs (deterministic output).

**Conclusion: 5/5 PASS → FORMAL GO on EPIC-11 implementation.**
