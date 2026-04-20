# SPDX-License-Identifier: AGPL-3.0-or-later
"""
Semantic diff calculation for code changes.

Compares code changes at the semantic level, ignoring cosmetic changes
like whitespace and formatting. Uses content hashing to detect meaningful changes.
"""

import hashlib
import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

from src.analysis.parser import CodeEntity, CodeParser, get_parser
from src.core.logging import get_logger

logger = get_logger(__name__)


class ChangeType(Enum):
    """Types of changes detected."""

    ADDED = "added"
    REMOVED = "removed"
    MODIFIED = "modified"  # General modification
    LOGIC_MODIFIED = "logic_modified"  # Explicit logic change (ignoring docs)
    DOCSTRING_CHANGED = "docstring_changed"  # Only docstring/comments changed
    SIGNATURE_CHANGED = "signature_changed"
    COSMETIC = "cosmetic"  # Formatting only, no semantic change


@dataclass
class EntityChange:
    """
    Represents a semantic change to a code entity.

    Attributes:
        entity: The affected code entity
        change_type: Type of change detected
        old_content: Previous content (for modifications)
        new_content: New content
        semantic_hash_old: Hash of old semantic content
        semantic_hash_new: Hash of new semantic content
        details: Additional change details
        blast_radius: Number of files that import/reference this entity (Holistic Scoring)
        directory_weight: Structural architectural significance multiplier (Holistic Scoring)
    """

    entity: CodeEntity
    change_type: ChangeType
    old_content: str | None = None
    new_content: str | None = None
    semantic_hash_old: str | None = None
    semantic_hash_new: str | None = None
    details: dict[str, Any] | None = field(default_factory=dict)
    blast_radius: int = 0
    directory_weight: float = 1.0
    extra_context: dict[str, Any] | None = field(default_factory=dict)

    @property
    def is_meaningful(self) -> bool:
        """Check if change is semantically meaningful (not just cosmetic)."""
        return self.change_type not in (ChangeType.COSMETIC,)

    @property
    def requires_doc_update(self) -> bool:
        """Check if change likely requires documentation update."""
        return self.change_type in [
            ChangeType.ADDED,
            ChangeType.LOGIC_MODIFIED,
            ChangeType.SIGNATURE_CHANGED,
            ChangeType.DOCSTRING_CHANGED,
        ]


