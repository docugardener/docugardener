# SPDX-License-Identifier: AGPL-3.0-or-later
"""HYB-18: CLI license management commands.

Usage:
    docugardener license activate <key>
    docugardener license status
    docugardener license offline-activate <file>
    docugardener license deactivate

Exit codes:
    0  success
    1  validation failure / license not found
    2  network error
"""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path
from typing import Optional

import click
import httpx

# Default cloud service URL (overridable via --cloud-url or CLOUD_SERVICE_URL env var)
DEFAULT_CLOUD_URL = "https://cloud.docugardener.dev"


def _run(coro):
    return asyncio.run(coro)


# ── license group ─────────────────────────────────────────────────────────────

@click.group()
def license_group():
    """Manage DocuGardener license keys."""


# ── activate ──────────────────────────────────────────────────────────────────

@license_group.command("activate")
@click.argument("key")
@click.option("--cloud-url", envvar="CLOUD_SERVICE_URL", default=DEFAULT_CLOUD_URL,
              help="PlatformCloud service URL", show_default=True)
@click.option("--org-id", envvar="GITHUB_ORG", default="",
              help="Your GitHub organization name")
def activate(key: str, cloud_url: str, org_id: str) -> None:
    """Validate a license key against the cloud service.

    On success, prints the activated plan and feature list.
    """
    click.echo(f"🔑 Validating license key against {cloud_url} ...")

    try:
        result = _run(_validate_key(cloud_url, key, org_id or "unknown"))
    except httpx.HTTPError as exc:
        click.secho(f"❌ Network error: {exc}", fg="red")
        sys.exit(2)

    if not result.get("valid"):
        reason = result.get("reason", "unknown")
        click.secho(f"❌ License validation failed: {reason}", fg="red")
        sys.exit(1)

    plan = result.get("plan", "FREE")
    expires_at = result.get("expires_at", "")
    features = result.get("features", [])

    click.secho("✅ License activated!", fg="green", bold=True)
    click.echo(f"   Plan:    {plan}")
    if expires_at:
        click.echo(f"   Expires: {expires_at[:10]}")
    if features:
        click.echo(f"   Features: {', '.join(features)}")

    click.echo("\n💡 Set in your .env file:")
    click.echo(f"   LICENSE_KEY={key}")
    click.echo(f"   DEPLOYMENT_MODE=client-installed")


# ── status ────────────────────────────────────────────────────────────────────

@license_group.command("status")
@click.option("--key", envvar="LICENSE_KEY", default="",
              help="License key (reads LICENSE_KEY env var by default)")
@click.option("--cloud-url", envvar="CLOUD_SERVICE_URL", default=DEFAULT_CLOUD_URL,
              help="PlatformCloud service URL", show_default=True)
@click.option("--mode", envvar="DEPLOYMENT_MODE", default="saas",
              type=click.Choice(["saas", "client-installed", "air-gap"]),
              help="Deployment mode")
@click.option("--license-file", envvar="LICENSE_FILE_PATH",
              default="/etc/docugardener/license.json",
              help="Path to offline license file (air-gap mode)")
def status(key: str, cloud_url: str, mode: str, license_file: str) -> None:
    """Show current license status and plan."""
    if mode == "saas":
        click.echo("ℹ️  SaaS mode — license managed by DocuGardener platform.")
        return

    if mode == "air-gap":
        _show_offline_status(license_file)
        return

    # client-installed
    if not key:
        click.secho("❌ LICENSE_KEY is not set.", fg="red")
        sys.exit(1)

    click.echo(f"🔍 Checking license status against {cloud_url} ...")
    try:
        result = _run(_validate_key(cloud_url, key, "unknown"))
    except httpx.HTTPError as exc:
        click.secho(f"⚠️  Network error: {exc}", fg="yellow")
        click.echo("   Running in offline mode — no status available.")
        sys.exit(2)

    if not result.get("valid"):
        reason = result.get("reason", "unknown")
        click.secho(f"❌ License invalid: {reason}", fg="red")
        sys.exit(1)

    click.secho("✅ License is active", fg="green")
    click.echo(f"   Plan:    {result.get('plan', 'FREE')}")
    expires = result.get("expires_at", "")
    if expires:
        click.echo(f"   Expires: {expires[:10]}")
    features = result.get("features", [])
    if features:
        click.echo(f"   Features: {', '.join(features)}")


