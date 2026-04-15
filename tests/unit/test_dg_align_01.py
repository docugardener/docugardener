# SPDX-License-Identifier: BUSL-1.1
"""DG-ALIGN-01: Feature key alignment with PlatformCloud PRODUCT_REGISTRY.

Regression tests that verify the three renamed keys and the new compliance_templates
key match exactly what PlatformCloud's PRODUCT_REGISTRY sends as granted_features.

PC canonical keys (PRODUCT_REGISTRY docugardener):
  PRO   → slack_integration, agent_rules
  TEAM  → sso_saml, scim, audit_log, compliance_templates

These tests will catch any future drift between DG feature_catalog.py and the PC registry.
"""

from src.billing.feature_catalog import FEATURES, get_feature

# Keys that PC sends over the wire in granted_features for DG
PC_CANONICAL_KEYS = {
    "slack_integration",
    "agent_rules",
    "sso_saml",
    "compliance_templates",
}

# Keys that were renamed — must NOT appear in the catalog any more
REMOVED_KEYS = {
    "integrations_slack",
    "agent_rules_unlimited",
    "sso",
}


def test_align01_renamed_keys_gone():
    """DG-ALIGN-01: Old keys must not exist in the catalog."""
    actual_keys = {f.key for f in FEATURES}
    for old_key in REMOVED_KEYS:
        assert old_key not in actual_keys, f"Old key {old_key!r} still present — rename incomplete"


def test_align01_canonical_keys_present():
    """DG-ALIGN-01: All PC canonical keys must be present in the catalog."""
    actual_keys = {f.key for f in FEATURES}
    for key in PC_CANONICAL_KEYS:
        assert key in actual_keys, (
            f"PC canonical key {key!r} missing from DG catalog — "
            "cloud feature grants will be silently ignored"
        )


def test_align01_slack_integration_is_pro():
    f = get_feature("slack_integration")
    assert f.min_tier == "PRO"


def test_align01_agent_rules_is_free():
    # DG-SAAS-05: agent_rules access is FREE; quota (3 rule sets) enforced in quota.py
    f = get_feature("agent_rules")
    assert f.min_tier == "FREE"


def test_align01_sso_saml_is_team():
    f = get_feature("sso_saml")
    assert f.min_tier == "TEAM"


def test_align01_compliance_templates_is_team():
    f = get_feature("compliance_templates")
    assert f.min_tier == "TEAM"


def test_align01_granted_features_gate():
    """Simulate DG-LPP-06: when PC grants ['slack_integration', 'agent_rules'],
    feature check for the old key names must fail (keys are gone), and the
    new key names resolve correctly from the catalog.
    """
    granted = ["slack_integration", "agent_rules", "sso_saml", "compliance_templates"]
    actual_keys = {f.key for f in FEATURES}
    for key in granted:
        assert key in actual_keys, f"Granted key {key!r} not resolvable in catalog"
