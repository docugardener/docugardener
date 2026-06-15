# SPDX-License-Identifier: AGPL-3.0-or-later
"""Application configuration using Pydantic Settings."""

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Application settings loaded from environment variables.

    All settings can be overridden via environment variables or .env file.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Application
    app_name: str = Field(default="DocuGardener")
    version: str = Field(default="0.1.0")
    app_env: Literal["development", "staging", "production"] = Field(default="development")
    debug: bool = Field(default=False)
    log_level: str = Field(default="INFO")

    # Server
    host: str = Field(default="0.0.0.0")
    port: int = Field(default=8000)
    workers: int = Field(default=1)
    allowed_origins: list[str] = Field(default_factory=list)

    # GitHub App
    github_app_id: str | None = Field(default=None)
    github_private_key_path: Path | None = Field(default=None)
    github_webhook_secret: str | None = Field(default=None)

    # Vector Database
    vector_db_provider: Literal["pinecone", "weaviate"] = Field(default="pinecone")

    # Pinecone
    pinecone_api_key: str | None = Field(default=None)
    pinecone_environment: str = Field(default="us-east-1")
    pinecone_index_name: str = Field(default="docugardener")

    # Weaviate
    weaviate_url: str = Field(default="http://localhost:8080")
    weaviate_api_key: str | None = Field(default=None)

    # LLM
    llm_provider: Literal["gemini", "ollama", "openai", "anthropic"] = Field(default="gemini")

    # Google Gemini
    gemini_api_key: str | None = Field(default=None)
    gemini_model: str = Field(default="gemini-2.0-flash")

    # OpenAI
    openai_api_key: str | None = Field(default=None)
    openai_model: str = Field(default="gpt-4o")

    # Anthropic
    anthropic_api_key: str | None = Field(default=None)
    resend_api_key: str | None = None
    anthropic_model: str = Field(default="claude-sonnet-4-6")

    # Email / SMTP (Google Workspace in production)
    smtp_host: str | None = Field(default=None)
    smtp_port: int = Field(default=587)
    smtp_secure: bool = Field(default=False)
    smtp_user: str | None = Field(default=None)
    smtp_pass: str | None = Field(default=None)
    email_from: str = Field(default="DocuGardener <noreply@docugardener.dev>")

    # Ollama
    ollama_url: str = Field(default="http://localhost:11434")
    ollama_model: str = Field(default="llama3")

    # Embeddings
    embeddings_model: str = Field(default="sentence-transformers/all-MiniLM-L6-v2")

    # Redis
    redis_url: str = Field(default="redis://localhost:6379/0")

    # Security
    tmpfs_path: Path = Field(default=Path("/tmp/docugardener"))
    max_processing_time: int = Field(default=120)  # seconds
    max_concurrent_file_workers: int = Field(default=5)  # EPIC-09: parallel file analysis
    drift_score_threshold: int = Field(default=70)  # 0-100
    encryption_key: str | None = Field(default=None)  # 32-byte hex for BYOK

    # Enterprise
    byok_enabled: bool = Field(default=False)
    sql_database_url: str | None = Field(default=None)  # Web DB connection; required in production

    # HYB-02: Deployment mode — drives all hybrid-distribution conditional behavior.
    # saas (default): multi-tenant hosted, Stripe billing, cloud LLM.
    # client-installed: single-tenant, license-key billing, code never leaves customer network.
    # air-gap: single-tenant, offline license file, no outbound connections permitted.
    deployment_mode: Literal["saas", "client-installed", "air-gap"] = Field(default="saas")

    # HYB-03: Fixed tenant ID for single-tenant (client-installed / air-gap) deployments.
    # Auto-populated by ensure_tenant_provisioned() at startup; can be set explicitly.
    single_tenant_id: str | None = Field(default=None)

    # HYB-04: Single-tenant provisioning
    github_org: str | None = Field(default=None)  # Required in client-installed/air-gap mode
    admin_email: str | None = Field(default=None)  # Initial admin user email (non-saas)

    # HYB-06: License portal URL for client-installed billing page
    license_portal_url: str = Field(default="")

    # HYB-07: Air-gap offline license file path
    license_file_path: str = Field(default="/etc/docugardener/license.json")

    # HYB-12: Cloud connector (client-installed mode only)
    cloud_service_url: str = Field(default="https://cloud.docugardener.dev")
    license_key: str = Field(default="")  # dg_lic_<32hex>; required in client-installed mode
    telemetry_enabled: bool = Field(default=False)

    # Application URL (used for callback URLs and feedback links)
    app_url: str = Field(default="http://localhost:8000")

    # Frontend URL — where the Next.js dashboard runs.
    # Used for feedback redirects so the browser lands on the dashboard, not the API.
    # Defaults to app_url for single-process deployments; override in dev when ports differ.
    frontend_url: str = Field(default="")

    # FEED-01: Analysis Feedback Signal
    # HMAC-SHA256 signing secret for one-click feedback links in PR comments.
    # Set to a 32+ char random string in production; leave empty to disable feedback links.
    feedback_hmac_secret: str = Field(default="")

    # Zero-Config Bundled LLM Key (UX-03)
    # Rate-limited fallback key used when a tenant has no llmConfig configured.
    # Tenants see the product working on Day 0 without touching Settings.
    # Leave empty to disable the fallback (tenants must supply their own key).
    bundled_gemini_key: str = Field(default="")
    bundled_gemini_model: str = Field(default="gemini-2.0-flash")
    platform_llm_monthly_cap_usd: float = Field(default=10.0)

    # EPIC-11: Cross-repo drift detection (demo scope only).
    # Scale ceiling validated for ≤30 docs/namespace × ≤3 repos (Spike 1b-v2).
    # Re-spike required before enabling for tenants with >1k docs/namespace.
    # Per-tenant opt-in via workflowConfig.cross_repo_siblings — this flag is
    # the global kill switch; both must be true for cross-repo to activate.
    cross_repo_beta: bool = Field(default=False, alias="CROSS_REPO_BETA")

    # Stripe Billing
    # stripe_secret_key:    sk_test_xxx  (sandbox) / sk_live_xxx  (production)
    # stripe_webhook_secret: whsec_xxx   (from Stripe Dashboard → Webhooks)
    # stripe_price_pro:      price_xxx   (Pro plan monthly price ID)
    # stripe_price_team:     price_xxx   (Team plan monthly price ID)
    stripe_secret_key: str = Field(default="")
    stripe_webhook_secret: str = Field(default="")
    billing_enabled: bool = Field(default=False)
    stripe_price_pro: str = Field(default="")
    stripe_price_team: str = Field(default="")

    @field_validator("deployment_mode", mode="before")
    @classmethod
    def normalize_deployment_mode(cls, v: str) -> str:
        """HYB-02: Map legacy 'sovereign' value to 'client-installed' for backward compat."""
        if v == "sovereign":
            return "client-installed"
        return v

    @field_validator("log_level")
    @classmethod
    def validate_log_level(cls, v: str) -> str:
        """Ensure log level is valid."""
        valid = ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]
        v_upper = v.upper()
        if v_upper not in valid:
            raise ValueError(f"log_level must be one of {valid}")
        return v_upper

    def validate_production_config(self) -> None:
        """SEC-11: Raise at startup if required production settings are missing.

        Called explicitly from main.py lifespan so tests can instantiate
        Settings freely without triggering the validation.
        """
        if self.app_env != "production":
            return
        if not self.allowed_origins:
            raise RuntimeError(
                "SEC-11: ALLOWED_ORIGINS must be explicitly set in production. "
                'Example: ALLOWED_ORIGINS=["https://docugardener.dev"]'
            )
        if not self.sql_database_url:
            raise RuntimeError("SEC-11: SQL_DATABASE_URL must be set in production.")
        if not self.feedback_hmac_secret:
            raise RuntimeError(
                "FEED-01: FEEDBACK_HMAC_SECRET must be set in production. "
                "Generate with: openssl rand -hex 32"
            )
        # GITHUB_ORG is a display name — warn if missing but do not block startup

    @property
    def is_production(self) -> bool:
        """Check if running in production environment."""
        return self.app_env == "production"


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


# Global settings instance
settings = get_settings()
