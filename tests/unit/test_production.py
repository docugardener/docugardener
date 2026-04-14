"""Unit tests for production hardening modules."""

import pytest
import time

from src.monitoring.performance import (
    TTLCache,
    RateLimiter,
    cached,
    timeout,
)


class TestTTLCache:
    """Tests for TTL cache."""
    
    def test_set_and_get(self):
        """Test basic set and get."""
        cache = TTLCache(maxsize=10, ttl_seconds=60)
        
        cache.set("key1", "value1")
        
        assert cache.get("key1") == "value1"
    
    def test_expiry(self):
        """Test that entries expire."""
        cache = TTLCache(maxsize=10, ttl_seconds=0.1)
        
        cache.set("key", "value")
        
        # Should be available immediately
        assert cache.get("key") == "value"
        
        # Wait for expiry
        time.sleep(0.15)
        
        assert cache.get("key") is None
    
    def test_lru_eviction(self):
        """Test LRU eviction at capacity."""
        cache = TTLCache(maxsize=2, ttl_seconds=60)
        
        cache.set("a", 1)
        cache.set("b", 2)
        cache.set("c", 3)  # Should evict "a"
        
        assert cache.get("a") is None
        assert cache.get("b") == 2
        assert cache.get("c") == 3


class TestCachedDecorator:
    """Tests for cached decorator."""
    
    def test_caches_result(self):
        """Test that results are cached."""
        call_count = 0
        
        @cached(ttl_seconds=60)
        def expensive_func(x):
            nonlocal call_count
            call_count += 1
            return x * 2
        
        result1 = expensive_func(5)
        result2 = expensive_func(5)
        
        assert result1 == 10
        assert result2 == 10
        assert call_count == 1  # Only called once


@pytest.mark.asyncio
class TestRateLimiter:
    """Tests for rate limiter."""
    
    async def test_acquire_within_limit(self):
        """Test acquiring tokens within limit."""
        limiter = RateLimiter(rate=10, burst=5)
        
        # Should be able to acquire burst tokens
        for _ in range(5):
            assert await limiter.acquire() is True
    
    async def test_rate_limited(self):
        """Test being rate limited after burst."""
        limiter = RateLimiter(rate=10, burst=2)
        
        # Use burst
        await limiter.acquire()
        await limiter.acquire()
        
        # Should be limited
        assert await limiter.acquire() is False


@pytest.mark.asyncio
class TestTimeoutDecorator:
    """Tests for timeout decorator."""
    
    async def test_completes_within_timeout(self):
        """Test function completing within timeout."""
        @timeout(1.0)
        async def quick_func():
            return "done"
        
        result = await quick_func()
        assert result == "done"
    
    async def test_times_out(self):
        """Test function timing out."""
        import asyncio
        
        @timeout(0.1)
        async def slow_func():
            await asyncio.sleep(1.0)
            return "done"
        
        with pytest.raises(asyncio.TimeoutError):
            await slow_func()