# ── offline-activate ──────────────────────────────────────────────────────────

@license_group.command("offline-activate")
@click.argument("file", type=click.Path(exists=True, dir_okay=False, path_type=Path))
@click.option("--install-to", default="/etc/docugardener/license.json",
              help="Target path for the license file", show_default=True)
def offline_activate(file: Path, install_to: str) -> None:
    """Validate and install an offline (Ed25519-signed) license file.

    FILE: path to the .json license file downloaded from the license portal.
    """
    click.echo(f"🔏 Validating offline license file: {file}")

    try:
        payload = _validate_offline_file(file)
    except ValueError as exc:
        click.secho(f"❌ Invalid license file: {exc}", fg="red")
        sys.exit(1)

    plan = payload.get("plan", "FREE")
    expires_at = payload.get("expires_at", "")
    org_name = payload.get("org_name", "")

    click.secho("✅ License file is valid", fg="green", bold=True)
    click.echo(f"   Org:     {org_name}")
    click.echo(f"   Plan:    {plan}")
    if expires_at:
        click.echo(f"   Expires: {expires_at[:10]}")

    target = Path(install_to)
    try:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(file.read_bytes())
        click.secho(f"✅ License file installed to {install_to}", fg="green")
    except PermissionError:
        click.secho(
            f"❌ Permission denied writing to {install_to}. Try with sudo.",
            fg="red",
        )
        sys.exit(1)

    click.echo("\n💡 Add to your .env file:")
    click.echo(f"   DEPLOYMENT_MODE=air-gap")
    click.echo(f"   LICENSE_FILE_PATH={install_to}")


# ── deactivate ────────────────────────────────────────────────────────────────

@license_group.command("deactivate")
@click.option("--license-file", envvar="LICENSE_FILE_PATH",
              default="/etc/docugardener/license.json")
@click.confirmation_option(
    prompt="⚠️  This will remove your license. DocuGardener will revert to FREE plan. Continue?"
)
def deactivate(license_file: str) -> None:
    """Remove the installed license. Reverts to FREE plan on next restart."""
    target = Path(license_file)
    if target.exists():
        try:
            target.unlink()
            click.secho(f"✅ License file removed: {license_file}", fg="green")
        except PermissionError:
            click.secho(f"❌ Permission denied removing {license_file}. Try with sudo.", fg="red")
            sys.exit(1)
    else:
        click.echo(f"ℹ️  No license file at {license_file} — nothing to remove.")

    click.echo("\n⚠️  Remove LICENSE_KEY from your .env and restart to complete deactivation.")


# ── Internal helpers ──────────────────────────────────────────────────────────

async def _validate_key(cloud_url: str, key: str, org_id: str) -> dict:
    url = f"{cloud_url.rstrip('/')}/api/v1/license/validate"
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            url,
            json={"license_key": key, "product": "docugardener", "org_id": org_id},
        )
        resp.raise_for_status()
        return resp.json()


def _validate_offline_file(path: Path) -> dict:
    """Basic structural validation of offline license JSON.

    Full cryptographic verification is done at startup by src/core/license.py.
    CLI just checks the file is parseable and contains required fields.
    """
    try:
        raw = json.loads(path.read_text())
    except json.JSONDecodeError as exc:
        raise ValueError(f"File is not valid JSON: {exc}") from exc

    required = {"plan", "expires_at", "org_name", "signature"}
    missing = required - set(raw.keys())
    if missing:
        raise ValueError(f"Missing required fields: {', '.join(sorted(missing))}")

    if not isinstance(raw.get("signature"), str) or len(raw["signature"]) < 10:
        raise ValueError("signature field is missing or malformed")

    return raw


def _show_offline_status(license_file: str) -> None:
    target = Path(license_file)
    if not target.exists():
        click.secho(f"❌ License file not found at {license_file}", fg="red")
        sys.exit(1)

    try:
        payload = _validate_offline_file(target)
    except ValueError as exc:
        click.secho(f"❌ License file is invalid: {exc}", fg="red")
        sys.exit(1)

    click.secho("✅ Offline license is installed", fg="green")
    click.echo(f"   Org:     {payload.get('org_name', '')}")
    click.echo(f"   Plan:    {payload.get('plan', 'FREE')}")
    expires = payload.get("expires_at", "")
    if expires:
        click.echo(f"   Expires: {expires[:10]}")
