# SPDX-License-Identifier: AGPL-3.0-or-later
"""
Unit tests for src/api/plugin_key.py — GET and POST /plugin-key.
"""

from unittest.mock import MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from src.main import app
from src.pipeline.job_manager import get_db

TENANT_ID = "tenant-plugin-001"
_HEADERS = {"X-Tenant-ID": TENANT_ID}


def _db_with_tenant(tenant):
    def _override():
        session = MagicMock()
        session.query.return_value.filter.return_value.first.return_value = tenant
        yield session

    return _override


def _db_no_tenant():
    session = MagicMock()
    session.query.return_value.filter.return_value.first.return_value = None
    yield session


def _make_tenant(plugin_api_key=None):
    tenant = MagicMock()
    tenant.id = TENANT_ID
    tenant.workflowConfig = {"pluginApiKey": plugin_api_key} if plugin_api_key else {}
    return tenant


class TestGetPluginKey:
    @pytest.mark.asyncio
    async def test_returns_masked_key_when_set(self):
        """GET /plugin-key returns masked preview when a key is configured."""
        tenant = _make_tenant("dg_" + "a" * 48)
        app.dependency_overrides[get_db] = _db_with_tenant(tenant)
        try:
            with patch("src.api.plugin_key.get_tenant_id", return_value=TENANT_ID):
                async with AsyncClient(
                    transport=ASGITransport(app=app), base_url="http://test"
                ) as ac:
                    res = await ac.get("/plugin-key", headers=_HEADERS)
        finally:
            del app.dependency_overrides[get_db]

        assert res.status_code == 200
        data = res.json()
        assert data["isSet"] is True
        assert "..." in data["pluginApiKey"]

    @pytest.mark.asyncio
    async def test_returns_null_when_no_key(self):
        """GET /plugin-key returns isSet=False when no key is configured."""
        tenant = _make_tenant(None)
        app.dependency_overrides[get_db] = _db_with_tenant(tenant)
        try:
            with patch("src.api.plugin_key.get_tenant_id", return_value=TENANT_ID):
                async with AsyncClient(
                    transport=ASGITransport(app=app), base_url="http://test"
                ) as ac:
                    res = await ac.get("/plugin-key", headers=_HEADERS)
        finally:
            del app.dependency_overrides[get_db]

        assert res.status_code == 200
        data = res.json()
        assert data["isSet"] is False
        assert data["pluginApiKey"] is None

    @pytest.mark.asyncio
    async def test_returns_404_when_tenant_missing(self):
        """GET /plugin-key returns 404 when tenant is not found."""
        app.dependency_overrides[get_db] = _db_no_tenant
        try:
            with patch("src.api.plugin_key.get_tenant_id", return_value=TENANT_ID):
                async with AsyncClient(
                    transport=ASGITransport(app=app), base_url="http://test"
                ) as ac:
                    res = await ac.get("/plugin-key", headers=_HEADERS)
        finally:
            del app.dependency_overrides[get_db]

        assert res.status_code == 404