class SemanticDiff:
    """
    Calculate semantic differences between code versions.

    Uses content normalization and hashing to distinguish between
    meaningful changes and cosmetic changes (formatting, whitespace).
    """

    def __init__(self, parser: CodeParser | None = None):
        """Initialize with optional custom parser."""
        self.parser = parser or get_parser()

    @staticmethod
    def normalize_content(content: str, language: str = "python", strip_docs: bool = False) -> str:
        """
        Normalize code content for semantic comparison.

        Args:
            content: Raw code content
            language: Programming language
            strip_docs: Whether to remove docstrings/comments entirely

        Returns:
            Normalized content string
        """
        # Basic comment patterns
        comment_patterns = {
            "python": [r"#.*$", r'"""[\s\S]*?"""', r"'''[\s\S]*?'''"],
            "javascript": [r"//.*$", r"/\*[\s\S]*?\*/"],
            "typescript": [r"//.*$", r"/\*[\s\S]*?\*/"],
            "html": [r"<!--[\s\S]*?-->"],
            "css": [r"/\*[\s\S]*?\*/"],
        }

        normalized_content = content

        if strip_docs:
            patterns = comment_patterns.get(language, [])
            for pattern in patterns:
                normalized_content = re.sub(pattern, "", normalized_content, flags=re.MULTILINE)

        lines = normalized_content.split("\n")
        normalized_lines: list[str] = []

        for line in lines:
            # Strip trailing whitespace
            line = line.rstrip()

            # Skip empty lines
            if not line.strip():
                continue

            # Skip comment-only lines (basic detection if not already stripped)
            stripped = line.lstrip()
            if not strip_docs:
                if language == "python" and stripped.startswith("#"):
                    continue
                if language in ("javascript", "typescript"):
                    if stripped.startswith("//"):
                        continue

            # Collapse multiple spaces (preserve indentation structure)
            indent = len(line) - len(stripped)
            content_part = re.sub(r"\s+", " ", stripped)
            line = " " * indent + content_part

            normalized_lines.append(line)

        return "\n".join(normalized_lines)

    @staticmethod
    def semantic_hash(content: str, language: str = "python", strip_docs: bool = False) -> str:
        """Generate a semantic hash of code content."""
        normalized = SemanticDiff.normalize_content(content, language, strip_docs)
        return hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:16]

    def compare_entities(
        self,
        old_entities: list[CodeEntity],
        new_entities: list[CodeEntity],
        language: str = "python",
    ) -> list[EntityChange]:
        """
        Compare two sets of code entities and identify changes.
        """
        changes: list[EntityChange] = []

        # Build lookup maps by qualified name
        old_map = {e.qualified_name: e for e in old_entities}
        new_map = {e.qualified_name: e for e in new_entities}

        # Find removed entities
        for name, entity in old_map.items():
            if name not in new_map:
                changes.append(
                    EntityChange(
                        entity=entity,
                        change_type=ChangeType.REMOVED,
                        old_content=entity.content,
                        semantic_hash_old=self.semantic_hash(entity.content, language),
                    )
                )

        # Find added entities
        for name, entity in new_map.items():
            if name not in old_map:
                changes.append(
                    EntityChange(
                        entity=entity,
                        change_type=ChangeType.ADDED,
                        new_content=entity.content,
                        semantic_hash_new=self.semantic_hash(entity.content, language),
                    )
                )

        # Find modified entities
        for name in set(old_map.keys()) & set(new_map.keys()):
            old_entity = old_map[name]
            new_entity = new_map[name]

            # 1. Full semantic hash (includes comments/docs)
            old_hash_full = self.semantic_hash(old_entity.content, language, strip_docs=False)
            new_hash_full = self.semantic_hash(new_entity.content, language, strip_docs=False)

            if old_hash_full == new_hash_full:
                if old_entity.content != new_entity.content:
                    changes.append(
                        EntityChange(
                            entity=new_entity,
                            change_type=ChangeType.COSMETIC,
                            old_content=old_entity.content,
                            new_content=new_entity.content,
                            semantic_hash_old=old_hash_full,
                            semantic_hash_new=new_hash_full,
                        )
                    )
                continue

            # 2. Logic-only hash (strips docs/comments)
            old_hash_logic = self.semantic_hash(old_entity.content, language, strip_docs=True)
            new_hash_logic = self.semantic_hash(new_entity.content, language, strip_docs=True)

            # Normalize signatures for comparison (ignore whitespace)
            old_sig_norm = re.sub(r"\s+", "", old_entity.signature)
            new_sig_norm = re.sub(r"\s+", "", new_entity.signature)

            sig_changed = old_sig_norm != new_sig_norm

            change_type = ChangeType.MODIFIED
            details = {
                "signature_changed": sig_changed,
                "old_signature": old_entity.signature,
                "new_signature": new_entity.signature,
            }

            if old_hash_logic == new_hash_logic:
                # Only docstrings/comments changed
                change_type = ChangeType.DOCSTRING_CHANGED
            else:
                # Actual logic changed
                change_type = ChangeType.LOGIC_MODIFIED
                if sig_changed:
                    change_type = ChangeType.SIGNATURE_CHANGED

            changes.append(
                EntityChange(
                    entity=new_entity,
                    change_type=change_type,
                    old_content=old_entity.content,
                    new_content=new_entity.content,
                    semantic_hash_old=old_hash_full,
                    semantic_hash_new=new_hash_full,
                    details=details,
                )
            )

        # Heuristic for Simulation: Match single Rename/Signature change
        # If we have exactly one removed and one added entity of the same type,
        # it's almost certainly a signature change/rename.
        removed = [c for c in changes if c.change_type == ChangeType.REMOVED]
        added = [c for c in changes if c.change_type == ChangeType.ADDED]

        if len(removed) == 1 and len(added) == 1:
            rem = removed[0]
            add = added[0]
            if rem.entity.entity_type == add.entity.entity_type:
                changes.remove(rem)
                changes.remove(add)
                changes.append(
                    EntityChange(
                        entity=add.entity,
                        change_type=ChangeType.SIGNATURE_CHANGED,
                        old_content=rem.entity.content,
                        new_content=add.entity.content,
                        details={
                            "is_rename": True,
                            "old_name": rem.entity.name,
                            "new_name": add.entity.name,
                            "old_signature": rem.entity.signature,
                            "new_signature": add.entity.signature,
                        },
                    )
                )

        return changes

    def diff_files(
        self,
        old_content: str,
        new_content: str,
        file_path: str,
    ) -> list[EntityChange]:
        """
        Compare two versions of a file and find semantic changes.

        Args:
            old_content: Previous file content
            new_content: New file content
            file_path: Path for language detection

        Returns:
            List of entity changes
        """
        # Detect language
        language = self.parser.detect_language(file_path)
        if not language:
            logger.debug("Unsupported file type for diff", file_path=file_path)
            return []

        # Parse both versions
        old_entities = self.parser.parse_content(old_content, file_path, language)
        new_entities = self.parser.parse_content(new_content, file_path, language)

        # Compare
        changes = self.compare_entities(old_entities, new_entities, language.value)

        logger.info(
            "Computed semantic diff",
            file_path=file_path,
            total_changes=len(changes),
            meaningful_changes=sum(1 for c in changes if c.is_meaningful),
        )

        return changes

    def filter_meaningful_changes(self, changes: list[EntityChange]) -> list[EntityChange]:
        """
        Filter to only return changes that require documentation updates.

        Args:
            changes: All detected changes

        Returns:
            Filtered list of meaningful changes
        """
        return [c for c in changes if c.requires_doc_update]


def compute_semantic_hash(content: str, language: str = "python") -> str:
    """
    Convenience function to compute semantic hash.

    Args:
        content: Code content
        language: Programming language

    Returns:
        Semantic hash string
    """
    return SemanticDiff.semantic_hash(content, language)
