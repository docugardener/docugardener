# SPDX-License-Identifier: AGPL-3.0-or-later
"""
Documentation indexer for processing and storing documentation.

Handles discovery, parsing, and indexing of documentation files
(Markdown, RST) linked to code entities.
"""

import re
from pathlib import Path
from typing import Any

from src.analysis.embeddings import (
    format_entity_for_embedding,
    generate_batch_embeddings,
    generate_embedding,
)
from src.analysis.parser import CodeEntity, get_parser
from src.core.logging import get_logger
from src.storage.schemas import (
    IndexedCodeEntity,
    IndexedDocument,
)
from src.storage.vectordb import DocumentRecord, SearchResult, VectorDB, generate_record_id

logger = get_logger(__name__)


def _repo_sub_namespace(tenant_id: str, repo_full_name: str) -> str:
    """
    EPIC-11: Derive the Weaviate sub-namespace for a specific repo within a tenant.

    Format: {tenant_id}__{owner}__{repo_name}
    Slashes and hyphens are normalised to underscores.

    Example: _repo_sub_namespace("cuid123", "myorg/sdk-js") → "cuid123__myorg__sdk_js"

    Security: a tenant can only construct sub-namespaces prefixed with their own
    tenant_id — cross-tenant data access is impossible by construction.
    """
    safe = repo_full_name.replace("/", "__").replace("-", "_")
    return f"{tenant_id}__{safe}"


# Supported documentation file extensions
DOC_EXTENSIONS = {".md", ".markdown", ".rst", ".txt"}


