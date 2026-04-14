# SPDX-License-Identifier: AGPL-3.0-or-later
"""
Ephemeral repository cloning with guaranteed cleanup.

This module implements secure, zero-data-retention cloning of repositories
to tmpfs (RAM) storage with guaranteed cleanup even on errors.
"""

import shutil
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncGenerator

import git

from src.core.config import settings
from src.core.logging import get_logger

logger = get_logger(__name__)


class EphemeralCloneError(Exception):
    """Raised when cloning operations fail."""
    pass


class EphemeralClone:
    """
    Context manager for ephemeral repository cloning.
    
    Ensures repositories are cloned to tmpfs and cleaned up after use,
    even if processing fails. This is critical for security compliance.
    
    Example:
        async with ephemeral_clone(clone_url, token) as repo_path:
            # Process repository files
            pass
        # Automatically cleaned up here
    """
    
    def __init__(
        self,
        clone_url: str,
        access_token: str | None = None,
        ref: str = "HEAD",
        depth: int = 1,
    ):
        """
        Initialize ephemeral clone configuration.
        
        Args:
            clone_url: GitHub repository clone URL
            access_token: GitHub access token for private repos
            ref: Git ref to checkout (branch, tag, commit)
            depth: Clone depth (1 for shallow clone)
        """
        self.clone_url = clone_url
        self.access_token = access_token
        self.ref = ref
        self.depth = depth
        self._clone_path: Path | None = None
    
    def _get_authenticated_url(self) -> str:
        """Inject access token into clone URL for authentication."""
        if not self.access_token:
            return self.clone_url
        
        # Transform https://github.com/org/repo.git to
        # https://x-access-token:TOKEN@github.com/org/repo.git
        if self.clone_url.startswith("https://"):
            return self.clone_url.replace(
                "https://",
                f"https://x-access-token:{self.access_token}@"
            )
        return self.clone_url
    
    async def clone(self) -> Path:
        """
        Clone repository to ephemeral storage.
        
        Returns:
            Path to cloned repository
            
        Raises:
            EphemeralCloneError: If cloning fails
        """
        # Ensure tmpfs directory exists
        settings.tmpfs_path.mkdir(parents=True, exist_ok=True)
        
        # Create temporary directory within tmpfs
        self._clone_path = Path(tempfile.mkdtemp(
            prefix="docugardener_",
            dir=settings.tmpfs_path
        ))
        
        logger.info(
            "Cloning repository to ephemeral storage",
            clone_url=self.clone_url.split("@")[-1],  # Log without token
            target_path=str(self._clone_path),
            ref=self.ref,
            depth=self.depth,
        )
        
        try:
            # 1. Initialize local repository
            repo = git.Repo.init(str(self._clone_path))
            
            # 2. Add remote
            authenticated_url = self._get_authenticated_url()
            origin = repo.create_remote("origin", authenticated_url)
            
            # 3. Fetch specific ref with depth
            # This works for SHAs on GitHub if they are reachable
            fetch_ref = self.ref if self.ref != "HEAD" else None
            
            logger.info(
                "Fetching from remote",
                ref=fetch_ref or "default branch",
                depth=self.depth
            )
            
            # Perform fetch
            origin.fetch(refspec=fetch_ref, depth=self.depth)
            
            # 4. Checkout FETCH_HEAD (which contains the fetched ref)
            repo.git.checkout("FETCH_HEAD")
            
            # If we fetched a specific ref, it might not have branch info,
            # but git-python repo.head will work.
            
            logger.info(
                "Repository cloned successfully",
                path=str(self._clone_path),
                commit=repo.head.commit.hexsha[:8],
            )
            
            return self._clone_path
            
        except git.GitCommandError as e:
            logger.error(
                "Git clone failed",
                error=str(e),
                clone_url=self.clone_url.split("@")[-1],
            )
            # Ensure cleanup on failure
            await self.cleanup()
            raise EphemeralCloneError(f"Failed to clone repository: {e}")
    
    async def cleanup(self) -> None:
        """
        Securely remove cloned repository.
        
        This method MUST be called after processing, even on errors.
        Uses shutil.rmtree with error handling to ensure cleanup.
        """
        if self._clone_path and self._clone_path.exists():
            try:
                shutil.rmtree(self._clone_path, ignore_errors=False)
                logger.info(
                    "Ephemeral clone cleaned up",
                    path=str(self._clone_path),
                )
            except Exception as e:
                # Log critical error but don't raise - cleanup must be best-effort
                logger.critical(
                    "SECURITY: Failed to cleanup ephemeral clone!",
                    path=str(self._clone_path),
                    error=str(e),
                )
            finally:
                self._clone_path = None


@asynccontextmanager
async def ephemeral_clone(
    clone_url: str,
    access_token: str | None = None,
    ref: str = "HEAD",
    depth: int = 1,
) -> AsyncGenerator[Path, None]:
    """
    Async context manager for ephemeral repository cloning.
    
    Guarantees cleanup of cloned repository even if processing fails.
    This is the recommended way to clone repositories.
    
    Example:
        async with ephemeral_clone(url, token) as repo_path:
            files = list(repo_path.rglob("*.py"))
            # Process files...
        # Automatically cleaned up
    
    Args:
        clone_url: GitHub repository clone URL
        access_token: GitHub access token for private repos
        ref: Git ref to checkout
        depth: Clone depth (1 for shallow)
        
    Yields:
        Path to cloned repository
    """
    clone = EphemeralClone(clone_url, access_token, ref, depth)
    
    try:
        path = await clone.clone()
        yield path
    finally:
        # CRITICAL: Always cleanup, even on exception
        await clone.cleanup()
