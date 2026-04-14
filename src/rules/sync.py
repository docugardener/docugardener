# SPDX-License-Identifier: AGPL-3.0-or-later
"""
RULES-01: Staleness detection for generated rule artifacts.

Compares the SHA-256 hash of the current on-disk file content against the
hash that the compiler would produce from the current policy.  A mismatch
means either the policy has changed or someone manually edited the file.
"""

from __future__ import annotations

import hashlib


def is_stale(current_content: str | None, expected_hash: str) -> bool:
    """
    Return True if the on-disk content no longer matches the expected hash.

    Args:
        current_content: Current file content fetched from GitHub, or None
                         if the file does not exist yet.
        expected_hash:   SHA-256 hex digest that compile() would produce for
                         the current policy state.

    Returns:
        True  → file is missing or out-of-date, a new PR should be proposed.
        False → file matches policy exactly, no action needed.
    """
    if current_content is None:
        return True  # Never generated
    actual_hash = hashlib.sha256(current_content.encode()).hexdigest()
    return actual_hash != expected_hash


def compute_content_hash(content: str) -> str:
    """Return the SHA-256 hex digest of the given string (UTF-8 encoded)."""
    return hashlib.sha256(content.encode()).hexdigest()
