"""
QUALITY-02: Smoke tests for src/monitoring/metrics.py

Verifies that:
- All metric objects are importable and have the expected names
- Helper functions are callable without error
- record_* helpers accept valid arguments without raising
"""

import pytest

from src.monitoring.metrics import (
    WEBHOOKS_RECEIVED,
    WEBHOOKS_PROCESSED,
    WEBHOOKS_FAILED,
    ANALYSES_TOTAL,
    ANALYSIS_DURATION,
    DRIFT_SCORE,
    LLM_REQUESTS,
    LLM_LATENCY,
    LLM_ERRORS,
    VECTORDB_OPERATIONS,
    VECTORDB_LATENCY,
    record_webhook,
    record_analysis,
    record_llm_request,
    record_vectordb_operation,
)


class TestMetricRegistration:

    def test_webhooks_received_is_counter(self):
        # prometheus_client Counter exposes .labels()
        assert hasattr(WEBHOOKS_RECEIVED, "labels")

    def test_webhooks_processed_is_counter(self):
        assert hasattr(WEBHOOKS_PROCESSED, "labels")

    def test_webhooks_failed_is_counter(self):
        assert hasattr(WEBHOOKS_FAILED, "labels")

    def test_analyses_total_is_counter(self):
        assert hasattr(ANALYSES_TOTAL, "labels")

    def test_analysis_duration_is_histogram(self):
        assert hasattr(ANALYSIS_DURATION, "labels")

    def test_llm_requests_is_counter(self):
        assert hasattr(LLM_REQUESTS, "labels")

    def test_llm_latency_is_histogram(self):
        assert hasattr(LLM_LATENCY, "labels")

    def test_llm_errors_is_counter(self):
        assert hasattr(LLM_ERRORS, "labels")

    def test_vectordb_operations_is_counter(self):
        assert hasattr(VECTORDB_OPERATIONS, "labels")

    def test_vectordb_latency_is_histogram(self):
        assert hasattr(VECTORDB_LATENCY, "labels")


class TestRecordWebhook:

    def test_success_does_not_raise(self):
        record_webhook("pull_request", success=True)

    def test_failure_does_not_raise(self):
        record_webhook("pull_request", success=False, error_type="ValueError")

    def test_unknown_event_does_not_raise(self):
        record_webhook("unknown_event", success=True)

    def test_empty_error_type_on_success(self):
        # Default error_type="" should not increment WEBHOOKS_FAILED
        record_webhook("ping", success=True, error_type="")


class TestRecordAnalysis:

    def test_successful_analysis_does_not_raise(self):
        record_analysis(
            repo="org/repo",
            duration_seconds=3.14,
            drift_score=45,
            severity="minor",
            entities_count=5,
            success=True,
        )

    def test_failed_analysis_does_not_raise(self):
        record_analysis(
            repo="org/repo",
            duration_seconds=0.5,
            drift_score=0,
            severity="none",
            entities_count=0,
            success=False,
        )

    def test_zero_duration_does_not_raise(self):
        record_analysis(
            repo="org/repo",
            duration_seconds=0.0,
            drift_score=10,
            severity="minor",
            entities_count=1,
            success=True,
        )


class TestRecordLLMRequest:

    def test_successful_request_does_not_raise(self):
        record_llm_request(
            provider="gemini",
            model="gemini-2.0-flash",
            purpose="generate",
            latency_seconds=1.2,
        )

    def test_failed_request_with_error_type_does_not_raise(self):
        record_llm_request(
            provider="gemini",
            model="gemini-2.0-flash",
            purpose="drift_proposal",
            latency_seconds=0.3,
            error_type="TimeoutError",
        )

    def test_ollama_provider_does_not_raise(self):
        record_llm_request(
            provider="ollama",
            model="llama3",
            purpose="verify",
            latency_seconds=5.0,
        )


class TestRecordVectorDBOperation:

    def test_weaviate_store_does_not_raise(self):
        record_vectordb_operation(
            provider="weaviate",
            operation="store",
            latency_seconds=0.05,
        )

    def test_pinecone_search_does_not_raise(self):
        record_vectordb_operation(
            provider="pinecone",
            operation="search",
            latency_seconds=0.12,
        )
