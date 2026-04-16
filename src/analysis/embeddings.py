# SPDX-License-Identifier: AGPL-3.0-or-later
"""
Local embedding generation using sentence-transformers.

Generates vector embeddings for code entities locally without
sending code to external APIs, ensuring privacy and security.
"""

from functools import lru_cache

import numpy as np
from sentence_transformers import SentenceTransformer

from src.analysis.parser import CodeEntity
from src.core.config import settings
from src.core.logging import get_logger

logger = get_logger(__name__)


# Global model instance (lazy loaded)
_model: SentenceTransformer | None = None


def get_embedding_model() -> SentenceTransformer:
    """
    Get or initialize the sentence transformer model.

    Uses lazy loading to avoid startup overhead.
    Model is downloaded automatically on first use.

    Returns:
        Loaded SentenceTransformer model
    """
    global _model

    if _model is None:
        logger.info("Loading embedding model", model=settings.embeddings_model)
        # Force CPU to avoid MPS fork crashes (signal 6) in RQ workers on Mac
        _model = SentenceTransformer(settings.embeddings_model, device="cpu")
        logger.info(
            "Embedding model loaded",
            model=settings.embeddings_model,
            dimension=getattr(
                _model, "get_embedding_dimension", _model.get_sentence_embedding_dimension
            )(),
        )

    return _model


def format_entity_for_embedding(entity: CodeEntity) -> str:
    """
    Format a code entity for embedding generation.

    Creates a text representation that captures the semantic meaning
    of the entity for vector comparison.

    Args:
        entity: Code entity to format

    Returns:
        Formatted text string for embedding
    """
    parts: list[str] = []

    # Entity type and name
    parts.append(f"{entity.entity_type}: {entity.qualified_name}")

    # Signature if available
    if entity.signature:
        parts.append(f"Signature: {entity.signature}")

    # Docstring if available
    if entity.docstring:
        parts.append(f"Description: {entity.docstring}")

    # Add content summary (first 500 chars to avoid too long embeddings)
    content_summary = entity.content[:500]
    if len(entity.content) > 500:
        content_summary += "..."
    parts.append(f"Code:\n{content_summary}")

    return "\n".join(parts)


def generate_embedding(text: str) -> np.ndarray:
    """
    Generate embedding vector for text.

    Args:
        text: Text to embed

    Returns:
        Numpy array of embedding vector
    """
    model = get_embedding_model()
    embedding = model.encode(text, convert_to_numpy=True)
    return embedding


def generate_entity_embedding(entity: CodeEntity) -> np.ndarray:
    """
    Generate embedding vector for a code entity.

    Args:
        entity: Code entity to embed

    Returns:
        Numpy array of embedding vector
    """
    text = format_entity_for_embedding(entity)
    return generate_embedding(text)


def generate_batch_embeddings(texts: list[str]) -> list[np.ndarray]:
    """
    Generate embeddings for multiple texts in batch.

    More efficient than generating one at a time.

    Args:
        texts: List of texts to embed

    Returns:
        List of embedding vectors
    """
    if not texts:
        return []

    model = get_embedding_model()
    embeddings = model.encode(texts, convert_to_numpy=True, show_progress_bar=False)

    logger.debug("Generated batch embeddings", count=len(texts))

    return list(embeddings)


def generate_entity_embeddings(entities: list[CodeEntity]) -> list[tuple[CodeEntity, np.ndarray]]:
    """
    Generate embeddings for multiple code entities.

    Args:
        entities: List of code entities

    Returns:
        List of (entity, embedding) tuples
    """
    if not entities:
        return []

    texts = [format_entity_for_embedding(e) for e in entities]
    embeddings = generate_batch_embeddings(texts)

    logger.info("Generated entity embeddings", count=len(entities))

    return list(zip(entities, embeddings))


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """
    Calculate cosine similarity between two vectors.

    Args:
        a: First vector
        b: Second vector

    Returns:
        Similarity score (0 to 1)
    """
    dot_product = np.dot(a, b)
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)

    if norm_a == 0 or norm_b == 0:
        return 0.0

    return float(dot_product / (norm_a * norm_b))


def find_similar_entities(
    query_embedding: np.ndarray,
    entity_embeddings: list[tuple[CodeEntity, np.ndarray]],
    top_k: int = 5,
    threshold: float = 0.5,
) -> list[tuple[CodeEntity, float]]:
    """
    Find entities most similar to a query embedding.

    Args:
        query_embedding: Query vector
        entity_embeddings: List of (entity, embedding) tuples
        top_k: Maximum number of results
        threshold: Minimum similarity threshold

    Returns:
        List of (entity, similarity) tuples, sorted by similarity
    """
    similarities: list[tuple[CodeEntity, float]] = []

    for entity, embedding in entity_embeddings:
        sim = cosine_similarity(query_embedding, embedding)
        if sim >= threshold:
            similarities.append((entity, sim))

    # Sort by similarity descending
    similarities.sort(key=lambda x: x[1], reverse=True)

    return similarities[:top_k]


@lru_cache(maxsize=1000)
def _cached_embedding(text: str) -> tuple[float, ...]:
    """
    Cached embedding generation (converts to tuple for hashability).

    Note: This is for repeated embedding of the same text during a session.
    For persistent caching, use Redis or similar.
    """
    embedding = generate_embedding(text)
    return tuple(embedding.tolist())


def get_embedding_dimension() -> int:
    """Get the dimension of the embedding vectors."""
    model = get_embedding_model()
    return model.get_sentence_embedding_dimension()


class EmbeddingService:
    """
    Service class for managing embeddings with caching.

    Provides a higher-level interface for embedding operations
    with built-in caching and batch optimization.
    """

    def __init__(self):
        """Initialize embedding service."""
        self._cache: dict[str, np.ndarray] = {}

    def embed_entity(self, entity: CodeEntity) -> np.ndarray:
        """
        Generate or retrieve cached embedding for entity.

        Args:
            entity: Code entity to embed

        Returns:
            Embedding vector
        """
        cache_key = f"{entity.file_path}:{entity.qualified_name}:{entity.start_line}"

        if cache_key in self._cache:
            return self._cache[cache_key]

        embedding = generate_entity_embedding(entity)
        self._cache[cache_key] = embedding

        return embedding

    def embed_entities(self, entities: list[CodeEntity]) -> list[tuple[CodeEntity, np.ndarray]]:
        """
        Generate embeddings for multiple entities with caching.

        Args:
            entities: List of code entities

        Returns:
            List of (entity, embedding) tuples
        """
        results: list[tuple[CodeEntity, np.ndarray]] = []
        uncached: list[CodeEntity] = []

        # Check cache first
        for entity in entities:
            cache_key = f"{entity.file_path}:{entity.qualified_name}:{entity.start_line}"
            if cache_key in self._cache:
                results.append((entity, self._cache[cache_key]))
            else:
                uncached.append(entity)

        # Generate embeddings for uncached entities
        if uncached:
            new_embeddings = generate_entity_embeddings(uncached)
            for entity, embedding in new_embeddings:
                cache_key = f"{entity.file_path}:{entity.qualified_name}:{entity.start_line}"
                self._cache[cache_key] = embedding
                results.append((entity, embedding))

        return results

    def clear_cache(self) -> None:
        """Clear the embedding cache."""
        self._cache.clear()
        logger.debug("Embedding cache cleared")
