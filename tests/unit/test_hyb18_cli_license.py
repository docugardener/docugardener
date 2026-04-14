# SPDX-License-Identifier: BUSL-1.1
"""HYB-18: CLI license tool tests.

AC-HYB18-01  activate exits 0 on valid key with cloud response
AC-HYB18-02  activate exits 2 on network error
AC-HYB18-03  activate exits 1 when cloud returns valid=False
AC-HYB18-04  activate prints plan and features on success
AC-HYB18-05  status exits 0 in saas mode (no key needed)
AC-HYB18-06  status exits 1 when license_key missing in client-installed mode
AC-HYB18-07  status exits 2 on network error
AC-HYB18-08  status exits 1 when cloud returns invalid
AC-HYB18-09  offline-activate exits 1 for non-JSON file
AC-HYB18-10  offline-activate exits 1 for missing required fields
AC-HYB18-11  offline-activate exits 1 for malformed signature
AC-HYB18-12  offline-activate validates correct license file structure
AC-HYB18-13  _validate_offline_file parses valid JSON file
AC-HYB18-14  _next_month_start handles December → January rollover (CLI uses none; validates core logic)
AC-HYB18-15  deactivate removes license file
"""

import json
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from click.testing import CliRunner

from src.cli.license import license_group, _validate_offline_file


# ── Helpers ───────────────────────────────────────────────────────────────────

def make_cloud_resp(data: dict, status: int = 200):
    resp = MagicMock()
    resp.json.return_value = data
    resp.status_code = status
    if status >= 400:
        resp.raise_for_status.side_effect = httpx.HTTPStatusError(
            "error", request=MagicMock(), response=resp
        )
    else:
        resp.raise_for_status.return_value = None
    return resp


VALID_LICENSE_JSON = {
    "plan": "PRO",
    "expires_at": "2027-01-01T00:00:00Z",
    "org_name": "Acme Corp",
    "license_key_id": "dg_lic_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
    "issued_at": "2026-01-01T00:00:00Z",
    "signature": "validbase64urlsignaturethatislongenough",
}


def _patch_httpx(data: dict, status: int = 200):
    """Context manager that patches httpx.AsyncClient to return a mock response."""
    resp = make_cloud_resp(data, status)

    class _CM:
        def __enter__(self_):
            self_.mock_cls = patch("httpx.AsyncClient").__enter__()
            mock_cls = patch("httpx.AsyncClient").start()
            mock_http = AsyncMock()
            mock_http.__aenter__ = AsyncMock(return_value=mock_http)
            mock_http.__aexit__ = AsyncMock(return_value=False)
            mock_http.post = AsyncMock(return_value=resp)
            mock_cls.return_value = mock_http
            self_._patcher = patch("httpx.AsyncClient", return_value=mock_http)
            self_._patcher.start()
            return self_

        def __exit__(self_, *args):
            self_._patcher.stop()

    return _CM()


# ── activate tests ────────────────────────────────────────────────────────────

def test_ac_hyb18_01_activate_exits_0_on_valid_key():
    """AC-HYB18-01: activate exits 0 on valid key."""
    runner = CliRunner()
    with patch("src.cli.license._validate_key", new=AsyncMock(return_value={
        "valid": True, "plan": "PRO", "expires_at": "2027-01-01T00:00:00Z",
        "features": ["slack_integration"],
    })):
        result = runner.invoke(
            license_group, ["activate", "dg_lic_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4"]
        )
    assert result.exit_code == 0


def test_ac_hyb18_02_activate_exits_2_on_network_error():
    """AC-HYB18-02: activate exits 2 on network error."""
    runner = CliRunner()
    with patch("src.cli.license._validate_key", new=AsyncMock(
        side_effect=httpx.ConnectError("refused")
    )):
        result = runner.invoke(
            license_group, ["activate", "dg_lic_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4"]
        )
    assert result.exit_code == 2


def test_ac_hyb18_03_activate_exits_1_when_invalid():
    """AC-HYB18-03: activate exits 1 when cloud returns valid=False."""
    runner = CliRunner()
    with patch("src.cli.license._validate_key", new=AsyncMock(return_value={
        "valid": False, "reason": "license_revoked",
    })):
        result = runner.invoke(
            license_group, ["activate", "dg_lic_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4"]
        )
    assert result.exit_code == 1


def test_ac_hyb18_04_activate_prints_plan_and_features():
    """AC-HYB18-04: activate prints plan and features on success."""
    runner = CliRunner()
    with patch("src.cli.license._validate_key", new=AsyncMock(return_value={
        "valid": True, "plan": "TEAM", "expires_at": "2027-06-01T00:00:00Z",
        "features": ["sso_saml", "audit_log"],
    })):
        result = runner.invoke(
            license_group, ["activate", "dg_lic_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4"]
        )
    assert "TEAM" in result.output
    assert "sso_saml" in result.output


