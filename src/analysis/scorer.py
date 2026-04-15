# SPDX-License-Identifier: AGPL-3.0-or-later
"""
Deterministic drift scoring based on semantic change types, visibility, and complexity.

Implements two scoring models:
- Standard (v2.1): Fast baseline for all tiers.
- Holistic (v3.0): Architectural significance model for Pro/Team tiers.
  Incorporates Directory Weight multipliers (Kernel / Feature / Leaf) and
  AST Blast Radius (cross-file reference count) to evaluate structural impact.
"""

import math
from collections.abc import Iterable

from src.analysis.diff import ChangeType, EntityChange
from src.core.logging import get_logger

logger = get_logger(__name__)

# Base weights for each change type
CHANGE_WEIGHTS = {
    ChangeType.SIGNATURE_CHANGED: 85,
    ChangeType.REMOVED: 80,
    ChangeType.ADDED: 20,  # Base for new entities
    ChangeType.LOGIC_MODIFIED: 20,  # Base for logic changes
    ChangeType.DOCSTRING_CHANGED: 5,
    ChangeType.COSMETIC: 0,
}

# Multipliers for visibility
VISIBILITY_MULTIPLIER = {
    True: 1.2,  # Public API
    False: 0.8,  # Private/Internal
}

# --- Holistic Scoring v3.0: Directory Tier Definitions ---
# Kernel tier: core infrastructure, high structural impact.
KERNEL_TIER_PATTERNS = [
    "src/core/",
    "src/auth/",
    "src/config/",
    "src/security/",
    "src/agents/",
    "lib/",
    "package.json",
    "pyproject.toml",
    "docker/",
]

# Leaf tier: tests, scripts, non-production assets.
LEAF_TIER_PATTERNS = [
    "tests/",
    "test/",
    "__tests__/",
    "scripts/",
    "docs/",
    ".github/",
    "demo/",
]

KERNEL_WEIGHT = 2.0
FEATURE_WEIGHT = 1.0
LEAF_WEIGHT = 0.5


class DriftScorer:
    """
    Calculates deterministic drift scores from semantic changes with complexity factors.

    Standard Model (v2.1): Used by Free tier. Fast and localized.
    Holistic Model (v3.0): Used by Pro/Team tier. Incorporates Kern context
        (Directory Weight + Blast Radius) for true architectural impact scoring.
    """

    @staticmethod
    def get_directory_weight(file_path: str) -> float:
        """
        Map a file path to its architectural significance weight.

        Tiers:
          - Kernel (2.0x): Core infrastructure with maximum blast potential.
          - Feature (1.0x): Standard application logic.
          - Leaf  (0.5x):  Tests, scripts, non-production files.

        Args:
            file_path: Relative file path within the repository.

        Returns:
            Weight multiplier (float).
        """
        normalized = file_path.replace("\\", "/").lstrip("./")

        for pattern in KERNEL_TIER_PATTERNS:
            if normalized.startswith(pattern) or normalized == pattern.rstrip("/"):
                return KERNEL_WEIGHT

        for pattern in LEAF_TIER_PATTERNS:
            if normalized.startswith(pattern):
                return LEAF_WEIGHT

        return FEATURE_WEIGHT

    @staticmethod
    def calculate_score(changes: Iterable[EntityChange]) -> int:
        """
        Standard drift score (v2.1): 0-100 based on weighted changes.
        Used for Free tier. Fast and deterministic.
        """
        changes = list(changes)
        if not changes:
            return 0

        individual_scores = []
        for change in changes:
            base_weight = CHANGE_WEIGHTS.get(change.change_type, 20)
            visibility = VISIBILITY_MULTIPLIER.get(change.entity.is_public, 1.0)

            # Complexity Factor based on Line Count (Logarithmic)
            # 1 line -> 1.0x, 10 lines -> 1.5x, 100 lines -> 2.0x
            line_count = change.entity.line_count
            complexity = 1.0 + (math.log10(max(1, line_count)) * 0.5)

            score = base_weight * visibility * complexity
            individual_scores.append(min(100, score))

        if not individual_scores:
            return 0

        max_score = max(individual_scores)
        avg_score = sum(individual_scores) / len(individual_scores)

        # Aggregate: Heavily weigh the most severe change (70%)
        final_score = (0.7 * max_score) + (0.3 * avg_score)

        result = int(min(100, final_score))

        logger.info(
            "Calculated standard drift score (v2.1)",
            max_item_score=max_score,
            avg_score=avg_score,
            final_score=result,
            change_count=len(individual_scores),
        )

        return result

    @staticmethod
    def calculate_holistic_score(changes: Iterable[EntityChange]) -> int:
        """
        Holistic drift score (v3.0): 0-100 incorporating Kern context.
        Used for Pro/Team tier. Augments the standard score with:
          - Directory weight multiplier (Kernel / Feature / Leaf tiers)
          - AST Blast Radius: logarithmic bonus for cross-file reference count

        Args:
            changes: List of entity changes pre-annotated with blast_radius
                     and directory_weight by the AST Context Builder.

        Returns:
            Final integer score 0-100.
        """
        changes = list(changes)
        if not changes:
            return 0

        individual_scores = []
        for change in changes:
            base_weight = CHANGE_WEIGHTS.get(change.change_type, 20)
            visibility = VISIBILITY_MULTIPLIER.get(change.entity.is_public, 1.0)

            # Standard complexity (line count)
            line_count = change.entity.line_count
            complexity = 1.0 + (math.log10(max(1, line_count)) * 0.5)

            # Holistic factors
            dir_weight = change.directory_weight  # Pre-calculated by Context Builder
            blast_bonus = 1.0 + (math.log10(max(1, change.blast_radius + 1)) * 0.3)

            score = base_weight * visibility * complexity * dir_weight * blast_bonus
            individual_scores.append(min(100, score))

        if not individual_scores:
            return 0

        max_score = max(individual_scores)
        avg_score = sum(individual_scores) / len(individual_scores)

        # Holistic model weighs peak severity even more heavily (75%)
        final_score = (0.75 * max_score) + (0.25 * avg_score)

        result = int(min(100, final_score))

        logger.info(
            "Calculated holistic drift score (v3.0)",
            max_item_score=max_score,
            avg_score=avg_score,
            final_score=result,
            change_count=len(individual_scores),
        )

        return result

    @staticmethod
    def get_severity(score: int) -> str:
        """Map score to severity category."""
        if score < 5:
            return "none"
        if score < 25:
            return "minor"
        if score < 60:
            return "moderate"
        if score < 85:
            return "significant"
        return "critical"