class DocumentIndexer:
    """
    Indexes documentation and code entities for semantic retrieval.

    Handles:
    - Documentation file discovery
    - Content chunking
    - Embedding generation
    - Vector storage
    - Code-to-doc linking
    """

    def __init__(self, vector_db: VectorDB):
        """
        Initialize the indexer.

        Args:
            vector_db: Vector database instance
        """
        self.vector_db = vector_db
        self.parser = get_parser()

    async def index_repository(
        self,
        repo_path: Path,
        owner: str,
        repo_name: str,
        namespace: str,
    ) -> dict[str, Any]:
        """
        Index all documentation and code in a repository.

        Args:
            repo_path: Path to the repository root
            owner: Repository owner
            repo_name: Repository name
            namespace: Tenant ID / Namespace for isolation

        Returns:
            Indexing statistics
        """
        # namespace arg is now required, passed from caller (Tenant ID)

        logger.info(
            "Starting repository indexing",
            repo=f"{owner}/{repo_name}",
            namespace=namespace,
        )

        stats = {
            "docs_indexed": 0,
            "code_entities_indexed": 0,
            "files_processed": 0,
        }

        # Index documentation files
        doc_files = self._discover_doc_files(repo_path)
        for doc_file in doc_files:
            count = await self._index_doc_file(doc_file, repo_path, namespace)
            stats["docs_indexed"] += count
            stats["files_processed"] += 1

        # Index code files
        code_files = self._discover_code_files(repo_path)
        for code_file in code_files:
            entities = await self._index_code_file(code_file, namespace, repo_root=repo_path)
            stats["code_entities_indexed"] += len(entities)
            stats["files_processed"] += 1

        logger.info(
            "Repository indexing complete",
            repo=f"{owner}/{repo_name}",
            **stats,
        )

        return stats

    def _discover_doc_files(self, repo_path: Path) -> list[Path]:
        """Discover documentation files in repository."""
        doc_files = []

        for ext in DOC_EXTENSIONS:
            doc_files.extend(repo_path.rglob(f"*{ext}"))

        # Filter out common non-documentation directories
        excluded = {"node_modules", ".git", "venv", ".venv", "__pycache__", "dist", "build"}
        doc_files = [f for f in doc_files if not any(ex in f.parts for ex in excluded)]

        logger.debug("Discovered documentation files", count=len(doc_files))

        return doc_files

    def _discover_code_files(self, repo_path: Path) -> list[Path]:
        """Discover code files in repository."""
        code_extensions = {".py", ".js", ".jsx", ".ts", ".tsx"}
        code_files = []

        for ext in code_extensions:
            code_files.extend(repo_path.rglob(f"*{ext}"))

        # Filter out common non-source directories
        excluded = {
            "node_modules",
            ".git",
            "venv",
            ".venv",
            "__pycache__",
            "dist",
            "build",
            "test",
            "tests",
        }
        code_files = [f for f in code_files if not any(ex in f.parts for ex in excluded)]

        logger.debug("Discovered code files", count=len(code_files))

        return code_files

    async def _index_doc_file(
        self,
        file_path: Path,
        repo_root: Path,
        namespace: str,
    ) -> int:
        """Index a single documentation file."""
        try:
            content = file_path.read_text(encoding="utf-8")
        except Exception as e:
            logger.warning("Failed to read doc file", file=str(file_path), error=str(e))
            return 0

        relative_path = str(file_path.relative_to(repo_root))

        # Split into chunks (sections)
        chunks = self._chunk_document(content, file_path.suffix)

        if not chunks:
            return 0

        # Generate embeddings for all chunks
        texts = [c["content"] for c in chunks]
        embeddings = generate_batch_embeddings(texts)

        # Create records
        records = []
        for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
            doc_id = generate_record_id(
                relative_path, chunk.get("title", f"section_{i}"), "documentation"
            )

            indexed_doc = IndexedDocument(
                id=doc_id,
                content=chunk["content"],
                file_path=relative_path,
                section_title=chunk.get("title"),
                repo_id=namespace,
            )

            records.append(
                DocumentRecord.from_numpy(
                    id=doc_id,
                    vector=embedding,
                    metadata=indexed_doc.to_storage_metadata(),
                    content=chunk["content"][:1000],  # Truncate for storage
                    namespace=namespace,
                )
            )

        # Upsert to vector DB
        await self.vector_db.upsert(records, namespace=namespace)

        logger.debug("Indexed doc file", file=relative_path, chunks=len(records))

        return len(records)

    async def _index_code_file(
        self,
        file_path: Path,
        namespace: str,
        repo_root: Path | None = None,
    ) -> list[CodeEntity]:
        """Index code entities from a file."""
        entities = self.parser.parse_file(file_path)

        if not entities:
            return []

        # Generate embeddings
        from src.analysis.embeddings import format_entity_for_embedding

        texts = [format_entity_for_embedding(e) for e in entities]
        embeddings = generate_batch_embeddings(texts)

        # Compute repo-relative path for display (avoids leaking ephemeral paths)
        relative_path = (
            str(file_path.relative_to(repo_root)) if repo_root else str(file_path)
        )

        # Create records
        records = []
        import dataclasses
        for entity, embedding in zip(entities, embeddings):
            # Override entity file_path with the repo-relative version
            if repo_root:
                entity = dataclasses.replace(entity, file_path=relative_path)
            indexed = IndexedCodeEntity(entity=entity, repo_id=namespace)

            records.append(
                DocumentRecord.from_numpy(
                    id=indexed.id,
                    vector=embedding,
                    metadata=indexed.to_storage_metadata(),
                    content=entity.content[:1000],  # Truncate for storage
                    namespace=namespace,
                )
            )

        # Upsert to vector DB
        await self.vector_db.upsert(records, namespace=namespace)

        return entities

    def _chunk_document(
        self,
        content: str,
        file_extension: str,
        max_chunk_size: int = 1000,
    ) -> list[dict[str, Any]]:
        """
        Split document into chunks for indexing.

        For Markdown, splits on headers. For other formats, splits on paragraphs.
        """
        chunks = []

        if file_extension in {".md", ".markdown"}:
            # Split on Markdown headers
            sections = re.split(r"^(#{1,6}\s+.+)$", content, flags=re.MULTILINE)

            current_title = None
            current_content = []

            for section in sections:
                if re.match(r"^#{1,6}\s+", section):
                    # This is a header
                    if current_content:
                        chunks.append(
                            {
                                "title": current_title,
                                "content": "\n".join(current_content).strip(),
                            }
                        )
                    current_title = section.strip("#").strip()
                    current_content = []
                else:
                    if section.strip():
                        current_content.append(section)

            # Don't forget the last section
            if current_content:
                chunks.append(
                    {
                        "title": current_title,
                        "content": "\n".join(current_content).strip(),
                    }
                )
        else:
            # Split on double newlines (paragraphs)
            paragraphs = re.split(r"\n\n+", content)

            current_chunk = []
            current_size = 0

            for para in paragraphs:
                para = para.strip()
                if not para:
                    continue

                if current_size + len(para) > max_chunk_size and current_chunk:
                    chunks.append(
                        {
                            "title": None,
                            "content": "\n\n".join(current_chunk),
                        }
                    )
                    current_chunk = []
                    current_size = 0

                current_chunk.append(para)
                current_size += len(para)

            if current_chunk:
                chunks.append(
                    {
                        "title": None,
                        "content": "\n\n".join(current_chunk),
                    }
                )

        # Filter out empty chunks
        chunks = [c for c in chunks if c["content"].strip()]

        return chunks

    async def search_documentation(
        self,
        query: str,
        namespace: str,
        top_k: int = 5,
    ) -> list[SearchResult]:
        """
        Search for relevant documentation.

        Args:
            query: Search query text
            namespace: Repository namespace
            top_k: Maximum results

        Returns:
            List of search results
        """
        query_embedding = generate_embedding(query)

        results = await self.vector_db.search(
            query_vector=query_embedding.tolist(),
            namespace=namespace,
            top_k=top_k,
            filter={"doc_type": "documentation"},
        )

        return results

    async def find_related_docs(
        self,
        entity: CodeEntity,
        namespace: str,
        top_k: int = 3,
    ) -> list[SearchResult]:
        """
        Find documentation related to a code entity.

        Args:
            entity: Code entity to find docs for
            namespace: Repository namespace
            top_k: Maximum results

        Returns:
            List of related documentation
        """
        query_text = format_entity_for_embedding(entity)
        query_embedding = generate_embedding(query_text)

        results = await self.vector_db.search(
            query_vector=query_embedding.tolist(),
            namespace=namespace,
            top_k=top_k,
            filter={"doc_type": "documentation"},
        )

        return results

    async def find_cross_repo_docs(
        self,
        entity: CodeEntity,
        sibling_namespaces: list[str],
        top_k_per_ns: int = 3,
    ) -> list[SearchResult]:
        """
        EPIC-11: Find documentation in sibling repo sub-namespaces that references entity.

        Args:
            entity:              Changed code entity (name, type, signature).
            sibling_namespaces:  Weaviate sub-namespace IDs (pre-validated by caller).
            top_k_per_ns:        Results per namespace (plan-tier controlled by caller).

        Returns:
            Merged, score-sorted results with source_namespace in metadata.
        """

        if not sibling_namespaces:
            return []

        if not hasattr(self.vector_db, "search_multi_namespace"):
            logger.warning("cross_repo: find_cross_repo_docs requires WeaviateDB backend")
            return []

        query_text = format_entity_for_embedding(entity)
        query_embedding = generate_embedding(query_text)

        return await self.vector_db.search_multi_namespace(
            query_vector=query_embedding.tolist(),
            namespaces=sibling_namespaces,
            top_k_per_ns=top_k_per_ns,
        )
