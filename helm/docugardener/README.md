# DocuGardener Helm Chart

Self-hosted Helm chart for on-premise deployments of DocuGardener.
Targets regulated industries (FinTech, MedTech, Government) that cannot use the SaaS offering.

## Requirements

- Kubernetes 1.25+
- Helm 3.14+
- External PostgreSQL, Redis, and Weaviate **or** bundled subcharts (dev only)

---

## Quick Start

```bash
# Add the OCI chart
helm pull oci://ghcr.io/docugardener/helm/docugardener --version 0.1.0

# 1. Create your secrets
kubectl create namespace docugardener
kubectl create secret generic docugardener-secrets \
  --namespace docugardener \
  --from-literal=DATABASE_URL="postgresql://user:pass@postgres.internal:5432/docugardener" \
  --from-literal=REDIS_URL="redis://redis.internal:6379/0" \
  --from-literal=GEMINI_API_KEY="your-key" \
  --from-literal=GITHUB_APP_ID="your-app-id" \
  --from-literal=GITHUB_PRIVATE_KEY="$(cat /path/to/private-key.pem)" \
  --from-literal=ENCRYPTION_KEY="your-32-byte-encryption-key!!!!!" \
  --from-literal=NEXTAUTH_SECRET="your-nextauth-secret" \
  --from-literal=NEXTAUTH_URL="https://docugardener.example.com"

# 2. Install
helm install docugardener oci://ghcr.io/docugardener/helm/docugardener \
  --version 0.1.0 \
  --namespace docugardener \
  --set secrets.existingSecret=docugardener-secrets \
  --set ingress.enabled=true \
  --set ingress.hosts[0].host=docugardener.example.com \
  --set ingress.tls[0].secretName=docugardener-tls \
  --set ingress.tls[0].hosts[0]=docugardener.example.com
```

---

## Configuration

### Required Secret Keys

| Key | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `GEMINI_API_KEY` | Google Gemini API key (or empty if BYOK) |
| `GITHUB_APP_ID` | GitHub App ID |
| `GITHUB_PRIVATE_KEY` | GitHub App private key (PEM) |
| `ENCRYPTION_KEY` | 32-byte key for field-level encryption |
| `NEXTAUTH_SECRET` | NextAuth.js secret |
| `NEXTAUTH_URL` | Public URL of the web service |

### External Databases (Production)

```yaml
# values-production.yaml
postgresql:
  enabled: false
  external:
    host: "postgres.internal"
    port: 5432

redis:
  enabled: false
  external:
    host: "redis.internal"
    port: 6379

weaviate:
  enabled: false
  external:
    host: "weaviate.internal"
    port: 8080
    scheme: http
```

### High Availability

```yaml
api:
  replicaCount: 3
  autoscaling:
    enabled: true
    minReplicas: 3
    maxReplicas: 10
    targetCPUUtilizationPercentage: 70

worker:
  replicaCount: 4
  autoscaling:
    enabled: true
    minReplicas: 4
    maxReplicas: 20

web:
  replicaCount: 2
```

---

## Air-Gap Installation

For environments with no external internet access:

### 1. Pull images to your registry

```bash
# Pull all required images
REGISTRY="my-registry.example.com"

docker pull ghcr.io/docugardener/api:1.0.0
docker pull ghcr.io/docugardener/web:1.0.0
docker pull redis:7-alpine
docker pull postgres:15-alpine
docker pull cr.weaviate.io/semitechnologies/weaviate:1.27.0

# Retag and push
docker tag ghcr.io/docugardener/api:1.0.0 ${REGISTRY}/docugardener/api:1.0.0
docker tag ghcr.io/docugardener/web:1.0.0 ${REGISTRY}/docugardener/web:1.0.0
docker push ${REGISTRY}/docugardener/api:1.0.0
docker push ${REGISTRY}/docugardener/web:1.0.0
```

### 2. Configure the chart for air-gap

```yaml
# values-airgap.yaml
global:
  imageRegistry: "my-registry.example.com"
  imagePullSecrets:
    - name: registry-credentials

api:
  image:
    repository: docugardener/api
    tag: "1.0.0"

worker:
  image:
    repository: docugardener/api
    tag: "1.0.0"

scheduler:
  image:
    repository: docugardener/api
    tag: "1.0.0"

web:
  image:
    repository: docugardener/web
    tag: "1.0.0"
```

### 3. Install

```bash
helm install docugardener ./docugardener-0.1.0.tgz \
  --namespace docugardener \
  -f values-production.yaml \
  -f values-airgap.yaml \
  --set secrets.existingSecret=docugardener-secrets
```

---

## Security

This chart is Pod Security Admission (PSA) **restricted** compliant:

| Control | Value |
|---|---|
| `runAsNonRoot` | `true` — UID 1000 |
| `readOnlyRootFilesystem` | `true` — `/tmp` via `emptyDir` |
| `allowPrivilegeEscalation` | `false` |
| `capabilities.drop` | `[ALL]` |
| `seccompProfile` | `RuntimeDefault` |
| `automountServiceAccountToken` | `false` |
| NetworkPolicy | Default deny-all + explicit whitelist |

To verify compliance against the restricted PSA profile:

```bash
helm template docugardener . -f ci/test-values.yaml | \
  kubectl apply --dry-run=server --namespace docugardener -f -
```

---

## Secrets Management

**Never use `secrets.create.enabled=true` in production.**

Recommended patterns:

- **Sealed Secrets**: `kubeseal` encrypts secrets at rest in Git
- **Vault Agent Injection**: Sidecar injects secrets at pod startup
- **External Secrets Operator**: Syncs from AWS Secrets Manager, Azure Key Vault, GCP Secret Manager

---

## Upgrading

```bash
helm upgrade docugardener oci://ghcr.io/docugardener/helm/docugardener \
  --version 0.2.0 \
  --namespace docugardener \
  --reuse-values
```

Deployments use `RollingUpdate` (maxUnavailable=0) so upgrades are zero-downtime.
The scheduler uses `Recreate` to ensure the singleton constraint.

---

## Uninstall

```bash
helm uninstall docugardener --namespace docugardener

# Secrets are kept by default (helm.sh/resource-policy: keep)
# To delete manually:
kubectl delete secret docugardener-secrets --namespace docugardener
```
