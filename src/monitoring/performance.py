# SPDX-License-Identifier: AGPL-3.0-or-later
"""
Performance optimization utilities.

Provides caching, rate limiting, and optimization helpers
for meeting the <2 minute processing target.
"""

import asyncio
import functools
import time
from collections import OrderedDict
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, TypeVar

from src.core.logging import get_logger

logger = get_logger(__name__)

T = TypeVar("T")


@dataclass
class CacheEntry:
    """An entry in the LRU cache."""

    value: Any
    expires_at: float


class TTLCache:
    """
    Simple TTL cache with LRU eviction.

    Thread-safe for single-threaded async use.
    """

    def __init__(self, maxsize: int = 1000, ttl_seconds: float = 300):
        """
        Initialize cache.

        Args:
            maxsize: Maximum number of entries
            ttl_seconds: Time-to-live in seconds
        """
        self._cache: OrderedDict[str, CacheEntry] = OrderedDict()
        self._maxsize = maxsize
        self._ttl = ttl_seconds

    def get(self, key: str) -> Any | None:
        """Get value from cache."""
        entry = self._cache.get(key)

        if entry is None:
            return None

        # Check expiry
        if time.time() > entry.expires_at:
            del self._cache[key]
            return None

        # Move to end (LRU)
        self._cache.move_to_end(key)

        return entry.value

    def set(self, key: str, value: Any) -> None:
        """Set value in cache."""
        # Evict if at capacity
        while len(self._cache) >= self._maxsize:
            self._cache.popitem(last=False)

        self._cache[key] = CacheEntry(
            value=value,
            expires_at=time.time() + self._ttl,
        )

    def delete(self, key: str) -> bool:
        """Delete from cache."""
        if key in self._cache:
            del self._cache[key]
            return True
        return False

    def clear(self) -> None:
        """Clear all entries."""
        self._cache.clear()

    def __len__(self) -> int:
        return len(self._cache)


def cached(ttl_seconds: float = 300, maxsize: int = 1000):
    """
    Decorator for caching function results.

    Args:
        ttl_seconds: Cache TTL
        maxsize: Maximum cache size
    """
    cache = TTLCache(maxsize=maxsize, ttl_seconds=ttl_seconds)

    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        @functools.wraps(func)
        def wrapper(*args, **kwargs) -> T:
            # Build cache key
            key = f"{func.__name__}:{args}:{sorted(kwargs.items())}"

            result = cache.get(key)
            if result is not None:
                return result

            result = func(*args, **kwargs)
            cache.set(key, result)

            return result

        wrapper.cache = cache  # Expose cache for testing
        return wrapper

    return decorator


def async_cached(ttl_seconds: float = 300, maxsize: int = 1000):
    """Async version of cached decorator."""
    cache = TTLCache(maxsize=maxsize, ttl_seconds=ttl_seconds)

    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        @functools.wraps(func)
        async def wrapper(*args, **kwargs) -> T:
            key = f"{func.__name__}:{args}:{sorted(kwargs.items())}"

            result = cache.get(key)
            if result is not None:
                return result

            result = await func(*args, **kwargs)
            cache.set(key, result)

            return result

        wrapper.cache = cache
        return wrapper

    return decorator


class RateLimiter:
    """
    Token bucket rate limiter.

    Limits requests per time window.
    """

    def __init__(
        self,
        rate: float,
        burst: int = 10,
    ):
        """
        Initialize rate limiter.

        Args:
            rate: Requests per second
            burst: Maximum burst size
        """
        self._rate = rate
        self._burst = burst
        self._tokens = float(burst)
        self._last_update = time.time()
        self._lock = asyncio.Lock()

    async def acquire(self) -> bool:
        """
        Acquire a token.

        Returns:
            True if acquired, False if rate limited
        """
        async with self._lock:
            now = time.time()
            elapsed = now - self._last_update
            self._last_update = now

            # Add tokens based on time elapsed
            self._tokens = min(
                self._burst,
                self._tokens + elapsed * self._rate,
            )

            if self._tokens >= 1:
                self._tokens -= 1
                return True

            return False

    async def wait(self) -> None:
        """Wait until a token is available."""
        while not await self.acquire():
            await asyncio.sleep(0.1)


class BatchProcessor:
    """
    Batches multiple items for efficient processing.

    Useful for embedding generation and vector DB operations.
    """

    def __init__(
        self,
        batch_size: int = 100,
        max_wait_seconds: float = 0.5,
    ):
        """
        Initialize batch processor.

        Args:
            batch_size: Maximum items per batch
            max_wait_seconds: Maximum wait time for batch fill
        """
        self._batch_size = batch_size
        self._max_wait = max_wait_seconds
        self._queue: list[tuple[Any, asyncio.Future]] = []
        self._lock = asyncio.Lock()
        self._processor: Callable | None = None

    def set_processor(self, processor: Callable) -> None:
        """Set the batch processing function."""
        self._processor = processor

    async def submit(self, item: Any) -> Any:
        """
        Submit an item for batch processing.

        Returns when the item has been processed.
        """
        if self._processor is None:
            raise ValueError("No processor set")

        future: asyncio.Future = asyncio.Future()

        async with self._lock:
            self._queue.append((item, future))

            if len(self._queue) >= self._batch_size:
                await self._process_batch()

        return await future

    async def _process_batch(self) -> None:
        """Process the current batch."""
        if not self._queue:
            return

        items = [item for item, _ in self._queue]
        futures = [future for _, future in self._queue]
        self._queue.clear()

        try:
            results = await self._processor(items)

            for future, result in zip(futures, results):
                future.set_result(result)
        except Exception as e:
            for future in futures:
                future.set_exception(e)


def timeout(seconds: float):
    """
    Decorator to add timeout to async functions.

    Args:
        seconds: Timeout in seconds
    """

    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        @functools.wraps(func)
        async def wrapper(*args, **kwargs) -> T:
            try:
                return await asyncio.wait_for(
                    func(*args, **kwargs),
                    timeout=seconds,
                )
            except TimeoutError:
                logger.warning(
                    "Function timed out",
                    function=func.__name__,
                    timeout=seconds,
                )
                raise

        return wrapper

    return decorator
