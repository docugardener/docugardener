# SPDX-License-Identifier: AGPL-3.0-or-later
"""
Prometheus metrics for observability.

Exposes metrics for monitoring DocuGardener performance and health.
"""

from prometheus_client import Counter, Gauge, Histogram, Info

from src.core.logging import get_logger

logger = get_logger(__name__)


# Application info
APP_INFO = Info(
    "docugardener_app",
    "Application information",
)

# Request metrics
HTTP_REQUESTS_TOTAL = Counter(
    "docugardener_http_requests_total",
    "Total HTTP requests",
    ["method", "endpoint", "status"],
)

HTTP_REQUEST_DURATION = Histogram(
    "docugardener_http_request_duration_seconds",
    "HTTP request duration in seconds",
    ["method", "endpoint"],
    buckets=[0.01, 0.05, 0.1, 0.5, 1.0, 2.0, 5.0, 10.0],
)

# Webhook metrics
WEBHOOKS_RECEIVED = Counter(
    "docugardener_webhooks_received_total",
    "Total webhooks received",
    ["event_type"],
)

WEBHOOKS_PROCESSED = Counter(
    "docugardener_webhooks_processed_total",
    "Total webhooks successfully processed",
    ["event_type"],
)

WEBHOOKS_FAILED = Counter(
    "docugardener_webhooks_failed_total",
    "Total webhooks that failed processing",
    ["event_type", "error_type"],
)

# Analysis metrics
ANALYSES_TOTAL = Counter(
    "docugardener_analyses_total",
    "Total PR analyses performed",
    ["repo", "result"],
)

ANALYSIS_DURATION = Histogram(
    "docugardener_analysis_duration_seconds",
    "PR analysis duration in seconds",
    ["repo"],
    buckets=[1, 5, 10, 30, 60, 120, 300],
)

