"""
GitHub App authentication and client management.

Handles GitHub App JWT authentication and installation access tokens
for interacting with the GitHub API.
"""

import threading
import time
from datetime import datetime, timezone

import jwt
from github import Auth, Github, GithubIntegration

from src.core.config import settings
from src.core.logging import get_logger

logger = get_logger(__name__)

# SEC-08: TTL-aware installation token cache.
# GitHub installation tokens expire after ~1 hour. lru_cache never evicts,
# so long-running workers (rq worker, scheduler) would reuse expired tokens
# and get intermittent 401s from the GitHub API.
# Cache entry: (token_str, expires_at_datetime)
_token_cache: dict[tuple, tuple[str, datetime]] = {}
_token_cache_lock = threading.Lock()
_TOKEN_REFRESH_BUFFER_SECONDS = 300  # refresh 5 min before expiry


class GitHubAppError(Exception):
    """Raised when GitHub App operations fail."""
    pass


def _load_private_key() -> str:
    """Load GitHub App private key from file."""
    if not settings.github_private_key_path:
        raise GitHubAppError("GitHub App private key path not configured")
    
    try:
        return settings.github_private_key_path.read_text()
    except FileNotFoundError:
        raise GitHubAppError(
            f"Private key file not found: {settings.github_private_key_path}"
        )


def create_jwt_token() -> str:
    """
    Create a JWT token for GitHub App authentication.
    
    The token is valid for 10 minutes (GitHub's maximum).
    
    Returns:
        JWT token string
    """
    if not settings.github_app_id:
        raise GitHubAppError("GitHub App ID not configured")
    
    private_key = _load_private_key()
    
    now = int(time.time())
    payload = {
        "iat": now - 60,  # Issued 60 seconds ago (clock skew)
        "exp": now + (10 * 60),  # Expires in 10 minutes
        "iss": settings.github_app_id,
    }
    
    token = jwt.encode(payload, private_key, algorithm="RS256")
    logger.debug("Created GitHub App JWT token", app_id=settings.github_app_id)
    
    return token


def get_installation_token(
    installation_id: int,
    app_id: int | None = None,
    private_key: str | None = None,
) -> str:
    """
    Get an installation access token for a specific installation.

    Tokens are cached and automatically refreshed when within 5 minutes of
    expiry (SEC-08 — replaces @lru_cache which never evicted expired tokens).

    Args:
        installation_id: GitHub App installation ID
        app_id: Optional App ID (overrides settings)
        private_key: Optional Private Key string (overrides settings)

    Returns:
        Installation access token (fresh or cached)
    """
    cache_key = (installation_id, app_id, private_key)
    now = datetime.now(timezone.utc)

    with _token_cache_lock:
        cached = _token_cache.get(cache_key)
        if cached:
            token_str, expires_at = cached
            seconds_left = (expires_at - now).total_seconds()
            if seconds_left > _TOKEN_REFRESH_BUFFER_SECONDS:
                return token_str
            logger.info(
                "SEC-08: Installation token near expiry — refreshing",
                installation_id=installation_id,
                seconds_left=int(seconds_left),
            )

    effective_app_id = app_id or (int(settings.github_app_id) if settings.github_app_id else None)

    if not effective_app_id:
        raise GitHubAppError("GitHub App ID not provided or configured")

    effective_private_key = private_key or _load_private_key()

    auth = Auth.AppAuth(int(effective_app_id), effective_private_key)
    gi = GithubIntegration(auth=auth)

    installation_auth = gi.get_access_token(installation_id)
    expires_at = installation_auth.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    logger.info(
        "Created installation access token",
        installation_id=installation_id,
        app_id=effective_app_id,
        expires_at=expires_at.isoformat(),
    )

    with _token_cache_lock:
        _token_cache[cache_key] = (installation_auth.token, expires_at)

    return installation_auth.token


def get_github_client(
    installation_id: int, 
    app_id: int | None = None, 
    private_key: str | None = None
) -> Github:
    """
    Get authenticated GitHub client for an installation.
    
    Args:
        installation_id: GitHub App installation ID
        app_id: Optional App ID
        private_key: Optional Private Key string
        
    Returns:
        Authenticated PyGithub client
    """
    token = get_installation_token(installation_id, app_id=app_id, private_key=private_key)
    auth = Auth.Token(token)
    
    return Github(auth=auth)


def get_repo_clone_url(repo_full_name: str) -> str:
    """
    Get the HTTPS clone URL for a repository.
    
    Args:
        repo_full_name: Repository in "owner/repo" format
        
    Returns:
        HTTPS clone URL
    """
    return f"https://github.com/{repo_full_name}.git"


async def get_installation_client(installation_id: int) -> Github:
    """
    Get authenticated GitHub client for an installation (async wrapper).
    
    Args:
        installation_id: GitHub App installation ID
        
    Returns:
        Authenticated PyGithub client
    """
    # PyGithub is not async-native, but we wrap for interface consistency
    return get_github_client(installation_id)

