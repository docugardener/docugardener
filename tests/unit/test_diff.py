"""Unit tests for semantic diff module."""

import pytest

from src.analysis.diff import (
    ChangeType,
    EntityChange,
    SemanticDiff,
    compute_semantic_hash,
)
from src.analysis.parser import CodeEntity


@pytest.fixture
def diff() -> SemanticDiff:
    """Create a SemanticDiff instance."""
    return SemanticDiff()


class TestNormalization:
    """Tests for content normalization."""

    def test_removes_trailing_whitespace(self):
        """Test that trailing whitespace is removed."""
        content = "def foo():   \n    pass  \n"
        normalized = SemanticDiff.normalize_content(content)
        assert "   \n" not in normalized
        assert "  \n" not in normalized

    def test_removes_empty_lines(self):
        """Test that empty lines are removed."""
        content = "def foo():\n\n\n    pass\n\n"
        normalized = SemanticDiff.normalize_content(content)
        assert "\n\n" not in normalized

    def test_removes_python_comments(self):
        """Test that Python comments are removed."""
        content = "# This is a comment\ndef foo():\n    # Another comment\n    pass"
        normalized = SemanticDiff.normalize_content(content, "python")
        assert "# This is a comment" not in normalized
        assert "# Another comment" not in normalized

    def test_preserves_code_structure(self):
        """Test that code structure is preserved."""
        content = "def foo():\n    x = 1\n    return x"
        normalized = SemanticDiff.normalize_content(content)
        assert "def foo()" in normalized
        assert "x = 1" in normalized
        assert "return x" in normalized


class TestSemanticHash:
    """Tests for semantic hashing."""

    def test_same_code_same_hash(self):
        """Test that identical code produces same hash."""
        code = "def foo():\n    return 42"
        hash1 = SemanticDiff.semantic_hash(code)
        hash2 = SemanticDiff.semantic_hash(code)
        assert hash1 == hash2

    def test_different_code_different_hash(self):
        """Test that different code produces different hash."""
        code1 = "def foo():\n    return 42"
        code2 = "def bar():\n    return 43"
        hash1 = SemanticDiff.semantic_hash(code1)
        hash2 = SemanticDiff.semantic_hash(code2)
        assert hash1 != hash2

    def test_whitespace_changes_same_hash(self):
        """Test that whitespace-only changes produce same hash."""
        code1 = "def foo():\n    return 42"
        code2 = "def foo():\n    return    42"  # Extra spaces
        hash1 = SemanticDiff.semantic_hash(code1)
        hash2 = SemanticDiff.semantic_hash(code2)
        assert hash1 == hash2

    def test_comment_changes_same_hash(self):
        """Test that comment-only changes produce same hash."""
        code1 = "def foo():\n    return 42"
        code2 = "# Comment\ndef foo():\n    # Another\n    return 42"
        hash1 = SemanticDiff.semantic_hash(code1)
        hash2 = SemanticDiff.semantic_hash(code2)
        assert hash1 == hash2


class TestEntityComparison:
    """Tests for entity comparison."""

    def test_detect_added_entity(self, diff: SemanticDiff):
        """Test detection of added entities."""
        old_entities: list[CodeEntity] = []
        new_entities = [
            CodeEntity(
                name="new_func",
                entity_type="function",
                file_path="test.py",
                start_line=1,
                end_line=3,
                content="def new_func(): pass",
            )
        ]

        changes = diff.compare_entities(old_entities, new_entities)

        assert len(changes) == 1
        assert changes[0].change_type == ChangeType.ADDED
        assert changes[0].entity.name == "new_func"

    def test_detect_removed_entity(self, diff: SemanticDiff):
        """Test detection of removed entities."""
        old_entities = [
            CodeEntity(
                name="old_func",
                entity_type="function",
                file_path="test.py",
                start_line=1,
                end_line=3,
                content="def old_func(): pass",
            )
        ]
        new_entities: list[CodeEntity] = []

        changes = diff.compare_entities(old_entities, new_entities)

        assert len(changes) == 1
        assert changes[0].change_type == ChangeType.REMOVED
        assert changes[0].entity.name == "old_func"

    def test_detect_modified_entity(self, diff: SemanticDiff):
        """Test detection of modified entities."""
        old_entities = [
            CodeEntity(
                name="my_func",
                entity_type="function",
                file_path="test.py",
                start_line=1,
                end_line=3,
                content="def my_func():\n    return 1",
                signature="def my_func()",
            )
        ]
        new_entities = [
            CodeEntity(
                name="my_func",
                entity_type="function",
                file_path="test.py",
                start_line=1,
                end_line=3,
                content="def my_func():\n    return 2",  # Changed return value
                signature="def my_func()",
            )
        ]

        changes = diff.compare_entities(old_entities, new_entities)

        assert len(changes) == 1
        assert changes[0].change_type == ChangeType.LOGIC_MODIFIED

    def test_detect_cosmetic_change(self, diff: SemanticDiff):
        """Test detection of cosmetic-only changes."""
        old_entities = [
            CodeEntity(
                name="my_func",
                entity_type="function",
                file_path="test.py",
                start_line=1,
                end_line=3,
                content="def my_func():\n    return 1",
                signature="def my_func()",
            )
        ]
        new_entities = [
            CodeEntity(
                name="my_func",
                entity_type="function",
                file_path="test.py",
                start_line=1,
                end_line=4,
                content="def my_func():\n    # Added comment\n    return 1",  # Only added comment
                signature="def my_func()",
            )
        ]

        changes = diff.compare_entities(old_entities, new_entities)

        assert len(changes) == 1
        assert changes[0].change_type == ChangeType.COSMETIC
        assert not changes[0].is_meaningful


class TestEntityChange:
    """Tests for EntityChange dataclass."""

    def test_is_meaningful_for_added(self):
        """Test that ADDED changes are meaningful."""
        change = EntityChange(
            entity=CodeEntity("f", "function", "t.py", 1, 1, ""),
            change_type=ChangeType.ADDED,
        )
        assert change.is_meaningful is True

    def test_is_meaningful_for_cosmetic(self):
        """Test that COSMETIC changes are not meaningful."""
        change = EntityChange(
            entity=CodeEntity("f", "function", "t.py", 1, 1, ""),
            change_type=ChangeType.COSMETIC,
        )
        assert change.is_meaningful is False

    def test_requires_doc_update_for_signature(self):
        """Test that SIGNATURE_CHANGED requires doc update."""
        change = EntityChange(
            entity=CodeEntity("f", "function", "t.py", 1, 1, ""),
            change_type=ChangeType.SIGNATURE_CHANGED,
        )
        assert change.requires_doc_update is True

    def test_requires_doc_update_for_removed(self):
        """Test that REMOVED does not require doc update."""
        change = EntityChange(
            entity=CodeEntity("f", "function", "t.py", 1, 1, ""),
            change_type=ChangeType.REMOVED,
        )
        assert change.requires_doc_update is False


class TestConvenienceFunctions:
    """Tests for module-level convenience functions."""

    def test_compute_semantic_hash(self):
        """Test the convenience hash function."""
        code = "def foo(): pass"
        hash_val = compute_semantic_hash(code)
        assert isinstance(hash_val, str)
        assert len(hash_val) == 16  # Truncated SHA-256
