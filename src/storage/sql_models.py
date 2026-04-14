from sqlalchemy import Column, String, Text, Integer, DateTime, JSON, Enum as SQLEnum, Boolean, UniqueConstraint
from sqlalchemy.orm import declarative_base
from datetime import datetime
import enum

Base = declarative_base()

class User(Base):
    """
    SQLAlchemy model mirroring the Prisma User model (NextAuth).
    """
    __tablename__ = "User"
    
    id = Column(String, primary_key=True)
    name = Column(String, nullable=True)
    email = Column(String, unique=True, nullable=True)
    emailVerified = Column(DateTime, nullable=True)
    image = Column(String, nullable=True)
    role = Column(String, default="VIEWER")
    tenantId = Column(String, nullable=True)
    # SCIM 2.0 (ENT-12 follow-on)
    externalId = Column(String, nullable=True)   # IdP SCIM externalId
    scimActive = Column(Boolean, default=True, nullable=False)  # false = deprovisioned

    @property
    def tenant_id(self):
        return self.tenantId

class JobStatus(str, enum.Enum):
    QUEUED = "QUEUED"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    QUOTA_EXCEEDED = "QUOTA_EXCEEDED"

class TriageStatus(str, enum.Enum):
    PENDING = "PENDING"
    ACCEPTED = "ACCEPTED"
    IGNORED = "IGNORED"
    # FIX_PR_OPEN: fix PR has been created on GitHub but not yet merged.
    # Transitions to RESOLVED when the docugardener-fix-* merge webhook fires.
    FIX_PR_OPEN = "FIX_PR_OPEN"
    RESOLVED = "RESOLVED"

class Tenant(Base):
    """
    SQLAlchemy model mirroring the Prisma Tenant model.
    """
    __tablename__ = "Tenant"
    
    id = Column(String, primary_key=True)
    githubOrgId = Column(String, unique=True, nullable=False)
    installationId = Column(String, nullable=True)
    name = Column(String, nullable=False)
    plan = Column(String, default="FREE")
    
    # Credentials (Encrypted)
    appId = Column(String, nullable=True)
    privateKey = Column(String, nullable=True)
    webhookSecret = Column(String, nullable=True)
    llmConfig = Column(JSON, nullable=True)
    notificationConfig = Column(JSON, nullable=True)
    workflowConfig = Column(JSON, nullable=True)
    billingConfig = Column(JSON, nullable=True)

    # Stripe Billing (I-01)
    # Prisma migration: add  stripeCustomerId String? @unique  to Tenant model
    stripeCustomerId = Column(String, nullable=True, unique=True)

    # GTM-01: PRO Trial
    trialExpiresAt = Column(DateTime, nullable=True)

    # ENT-12: SSO / SAML 2.0
    ssoEnabled = Column(Boolean, default=False, nullable=False)
    ssoProvider = Column(String, nullable=True)
    samlIdpEntityId = Column(String, nullable=True)
    samlIdpSsoUrl = Column(String, nullable=True)
    samlIdpCertificate = Column(Text, nullable=True)
    samlAttrEmail = Column(String, nullable=True)
    samlAttrRole = Column(String, nullable=True)
    samlRoleMapAdmin = Column(String, nullable=True)
    sessionsRevokedAt = Column(DateTime, nullable=True)
    # SCIM 2.0 (ENT-12 follow-on)
    scimEnabled = Column(Boolean, default=False, nullable=False)
    scimBearerTokenHash = Column(String, nullable=True)  # SHA-256 of raw token
    scimLastSyncAt = Column(DateTime, nullable=True)

    createdAt = Column(DateTime, default=datetime.utcnow)
    updatedAt = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class Repository(Base):
    """
    SQLAlchemy model mirroring the Prisma Repository model.
    """
    __tablename__ = "Repository"
    
    id = Column(String, primary_key=True)
    tenantId = Column(String, nullable=False)
    githubRepoId = Column(String, nullable=False)
    name = Column(String, nullable=False)
    enabled = Column(Boolean, default=True)
    config = Column(JSON, nullable=True)
    
    createdAt = Column(DateTime, default=datetime.utcnow)
    updatedAt = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class Job(Base):
    """
    SQLAlchemy model mirroring the Prisma Job model.
    """
    __tablename__ = "Job"
    
    id = Column(String, primary_key=True)
    tenantId = Column(String, nullable=False)
    repositoryId = Column(String, nullable=False)
    prNumber = Column(Integer, nullable=False)
    
    status = Column(SQLEnum(JobStatus, name="JobStatus", native_enum=False), default=JobStatus.QUEUED)
    triageStatus = Column(SQLEnum(TriageStatus, name="TriageStatus", native_enum=False), default=TriageStatus.PENDING)
    aiAuthored = Column(Boolean, default=False)
    result = Column(JSON, nullable=True)
    logs = Column(JSON, nullable=True)
    
    startedAt = Column(DateTime, nullable=True)
    completedAt = Column(DateTime, nullable=True)
    createdAt = Column(DateTime, default=datetime.utcnow)
    updatedAt = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class AnalysisFeedback(Base):
    """
    FEED-01: Analysis Feedback Signal.
    Written by FastAPI on feedback link click; read by Next.js for dashboard KPIs.
    Table is created by Prisma migrations; SQLAlchemy only reads/writes (no create_all).
    """
    __tablename__ = "AnalysisFeedback"

    id        = Column(String, primary_key=True)
    jobId     = Column(String, nullable=False)
    tenantId  = Column(String, nullable=False)
    # "up" = accurate, "down" = false positive
    signal    = Column(String, nullable=False)
    # Source distinguishes multiple feedback points in a comment (currently "pr_comment")
    source    = Column(String, nullable=False, default="pr_comment")

    createdAt = Column(DateTime, default=datetime.utcnow, nullable=False)
    updatedAt = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    __table_args__ = (
        UniqueConstraint("jobId", "source", name="AnalysisFeedback_jobId_source_key"),
    )


class RulesArtifact(Base):
    """
    RULES-01: Generated agent instruction artifact record.
    Table is created by Prisma migrations; SQLAlchemy reads/writes (no create_all).
    """
    __tablename__ = "RulesArtifact"

    id              = Column(String, primary_key=True)
    tenantId        = Column(String, nullable=False)
    repoId          = Column(String, nullable=False)
    # "agents_md" | "copilot_instructions"
    targetFormat    = Column(String, nullable=False)
    # Path in repo, e.g. "AGENTS.md" or ".github/copilot-instructions.md"
    outputPath      = Column(String, nullable=False)
    lastHash        = Column(String, nullable=True)
    lastGeneratedAt = Column(DateTime, nullable=True)
    lastPrUrl       = Column(String, nullable=True)
    isStale         = Column(Boolean, default=True, nullable=False)

    createdAt = Column(DateTime, default=datetime.utcnow, nullable=False)
    updatedAt = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    __table_args__ = (
        UniqueConstraint("tenantId", "repoId", "targetFormat", name="RulesArtifact_tenantId_repoId_targetFormat_key"),
    )


class PromptConfig(Base):
    """
    SQLAlchemy model for custom prompt configurations per tenant.
    """
    __tablename__ = "PromptConfig"
    
    id = Column(String, primary_key=True)
    tenantId = Column(String, nullable=False)
    key = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    updatedAt = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

