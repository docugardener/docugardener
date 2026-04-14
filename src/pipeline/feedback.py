"""
FEED-01: Analysis Feedback Signal — HMAC token helpers.

Generates and verifies short HMAC-SHA256 tokens embedded in PR comment links.
The token signs `job_id:tenant_id` so that the feedback endpoint can verify
the request without exposing a session cookie.
"""

import hashlib
import hmac

from src.core.config import settings


def make_feedback_token(job_id: str, tenant_id: str) -> str:
    """
    Return a 24-char HMAC-SHA256 hex token for (job_id, tenant_id).

    Args:
        job_id:    Job CUID from the Prisma Job table.
        tenant_id: Tenant CUID from the Prisma Tenant table.

    Returns:
        First 24 hex characters of HMAC-SHA256(key, "job_id:tenant_id").
    """
    key = settings.feedback_hmac_secret.encode()
    msg = f"{job_id}:{tenant_id}".encode()
    return hmac.new(key, msg, hashlib.sha256).hexdigest()[:24]


def verify_feedback_token(job_id: str, tenant_id: str, token: str) -> bool:
    """
    Constant-time verification of a feedback token.

    Returns True only when the provided token matches the expected value
    and `feedback_hmac_secret` is configured.
    """
    if not settings.feedback_hmac_secret:
        return False
    expected = make_feedback_token(job_id, tenant_id)
    return hmac.compare_digest(expected, token)


def build_feedback_urls(job_id: str, tenant_id: str) -> tuple[str, str] | tuple[None, None]:
    """
    Build the up/down feedback URLs for embedding in a PR comment.

    Returns (up_url, down_url) when feedback is configured, otherwise (None, None).
    """
    if not settings.feedback_hmac_secret or not settings.app_url:
        return None, None

    token = make_feedback_token(job_id, tenant_id)
    base = settings.app_url.rstrip("/")
    up_url   = f"{base}/api/feedback?j={job_id}&s=up&tid={tenant_id}&t={token}"
    down_url = f"{base}/api/feedback?j={job_id}&s=down&tid={tenant_id}&t={token}"
    return up_url, down_url
