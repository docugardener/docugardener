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
```

## Acceptance criteria

See `docs/specs/FEAT-018-Cross-Repo-Drift-Prototype.md` and the spike plan
written in the session of 2026-04-19.

## Hard stops

- Spike 1 AC1.1 (latency) or AC1.4 (isolation) fail → EPIC-11 deferred to 2027
- Spike 2 AC2.2 (false positives) fails consistently across 5 runs → no-go
