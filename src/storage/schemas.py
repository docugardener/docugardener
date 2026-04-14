"""
Documentation schemas for vector storage.

Defines the data structures used for indexing and retrieving
documentation linked to code entities.
"""

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from src.analysis.parser import CodeEntity


@dataclass
class DocumentationLink:
    """
    Links a code entity to its documentation.
    
    Attributes:
        entity_id: Unique identifier for the code entity
        entity_name: Name of the entity (function, class, etc.)
        entity_type: Type of entity
        file_path: Path to the source file
        doc_file_path: Path to the documentation file
        doc_section: Section within the documentation
        repo_id: Repository identifier (for multi-tenant)
        last_updated: Last update timestamp
    """
    entity_id: str
    entity_name: str
    entity_type: str
    file_path: str
    doc_file_path: str
    doc_section: str | None = None
    repo_id: str = ""
    last_updated: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    
    def to_metadata(self) -> dict[str, Any]:
        """Convert to metadata dictionary for vector storage."""
        return {
            "entity_id": self.entity_id,
            "entity_name": self.entity_name,
            "entity_type": self.entity_type,
            "file_path": self.file_path,
            "doc_file_path": self.doc_file_path,
            "doc_section": self.doc_section or "",
            "repo_id": self.repo_id,
            "last_updated": self.last_updated.isoformat(),
        }
    
    @classmethod
    def from_metadata(cls, metadata: dict[str, Any]) -> "DocumentationLink":
        """Create from metadata dictionary."""
        return cls(
            entity_id=metadata.get("entity_id", ""),
            entity_name=metadata.get("entity_name", ""),
            entity_type=metadata.get("entity_type", ""),
            file_path=metadata.get("file_path", ""),
            doc_file_path=metadata.get("doc_file_path", ""),
            doc_section=metadata.get("doc_section") or None,
            repo_id=metadata.get("repo_id", ""),
            last_updated=datetime.fromisoformat(metadata.get("last_updated", datetime.now(timezone.utc).isoformat())),
        )


@dataclass 
class IndexedDocument:
    """
    A documentation chunk indexed for retrieval.
    
    Attributes:
        id: Unique document identifier
        content: Documentation text content
        file_path: Path to the documentation file
        section_title: Title of the section (if applicable)
        repo_id: Repository identifier
        linked_entities: Code entities this doc is linked to
        metadata: Additional metadata
    """
    id: str
    content: str
    file_path: str
    section_title: str | None = None
    repo_id: str = ""
    linked_entities: list[str] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)
    
    def to_storage_metadata(self) -> dict[str, Any]:
        """Convert to metadata for vector storage."""
        return {
            "file_path": self.file_path,
            "section_title": self.section_title or "",
            "repo_id": self.repo_id,
            "linked_entities": ",".join(self.linked_entities),
            "doc_type": "documentation",
            **self.metadata,
        }


@dataclass
class IndexedCodeEntity:
    """
    A code entity indexed for retrieval.
    
    Wraps CodeEntity with additional indexing metadata.
    """
    entity: CodeEntity
    repo_id: str = ""
    documentation_ids: list[str] = field(default_factory=list)
    
    @property
    def id(self) -> str:
        """Generate unique ID for this entity."""
        from src.storage.vectordb import generate_record_id
        return generate_record_id(
            self.entity.file_path,
            self.entity.qualified_name,
            self.entity.entity_type,
        )
    
    def to_storage_metadata(self) -> dict[str, Any]:
        """Convert to metadata for vector storage."""
        return {
            "file_path": self.entity.file_path,
            "entity_name": self.entity.qualified_name,
            "entity_type": self.entity.entity_type,
            "signature": self.entity.signature,
            "start_line": str(self.entity.start_line),
            "end_line": str(self.entity.end_line),
            "repo_id": self.repo_id,
            "documentation_ids": ",".join(self.documentation_ids),
            "doc_type": "code_entity",
        }


def create_namespace_id(owner: str, repo: str) -> str:
    """
    Create a namespace ID for multi-tenant isolation.
    
    Args:
        owner: Repository owner (org or user)
        repo: Repository name
        
    Returns:
        Namespace identifier string
    """
    return f"{owner}/{repo}".lower().replace("/", "_")
