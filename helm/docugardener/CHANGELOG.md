# Helm Chart Changelog

## 0.2.0 — 2026-04-17

First publicly verified OCI release.

- PSA `restricted` namespace validated (zero admission violations on dry-run)
- NetworkPolicy egress rules confirmed non-permissive (worker restricted to Postgres, Redis, Weaviate, GitHub API)
- Cosign keyless signing via GitHub Actions OIDC — verify with:
  ```bash
  cosign verify \
    --certificate-identity-regexp "https://github.com/docugardener/docugardener/.*" \
    --certificate-oidc-issuer "https://token.actions.githubusercontent.com" \
    ghcr.io/docugardener/helm/docugardener:0.2.0
  ```
- KEDA `ScaledObject` template included (`keda.enabled: false` by default — enable when running the KEDA operator at scale)
- Worker command corrected to `rq worker high default` (priority queue support)

## 0.1.0 — 2026-04-16

Initial chart publish via CI (`helm-publish.yml`). Not publicly verified.
