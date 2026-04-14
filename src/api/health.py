"""Health check endpoints for monitoring and orchestration."""

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter

from src.core.config import settings


router = APIRouter()


@router.get("/health", response_model=dict[str, Any])
async def health_check() -> dict[str, Any]:
    """
    Basic health check endpoint.
    
    Returns system status for load balancers and container orchestration.
    """
    return {
        "status": "healthy",
        "service": settings.app_name,
        "version": settings.version,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/ready", response_model=dict[str, Any])
async def readiness_check() -> dict[str, Any]:
    """
    Readiness check endpoint.
    
    Verifies all dependencies are available before accepting traffic.
    """
    checks: dict[str, bool] = {}
    
    # TODO: Add dependency checks
    # - Redis connection
    # - Vector DB connection
    # - GitHub App credentials validity
    
    all_ready = all(checks.values()) if checks else True
    
    return {
        "ready": all_ready,
        "checks": checks,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
