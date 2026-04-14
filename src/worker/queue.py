# SPDX-License-Identifier: AGPL-3.0-or-later
"""
Redis Queue configuration and management.

Handles connection to Redis and queue instantiation.

Priority queues (GAP-5):
  QUEUE_HIGH    — "high"    — fix PR creation, ignore drift (user-facing, time-sensitive)
  QUEUE_DEFAULT — "default" — PR analysis (background, bulk)

Worker must be started with: rq worker high default
(RQ drains "high" before touching "default".)
"""

from redis import Redis
from rq import Queue

from src.core.config import settings
from src.core.logging import get_logger

logger = get_logger(__name__)

# Queue name constants — import these instead of hardcoding strings.
QUEUE_HIGH: str = "high"
QUEUE_DEFAULT: str = "default"


def get_redis_connection() -> Redis:
    """
    Get a Redis connection.

    Returns:
        Redis client instance
    """
    return Redis.from_url(settings.redis_url)


def get_queue(name: str = QUEUE_DEFAULT) -> Queue:
    """
    Get an RQ queue instance.

    Args:
        name: Queue name (use QUEUE_HIGH or QUEUE_DEFAULT constants)

    Returns:
        RQ Queue instance
    """
    redis_conn = get_redis_connection()
    return Queue(name, connection=redis_conn)