DRIFT_SCORE = Histogram(
    "docugardener_drift_score",
    "Distribution of drift scores",
    ["severity"],
    buckets=[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
)

ENTITIES_ANALYZED = Histogram(
    "docugardener_entities_analyzed",
    "Number of entities analyzed per PR",
    buckets=[1, 5, 10, 25, 50, 100, 500],
)

DOC_UPDATES_GENERATED = Counter(
    "docugardener_doc_updates_generated_total",
    "Total documentation updates generated",
    ["verified"],
)

# LLM metrics
LLM_REQUESTS = Counter(
    "docugardener_llm_requests_total",
    "Total LLM API requests",
    ["provider", "model", "purpose"],
)

LLM_LATENCY = Histogram(
    "docugardener_llm_latency_seconds",
    "LLM request latency in seconds",
    ["provider", "purpose"],
    buckets=[0.5, 1, 2, 5, 10, 30],
)

LLM_ERRORS = Counter(
    "docugardener_llm_errors_total",
    "Total LLM API errors",
    ["provider", "error_type"],
)

HALLUCINATIONS_DETECTED = Counter(
    "docugardener_hallucinations_detected_total",
    "Total hallucinations detected by verifier",
)

# EPIC-04-02/03: LLM token counters for Grafana cache hit rate panel (all providers)
LLM_PROMPT_TOKENS = Counter(
    "docugardener_llm_prompt_tokens_total",
    "Total prompt (input) tokens sent to LLM — denominator for cache hit rate",
    ["provider", "model"],
)

LLM_CACHE_READ_TOKENS = Counter(
    "docugardener_llm_cache_read_tokens_total",
    "LLM prompt-cache read tokens (tokens served from cache — Anthropic, OpenAI, Gemini)",
    ["provider", "model"],
)

LLM_CACHE_CREATION_TOKENS = Counter(
    "docugardener_llm_cache_creation_tokens_total",
    "LLM prompt-cache creation tokens written to cache (Anthropic only; OpenAI/Gemini cache automatically)",
    ["provider", "model"],
)

# Vector DB metrics
VECTORDB_OPERATIONS = Counter(
    "docugardener_vectordb_operations_total",
    "Total vector DB operations",
    ["provider", "operation"],
)

VECTORDB_LATENCY = Histogram(
    "docugardener_vectordb_latency_seconds",
    "Vector DB operation latency",
    ["provider", "operation"],
    buckets=[0.01, 0.05, 0.1, 0.5, 1.0, 5.0],
)

# Tenant metrics
ACTIVE_TENANTS = Gauge(
    "docugardener_active_tenants",
    "Number of active tenants",
    ["tier"],
)

TENANT_QUOTA_USAGE = Gauge(
    "docugardener_tenant_quota_usage_ratio",
    "Tenant quota usage ratio (0-1)",
    ["tenant_id", "quota_type"],
)

# System metrics
QUEUE_SIZE = Gauge(
    "docugardener_queue_size",
    "Number of jobs in the queue",
    ["queue_name"],
)

PROCESSING_JOBS = Gauge(
    "docugardener_processing_jobs",
    "Number of jobs currently processing",
)

JOBS_COMPLETED = Counter(
    "docugardener_jobs_completed_total",
    "Total number of analysis jobs completed (success or failure)",
    ["status"],  # labels: success | failed
)


def init_app_info(version: str, environment: str) -> None:
    """Initialize application info metric."""
    APP_INFO.info(
        {
            "version": version,
            "environment": environment,
        }
    )


def record_webhook(event_type: str, success: bool, error_type: str = "") -> None:
    """Record a webhook event."""
    WEBHOOKS_RECEIVED.labels(event_type=event_type).inc()

    if success:
        WEBHOOKS_PROCESSED.labels(event_type=event_type).inc()
    else:
        WEBHOOKS_FAILED.labels(event_type=event_type, error_type=error_type).inc()


def record_analysis(
    repo: str,
    duration_seconds: float,
    drift_score: int,
    severity: str,
    entities_count: int,
    success: bool,
) -> None:
    """Record a completed analysis."""
    result = "success" if success else "failure"

    ANALYSES_TOTAL.labels(repo=repo, result=result).inc()
    ANALYSIS_DURATION.labels(repo=repo).observe(duration_seconds)
    DRIFT_SCORE.labels(severity=severity).observe(drift_score)
    ENTITIES_ANALYZED.observe(entities_count)


def record_llm_request(
    provider: str,
    model: str,
    purpose: str,
    latency_seconds: float,
    error_type: str = "",
    prompt_tokens: int = 0,
    cache_read_tokens: int = 0,
    cache_creation_tokens: int = 0,
) -> None:
    """Record an LLM API request."""
    LLM_REQUESTS.labels(provider=provider, model=model, purpose=purpose).inc()
    LLM_LATENCY.labels(provider=provider, purpose=purpose).observe(latency_seconds)

    if error_type:
        LLM_ERRORS.labels(provider=provider, error_type=error_type).inc()

    # EPIC-04-02/03: track prompt-cache token counts for Grafana cache hit rate panel (all providers)
    if prompt_tokens:
        LLM_PROMPT_TOKENS.labels(provider=provider, model=model).inc(prompt_tokens)
    if cache_read_tokens:
        LLM_CACHE_READ_TOKENS.labels(provider=provider, model=model).inc(cache_read_tokens)
    if cache_creation_tokens:
        LLM_CACHE_CREATION_TOKENS.labels(provider=provider, model=model).inc(cache_creation_tokens)


def record_vectordb_operation(
    provider: str,
    operation: str,
    latency_seconds: float,
) -> None:
    """Record a vector DB operation."""
    VECTORDB_OPERATIONS.labels(provider=provider, operation=operation).inc()
    VECTORDB_LATENCY.labels(provider=provider, operation=operation).observe(latency_seconds)


# EPIC-11: Cross-repo analysis metrics
CROSS_REPO_CALLS = Counter(
    "docugardener_cross_repo_calls_total",
    "Total cross-repo analysis LLM calls",
    ["result"],  # labels: ok | error | empty
)

CROSS_REPO_FINDINGS = Histogram(
    "docugardener_cross_repo_findings_count",
    "Number of cross-repo findings per analysis",
    buckets=[0, 1, 2, 3, 4, 5],
)

CROSS_REPO_LATENCY = Histogram(
    "docugardener_cross_repo_latency_seconds",
    "End-to-end latency for cross-repo analysis (retrieval + LLM)",
    buckets=[0.5, 1.0, 2.0, 5.0, 10.0, 30.0],
)


def record_cross_repo(result: str, findings_count: int, latency_seconds: float) -> None:
    """Record a cross-repo analysis pass.

    Args:
        result:          "ok" | "error" | "empty" (no findings after filtering)
        findings_count:  Number of findings returned (0 on error or empty).
        latency_seconds: Wall time for full cross-repo pass (retrieval + LLM).
    """
    CROSS_REPO_CALLS.labels(result=result).inc()
    CROSS_REPO_FINDINGS.observe(findings_count)
    CROSS_REPO_LATENCY.observe(latency_seconds)
