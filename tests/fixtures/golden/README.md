# Golden Dataset — EPIC-13 Fix PR Quality

Curated drift cases with deterministic scoring rubrics for offline quality
regression testing.  No LLM is needed to run the scorer.

## Case structure

```
case_NN_slug/
  input.json           # entity metadata + old/new code + existing docs
  expected_keywords.json  # required / preferred / must_not_contain keyword lists
  rubric.yaml          # scoring weights + pass_threshold
```

## Scoring formula

```
score = (required_coverage * w_required)
      + (preferred_coverage * w_preferred)
      - (must_not_hits * 0.10 * w_must_not)   # each hit deducts 10% of that weight
score = clamp(score, 0.0, 1.0)
```

Where `coverage = matched_keywords / total_keywords`.

## Cases

| # | Slug | Change type | Drift category |
|---|---|---|---|
| 01 | stale_params | SIGNATURE_CHANGED | Added parameters not reflected in docs |
| 02 | renamed_function | RENAMED | Old name still in docs |
| 03 | return_type_change | LOGIC_MODIFIED | Nullable return not documented |

## Adding a new case

```bash
python scripts/curate_golden_case.py \
  --entity create_webhook \
  --file src/api/webhooks.py \
  --change-type SIGNATURE_CHANGED \
  --description "Added secret + event_types params"
```

## Provenance policy

All cases must be one of:
- (a) from the `docugardener/docugardener` own repository
- (b) synthetic hand-crafted scenario
- (c) consenting beta customer (log consent before adding)

No unanonymized customer code.
