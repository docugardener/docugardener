# SPDX-License-Identifier: AGPL-3.0-or-later
"""Regression tests for the credential-decryption error path in worker context.

`src/worker/context.py` caught decryption failures and called `logger.error(...)`,
but the module never bound a `logger`. Ruff caught it as F821. The effect: on an
ENCRYPTION_KEY mismatch between web and backend, the `except` handler itself
raised NameError, so the intended graceful degradation (blank the key, keep
going) never ran and `get_tenant_context` blew up — the diagnostic path failing
at exactly the moment it was needed.
"""

from unittest.mock import MagicMock, patch

import pytest


def _tenant(llm_config: dict) -> MagicMock:
    tenant = MagicMock()
    tenant.id = "tenant-1"
    tenant.name = "acme"
    tenant.appId = "12345"
    tenant.privateKey = "enc:private-key"
    tenant.llmConfig = llm_config
    tenant.notificationConfig = None
    tenant.workflowConfig = None
    tenant.plan = "FREE"
    tenant.installationId = "999"
    return tenant


def _session_for(tenant: MagicMock) -> MagicMock:
    session = MagicMock()
    session.execute.return_value.scalars.return_value.first.return_value = tenant
    return session


def _decrypt_failing_on(*bad_values: str):
    """decrypt_credential stub: works for the private key, fails for the LLM key."""

    def _decrypt(value: str) -> str:
        if value in bad_values:
            raise ValueError("ENCRYPTION_KEY mismatch")
        return f"decrypted:{value}"

    return _decrypt


class TestDecryptionFailureDegradesGracefully:
    def test_nested_provider_key_failure_blanks_key_instead_of_raising(self):
        """A per-provider key that will not decrypt becomes "", not a NameError."""
        from src.worker.context import get_tenant_context

        tenant = _tenant({"keys": {"gemini": "enc:bad", "openai": "enc:good"}})

        with (
            patch("src.worker.context.SessionLocal", return_value=_session_for(tenant)),
            patch(
                "src.worker.context.decrypt_credential",
                side_effect=_decrypt_failing_on("enc:bad"),
            ),
        ):
            ctx = get_tenant_context("999")

        assert ctx.llm_config["keys"]["gemini"] == ""
        # The healthy provider is untouched — one bad key must not poison the rest.
        assert ctx.llm_config["keys"]["openai"] == "decrypted:enc:good"
        assert ctx.private_key == "decrypted:enc:private-key"

    def test_legacy_flat_apikey_failure_blanks_key_instead_of_raising(self):
        """Same guarantee on the legacy flat `apiKey` field."""
        from src.worker.context import get_tenant_context

        tenant = _tenant({"apiKey": "enc:bad"})

        with (
            patch("src.worker.context.SessionLocal", return_value=_session_for(tenant)),
            patch(
                "src.worker.context.decrypt_credential",
                side_effect=_decrypt_failing_on("enc:bad"),
            ),
        ):
            ctx = get_tenant_context("999")

        assert ctx.llm_config["apiKey"] == ""

    @pytest.mark.parametrize(
        ("llm_config", "expect_provider"),
        [
            ({"keys": {"gemini": "enc:bad"}}, True),
            ({"apiKey": "enc:bad"}, False),
        ],
    )
    def test_failure_is_logged_with_tenant_id(self, llm_config, expect_provider):
        """The handler logs the mismatch — this is what NameError used to prevent."""
        from src.worker.context import get_tenant_context

        tenant = _tenant(llm_config)

        with (
            patch("src.worker.context.SessionLocal", return_value=_session_for(tenant)),
            patch(
                "src.worker.context.decrypt_credential",
                side_effect=_decrypt_failing_on("enc:bad"),
            ),
            patch("src.worker.context.logger") as mock_logger,
        ):
            get_tenant_context("999")

        mock_logger.error.assert_called_once()
        kwargs = mock_logger.error.call_args.kwargs
        assert kwargs["tenant_id"] == "tenant-1"
        assert ("provider" in kwargs) is expect_provider

    def test_module_binds_a_logger(self):
        """Guard the root cause directly: the name must exist at module scope."""
        import src.worker.context as context_module

        assert hasattr(context_module, "logger"), (
            "src.worker.context must bind a module-level logger — the decryption "
            "error handlers call logger.error()"
        )
        assert callable(context_module.logger.error)
