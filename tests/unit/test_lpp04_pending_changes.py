# SPDX-License-Identifier: AGPL-3.0-or-later
"""DG-LPP-04: Pending changes endpoint tests.

AC-LPP04-01  GET /billing/pending-changes always returns [] (PlatformCloud sync removed).
"""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from src.api.billing import router


@pytest.fixture
def test_client():
    app = FastAPI()
    app.include_router(router, prefix="/billing")
    return TestClient(app)


def test_ac_lpp04_01_always_returns_empty(test_client):
    """AC-LPP04-01: pending-changes endpoint always returns an empty list."""
    resp = test_client.get("/billing/pending-changes")
    assert resp.status_code == 200
    assert resp.json() == {"pending_changes": []}
