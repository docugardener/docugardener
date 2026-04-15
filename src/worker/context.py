# SPDX-License-Identifier: AGPL-3.0-or-later
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from src.core.config import settings
from src.security.encryption import decrypt_credential
from src.storage.sql_models import Tenant

# Setup Sync Engine (Workers are typically synchronous or use simple threading)
# For high-throughput, asyncpg would be better, but standard pyscopg2 is robust for now.
engine = create_engine(settings.sql_database_url)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class TenantContext:
    def __init__(
        self,
        tenant_id: str,
        app_id: str,
        private_key: str,
        llm_config: dict | None = None,
        notification_config: dict | None = None,
        workflow_config: dict | None = None,
        plan: str = "FREE",
        installation_id: str | None = None,
    ):
        self.tenant_id = tenant_id
        self.app_id = app_id
        self.private_key = private_key
        self.llm_config = llm_config
        self.notification_config = notification_config
        self.workflow_config = workflow_config
        self.plan = plan
        self.installation_id = installation_id


def get_tenant_context(github_installation_id: str) -> TenantContext:
    """
    Fetches the Tenant configuration for a given GitHub Installation/Org.
    Decrypts the private key for use in GitHub API calls.
    """
    session = SessionLocal()
    try:
        # Note: In our current schema, githubOrgId maps to the Org ID.
        # Ideally we map Installation ID -> Tenant, but for MVP assuming 1:1 map via Org logic
        # or we update schema to store installationId.
        # Let's query by githubOrgId for now, assuming the job payload passes it.
        from sqlalchemy import or_

        stmt = select(Tenant).where(
            or_(
                Tenant.installationId == str(github_installation_id),
                Tenant.githubOrgId == str(github_installation_id),
            )
        )
        tenant = session.execute(stmt).scalars().first()

        if not tenant:
            raise ValueError(f"Tenant not found for GitHub ID: {github_installation_id}")

        if not tenant.privateKey or not tenant.appId:
            raise ValueError(f"Tenant {tenant.name} has missing credentials")

        # Decrypt
        private_key = decrypt_credential(tenant.privateKey)

        # Parse or pass raw JSON config
        llm_config = {}
        if hasattr(tenant, "llmConfig") and tenant.llmConfig:
            # Copy to avoid mutation issues if cached
            raw_config = dict(tenant.llmConfig)
            # Decrypt nested per-provider keys (new DB format: keys.{provider})
            if raw_config.get("keys"):
                decrypted_keys = {}
                for provider, encrypted_key in raw_config["keys"].items():
                    if encrypted_key:
                        try:
                            decrypted_keys[provider] = decrypt_credential(encrypted_key)
                        except Exception:
                            decrypted_keys[provider] = (
                                encrypted_key  # pass through if not encrypted
                            )
                raw_config = dict(raw_config)
                raw_config["keys"] = decrypted_keys
            # Legacy flat apiKey field (kept for backward compat)
            if raw_config.get("apiKey"):
                raw_config["apiKey"] = decrypt_credential(raw_config["apiKey"])
            llm_config = raw_config

        notification_config = (
            tenant.notificationConfig if hasattr(tenant, "notificationConfig") else None
        )
        workflow_config = tenant.workflowConfig if hasattr(tenant, "workflowConfig") else None

        return TenantContext(
            tenant_id=tenant.id,
            app_id=tenant.appId,
            private_key=private_key,
            llm_config=llm_config,
            notification_config=notification_config,
            workflow_config=workflow_config,
            plan=getattr(tenant, "plan", "FREE") or "FREE",
            installation_id=tenant.installationId,
        )
    finally:
        session.close()