class TestRotatePluginKey:
    @pytest.mark.asyncio
    async def test_generates_new_key(self):
        """POST /plugin-key generates and returns a full dg_ prefixed key."""
        tenant = _make_tenant(None)
        app.dependency_overrides[get_db] = _db_with_tenant(tenant)
        try:
            with patch("src.api.plugin_key.get_tenant_id", return_value=TENANT_ID):
                async with AsyncClient(
                    transport=ASGITransport(app=app), base_url="http://test"
                ) as ac:
                    res = await ac.post("/plugin-key", headers=_HEADERS)
        finally:
            del app.dependency_overrides[get_db]

        assert res.status_code == 200
        data = res.json()
        assert data["isSet"] is True
        assert data["pluginApiKey"].startswith("dg_")
        assert "..." not in data["pluginApiKey"]

    @pytest.mark.asyncio
    async def test_rotate_returns_404_when_tenant_missing(self):
        """POST /plugin-key returns 404 when tenant not found."""
        app.dependency_overrides[get_db] = _db_no_tenant
        try:
            with patch("src.api.plugin_key.get_tenant_id", return_value=TENANT_ID):
                async with AsyncClient(
                    transport=ASGITransport(app=app), base_url="http://test"
                ) as ac:
                    res = await ac.post("/plugin-key", headers=_HEADERS)
        finally:
            del app.dependency_overrides[get_db]

        assert res.status_code == 404

    @pytest.mark.asyncio
    async def test_rotate_persists_key_in_workflow_config(self):
        """POST /plugin-key writes the new key into tenant.workflowConfig."""
        tenant = _make_tenant(None)
        captured = {}

        def _db_capturing():
            session = MagicMock()
            session.query.return_value.filter.return_value.first.return_value = tenant

            def _commit():
                captured["key"] = tenant.workflowConfig.get("pluginApiKey")

            session.commit.side_effect = _commit
            yield session

        app.dependency_overrides[get_db] = _db_capturing
        try:
            with patch("src.api.plugin_key.get_tenant_id", return_value=TENANT_ID):
                async with AsyncClient(
                    transport=ASGITransport(app=app), base_url="http://test"
                ) as ac:
                    res = await ac.post("/plugin-key", headers=_HEADERS)
        finally:
            del app.dependency_overrides[get_db]

        assert res.status_code == 200
        assert res.json()["pluginApiKey"] == captured["key"]


class TestRevokePluginKey:
    @pytest.mark.asyncio
    async def test_pk07_revokes_key(self):
        """PK-07: DELETE /plugin-key removes pluginApiKey from workflowConfig, returns 204."""
        tenant = _make_tenant("dg_" + "a" * 48)
        tenant.workflowConfig = {"pluginApiKey": "dg_" + "a" * 48, "otherSetting": True}
        app.dependency_overrides[get_db] = _db_with_tenant(tenant)
        try:
            with patch("src.api.plugin_key.get_tenant_id", return_value=TENANT_ID):
                async with AsyncClient(
                    transport=ASGITransport(app=app), base_url="http://test"
                ) as ac:
                    res = await ac.delete("/plugin-key", headers=_HEADERS)
        finally:
            del app.dependency_overrides[get_db]

        assert res.status_code == 204
        assert res.content == b""
        assert "pluginApiKey" not in tenant.workflowConfig
        assert tenant.workflowConfig.get("otherSetting") is True

    @pytest.mark.asyncio
    async def test_pk08_returns_404_when_no_key_set(self):
        """PK-08: DELETE /plugin-key returns 404 when no key is currently set."""
        tenant = _make_tenant(None)
        app.dependency_overrides[get_db] = _db_with_tenant(tenant)
        try:
            with patch("src.api.plugin_key.get_tenant_id", return_value=TENANT_ID):
                async with AsyncClient(
                    transport=ASGITransport(app=app), base_url="http://test"
                ) as ac:
                    res = await ac.delete("/plugin-key", headers=_HEADERS)
        finally:
            del app.dependency_overrides[get_db]

        assert res.status_code == 404
        assert res.json()["detail"] == "No plugin API key is set"

    @pytest.mark.asyncio
    async def test_pk09_returns_404_when_tenant_not_found(self):
        """PK-09: DELETE /plugin-key returns 404 when tenant does not exist."""
        app.dependency_overrides[get_db] = _db_no_tenant
        try:
            with patch("src.api.plugin_key.get_tenant_id", return_value=TENANT_ID):
                async with AsyncClient(
                    transport=ASGITransport(app=app), base_url="http://test"
                ) as ac:
                    res = await ac.delete("/plugin-key", headers=_HEADERS)
        finally:
            del app.dependency_overrides[get_db]

        assert res.status_code == 404
        assert res.json()["detail"] == "Tenant not found"
