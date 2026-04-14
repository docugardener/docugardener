"""Unit tests for vector database abstraction."""

import pytest
import numpy as np

from src.storage.vectordb import (
    DocumentRecord,
    SearchResult,
    VectorDBProvider,
    generate_record_id,
)
from src.storage.schemas import (
    DocumentationLink,
    IndexedDocument,
    IndexedCodeEntity,
    create_namespace_id,
)
from src.analysis.parser import CodeEntity


class TestDocumentRecord:
    """Tests for DocumentRecord dataclass."""
    
    def test_create_record(self):
        """Test creating a document record."""
        record = DocumentRecord(
            id="test-123",
            vector=[0.1, 0.2, 0.3],
            metadata={"file_path": "test.py"},
            content="Test content",
            namespace="default",
        )
        
        assert record.id == "test-123"
        assert len(record.vector) == 3
        assert record.metadata["file_path"] == "test.py"
        assert record.namespace == "default"
    
    def test_from_numpy(self):
        """Test creating record from numpy array."""
        vector = np.array([0.1, 0.2, 0.3, 0.4])
        
        record = DocumentRecord.from_numpy(
            id="numpy-test",
            vector=vector,
            metadata={"type": "test"},
            namespace="test-ns",
        )
        
        assert record.id == "numpy-test"
        assert len(record.vector) == 4
        assert isinstance(record.vector, list)
        assert record.vector[0] == pytest.approx(0.1)


class TestSearchResult:
    """Tests for SearchResult dataclass."""
    
    def test_create_result(self):
        """Test creating a search result."""
        result = SearchResult(
            id="result-1",
            score=0.95,
            metadata={"entity_name": "my_function"},
            content="Function content",
        )
        
        assert result.id == "result-1"
        assert result.score == 0.95
        assert result.metadata["entity_name"] == "my_function"


class TestGenerateRecordId:
    """Tests for record ID generation."""
    
    def test_generates_consistent_ids(self):
        """Test that same inputs generate same ID."""
        id1 = generate_record_id("test.py", "my_func", "function")
        id2 = generate_record_id("test.py", "my_func", "function")
        
        assert id1 == id2
    
    def test_different_inputs_different_ids(self):
        """Test that different inputs generate different IDs."""
        id1 = generate_record_id("test.py", "func_a", "function")
        id2 = generate_record_id("test.py", "func_b", "function")
        
        assert id1 != id2
    
    def test_id_length(self):
        """Test that generated ID has expected length."""
        id_ = generate_record_id("path/to/file.py", "entity", "type")
        
        assert len(id_) == 32  # Truncated SHA-256


class TestDocumentationLink:
    """Tests for DocumentationLink schema."""
    
    def test_to_metadata(self):
        """Test converting to metadata dictionary."""
        link = DocumentationLink(
            entity_id="ent-123",
            entity_name="calculate",
            entity_type="function",
            file_path="math.py",
            doc_file_path="docs/math.md",
            doc_section="Calculations",
            repo_id="myorg_myrepo",
        )
        
        metadata = link.to_metadata()
        
        assert metadata["entity_id"] == "ent-123"
        assert metadata["entity_name"] == "calculate"
        assert metadata["doc_file_path"] == "docs/math.md"
        assert "last_updated" in metadata
    
    def test_from_metadata(self):
        """Test creating from metadata dictionary."""
        metadata = {
            "entity_id": "ent-456",
            "entity_name": "process",
            "entity_type": "method",
            "file_path": "handler.py",
            "doc_file_path": "docs/api.md",
            "doc_section": "API",
            "repo_id": "repo",
            "last_updated": "2024-01-01T00:00:00",
        }
        
        link = DocumentationLink.from_metadata(metadata)
        
        assert link.entity_id == "ent-456"
        assert link.entity_name == "process"
        assert link.doc_section == "API"


class TestIndexedDocument:
    """Tests for IndexedDocument schema."""
    
    def test_to_storage_metadata(self):
        """Test converting to storage metadata."""
        doc = IndexedDocument(
            id="doc-123",
            content="This is documentation.",
            file_path="README.md",
            section_title="Introduction",
            repo_id="test_repo",
            linked_entities=["entity1", "entity2"],
        )
        
        metadata = doc.to_storage_metadata()
        
        assert metadata["file_path"] == "README.md"
        assert metadata["section_title"] == "Introduction"
        assert metadata["doc_type"] == "documentation"
        assert "entity1,entity2" == metadata["linked_entities"]


class TestIndexedCodeEntity:
    """Tests for IndexedCodeEntity schema."""
    
    def test_id_generation(self):
        """Test that ID is generated correctly."""
        entity = CodeEntity(
            name="my_func",
            entity_type="function",
            file_path="module.py",
            start_line=10,
            end_line=20,
            content="def my_func(): pass",
        )
        
        indexed = IndexedCodeEntity(entity=entity, repo_id="test")
        
        assert indexed.id  # Should generate an ID
        assert len(indexed.id) == 32
    
    def test_to_storage_metadata(self):
        """Test converting to storage metadata."""
        entity = CodeEntity(
            name="calculate",
            entity_type="function",
            file_path="math.py",
            start_line=5,
            end_line=15,
            content="def calculate(x): return x * 2",
            signature="def calculate(x)",
        )
        
        indexed = IndexedCodeEntity(
            entity=entity,
            repo_id="myrepo",
            documentation_ids=["doc1", "doc2"],
        )
        
        metadata = indexed.to_storage_metadata()
        
        assert metadata["entity_name"] == "calculate"
        assert metadata["entity_type"] == "function"
        assert metadata["doc_type"] == "code_entity"
        assert metadata["signature"] == "def calculate(x)"


class TestCreateNamespaceId:
    """Tests for namespace ID creation."""
    
    def test_basic_namespace(self):
        """Test basic namespace ID creation."""
        ns = create_namespace_id("myorg", "myrepo")
        assert ns == "myorg_myrepo"
    
    def test_lowercase(self):
        """Test that namespace is lowercased."""
        ns = create_namespace_id("MyOrg", "MyRepo")
        assert ns == "myorg_myrepo"
    
    def test_special_characters(self):
        """Test handling of special characters."""
        ns = create_namespace_id("org", "repo-name")
        assert "_" not in ns or ns == "org_repo-name"
