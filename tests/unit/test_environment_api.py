# SPDX-License-Identifier: AGPL-3.0-or-later
"""ENV-DUP-01: Unit tests for the internal environment profile endpoint."""

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from src.main import create_app


@pytest.fixture()
def client():
    app = create_app()
    return TestClient(app)


VALID_TOKEN = "test-encryption-key-32chars-exactly!"


def _settings_patch(**overrides):
    defaults = {
        "encryption_key": VALID_TOKEN,
        "github_app_id": "12345",
        "github_webhook_secret": "my-secret",
        "github_private_key_path": None,
    }
    defaults.update(overrides)
    return defaults


def test_returns_profile_with_valid_token(client):
    with patch("src.api.environment.settings") as mock:
        mock.encryption_key = VALID_TOKEN
        mock.github_app_id = "12345"
        mock.github_webhook_secret = "my-secret"
        mock.github_private_key_path = None

        resp = client.get(
            "/environment/github-app-profile",
            headers={"x-internal-token": VALID_TOKEN},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["appId"] == "12345"
    assert data["webhookSecret"] == "my-secret"
    assert data["privateKey"] == ""


def test_rejects_wrong_token(client):
    with patch("src.api.environment.settings") as mock:
        mock.encryption_key = VALID_TOKEN

        resp = client.get(
            "/environment/github-app-profile",
            headers={"x-internal-token": "wrong-token"},
        )

    assert resp.status_code == 401


def test_rejects_missing_token(client):
    with patch("src.api.environment.settings") as mock:
        mock.encryption_key = VALID_TOKEN

        resp = client.get("/environment/github-app-profile")

    assert resp.status_code == 401


def test_reads_pem_file(client, tmp_path):
    pem = tmp_path / "github-app.pem"
    pem.write_text("-----BEGIN RSA PRIVATE KEY-----\nFAKE\n-----END RSA PRIVATE KEY-----\n")

    with patch("src.api.environment.settings") as mock:
        mock.encryption_key = VALID_TOKEN
        mock.github_app_id = "999"
        mock.github_webhook_secret = "sec"
        mock.github_private_key_path = pem

        resp = client.get(
            "/environment/github-app-profile",
            headers={"x-internal-token": VALID_TOKEN},
        )

    assert resp.status_code == 200
    assert "FAKE" in resp.json()["privateKey"]


def test_pem_unreadable_returns_empty_key(client, tmp_path):
    with patch("src.api.environment.settings") as mock:
        mock.encryption_key = VALID_TOKEN
        mock.github_app_id = "999"
        mock.github_webhook_secret = "sec"
        mock.github_private_key_path = tmp_path / "nonexistent.pem"

        resp = client.get(
            "/environment/github-app-profile",
            headers={"x-internal-token": VALID_TOKEN},
        )

    assert resp.status_code == 200
    assert resp.json()["privateKey"] == ""