# ── status tests ──────────────────────────────────────────────────────────────

def test_ac_hyb18_05_status_exits_0_in_saas():
    """AC-HYB18-05: status exits 0 in saas mode."""
    runner = CliRunner()
    result = runner.invoke(license_group, ["status", "--mode", "saas"])
    assert result.exit_code == 0
    assert "SaaS mode" in result.output


def test_ac_hyb18_06_status_exits_1_no_key_in_client_installed():
    """AC-HYB18-06: status exits 1 when license_key missing in client-installed mode."""
    runner = CliRunner()
    result = runner.invoke(license_group, ["status", "--mode", "client-installed", "--key", ""])
    assert result.exit_code == 1


def test_ac_hyb18_07_status_exits_2_on_network_error():
    """AC-HYB18-07: status exits 2 on network error."""
    runner = CliRunner()
    with patch("src.cli.license._validate_key", new=AsyncMock(
        side_effect=httpx.ConnectError("refused")
    )):
        result = runner.invoke(license_group, [
            "status", "--mode", "client-installed",
            "--key", "dg_lic_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4"
        ])
    assert result.exit_code == 2


def test_ac_hyb18_08_status_exits_1_when_invalid():
    """AC-HYB18-08: status exits 1 when cloud returns invalid."""
    runner = CliRunner()
    with patch("src.cli.license._validate_key", new=AsyncMock(return_value={
        "valid": False, "reason": "license_expired",
    })):
        result = runner.invoke(license_group, [
            "status", "--mode", "client-installed",
            "--key", "dg_lic_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4"
        ])
    assert result.exit_code == 1


# ── offline-activate tests ────────────────────────────────────────────────────

def test_ac_hyb18_09_offline_activate_exits_1_for_non_json(tmp_path):
    """AC-HYB18-09: offline-activate exits 1 for non-JSON file."""
    bad_file = tmp_path / "bad.json"
    bad_file.write_text("not json at all")
    runner = CliRunner()
    result = runner.invoke(license_group, ["offline-activate", str(bad_file)])
    assert result.exit_code == 1
    assert "not valid JSON" in result.output.lower() or "invalid" in result.output.lower()


def test_ac_hyb18_10_offline_activate_exits_1_for_missing_fields(tmp_path):
    """AC-HYB18-10: offline-activate exits 1 for missing required fields."""
    bad_file = tmp_path / "missing.json"
    bad_file.write_text(json.dumps({"plan": "PRO"}))
    runner = CliRunner()
    result = runner.invoke(license_group, ["offline-activate", str(bad_file)])
    assert result.exit_code == 1


def test_ac_hyb18_11_offline_activate_exits_1_for_malformed_sig(tmp_path):
    """AC-HYB18-11: exits 1 for malformed signature."""
    bad_file = tmp_path / "badsig.json"
    payload = {**VALID_LICENSE_JSON, "signature": "x"}  # too short
    bad_file.write_text(json.dumps(payload))
    runner = CliRunner()
    result = runner.invoke(license_group, ["offline-activate", str(bad_file)])
    assert result.exit_code == 1


def test_ac_hyb18_12_offline_activate_valid_file(tmp_path):
    """AC-HYB18-12: offline-activate succeeds for valid license file."""
    license_file = tmp_path / "license.json"
    license_file.write_text(json.dumps(VALID_LICENSE_JSON))
    install_target = tmp_path / "installed" / "license.json"
    runner = CliRunner()
    result = runner.invoke(
        license_group,
        ["offline-activate", str(license_file), "--install-to", str(install_target)]
    )
    assert result.exit_code == 0
    assert "License file is valid" in result.output
    assert install_target.exists()
    assert json.loads(install_target.read_text())["plan"] == "PRO"


# ── _validate_offline_file tests ─────────────────────────────────────────────

def test_ac_hyb18_13_validate_offline_file_parses_valid(tmp_path):
    """AC-HYB18-13: _validate_offline_file returns parsed dict for valid file."""
    f = tmp_path / "license.json"
    f.write_text(json.dumps(VALID_LICENSE_JSON))
    result = _validate_offline_file(f)
    assert result["plan"] == "PRO"
    assert result["org_name"] == "Acme Corp"


# ── deactivate tests ──────────────────────────────────────────────────────────

def test_ac_hyb18_15_deactivate_removes_license_file(tmp_path):
    """AC-HYB18-15: deactivate removes the license file."""
    license_file = tmp_path / "license.json"
    license_file.write_text(json.dumps(VALID_LICENSE_JSON))
    runner = CliRunner()
    result = runner.invoke(
        license_group,
        ["deactivate", "--license-file", str(license_file)],
        input="y\n",
    )
    assert result.exit_code == 0
    assert not license_file.exists()
