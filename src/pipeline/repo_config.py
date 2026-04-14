# SPDX-License-Identifier: AGPL-3.0-or-later
"""
WORK-02: Repository-level configuration loader.

Reads `.github/docugardener.yml` from the target repository via the GitHub API.
If the file does not exist or cannot be parsed, returns an empty dict so that
the global tenant configuration is used unchanged.

Supported keys in .github/docugardener.yml:
  ignore_patterns   – list of glob patterns for files to skip analysis on
  drift_threshold   – override the tenant's drift alert threshold (0-100)
  block_merge_above – score above which DocuGardener blocks the merge (0-100)
  ignore_actors     – list of PR author logins to skip (e.g. "dependabot[bot]")
"""

import base64
import fnmatch
from typing import Any

import httpx

from src.core.logging import get_logger

logger = get_logger(__name__)

_CONFIG_PATHS = (".github/docugardener.yml", ".github/docugardener.yaml")


def load_repo_config(
    owner: str,
    repo: str,
    installation_token: str,
    ref: str = "HEAD",
) -> dict[str, Any]:
    """
    Fetch and parse .github/docugardener.yml from the repository.

    Tries `.yml` first, then `.yaml`. Returns an empty dict on any error
    (missing file, bad YAML, network failure) so callers always get a dict.

    Args:
        owner: Repository owner (e.g. "acme-corp")
        repo:  Repository name (e.g. "api-service")
        installation_token: GitHub App installation access token
        ref:   Git ref to read from (default "HEAD" → default branch)

    Returns:
        Parsed config dict, or {} if not found / invalid.
    """
    try:
        import yaml  # pyyaml — optional dependency for this feature
    except ImportError:
        logger.warning(
            "WORK-02: PyYAML not installed — repo-level config is unavailable",
            repo=f"{owner}/{repo}",
        )
        return {}

    headers = {
        "Authorization": f"Bearer {installation_token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }

    for path in _CONFIG_PATHS:
        url = f"https://api.github.com/repos/{owner}/{repo}/contents/{path}"
        params = {"ref": ref}
        try:
            resp = httpx.get(url, headers=headers, params=params, timeout=10.0)
            if resp.status_code == 404:
                continue  # try the alternate extension
            resp.raise_for_status()

            payload = resp.json()
            raw_bytes = base64.b64decode(payload["content"].replace("\n", ""))
            config = yaml.safe_load(raw_bytes.decode("utf-8")) or {}

            if not isinstance(config, dict):
                logger.warning(
                    "WORK-02: repo config root must be a YAML mapping — ignoring",
                    repo=f"{owner}/{repo}",
                    path=path,
                )
                return {}

            logger.info(
                "WORK-02: loaded repo-level config",
                repo=f"{owner}/{repo}",
                path=path,
                keys=list(config.keys()),
            )
            return config

        except Exception as exc:
            logger.warning(
                "WORK-02: failed to load repo config",
                repo=f"{owner}/{repo}",
                path=path,
                error=str(exc),
            )
            return {}

    logger.debug("WORK-02: no repo config file found", repo=f"{owner}/{repo}")
    return {}


def apply_ignore_patterns(
    file_paths: list[str],
    patterns: list[str],
) -> list[str]:
    """
    Filter out file paths that match any of the ignore glob patterns.

    Uses Python's fnmatch so patterns like "docs/legacy/**" and "*.test.ts"
    work as expected.

    Args:
        file_paths: Candidate file paths to filter
        patterns:   Glob patterns from ignore_patterns in docugardener.yml

    Returns:
        Subset of file_paths that do NOT match any pattern.
    """
    if not patterns:
        return file_paths

    kept = []
    for fp in file_paths:
        matched = any(fnmatch.fnmatch(fp, pat) for pat in patterns)
        if matched:
            logger.debug("WORK-02: ignoring file via repo config pattern", file=fp)
        else:
            kept.append(fp)
    return kept
