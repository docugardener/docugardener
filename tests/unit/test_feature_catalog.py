# SPDX-License-Identifier: BUSL-1.1
"""DG-CAT-01: Feature catalog tests.

AC-CAT-01  FEATURES list is non-empty and all entries are Feature instances
AC-CAT-02  All feature keys match the expected set from features.ts
AC-CAT-03  Every feature has non-empty label, description, group
AC-CAT-04  gate is always "tier" or "flag"
AC-CAT-05  min_tier is always FREE, PRO, or TEAM
AC-CAT-06  QUOTA_DIMENSIONS covers pr_analyses_monthly, repos, seats
AC-CAT-07  PLAN_QUOTAS covers FREE, PRO, TEAM with correct values from billing.ts
AC-CAT-11  ENTERPRISE plan has all-unlimited quota dimensions (-1)
AC-CAT-12  PLAN_QUOTAS covers all four tiers (FREE, PRO, TEAM, ENTERPRISE)
AC-CAT-08  No duplicate feature keys
AC-CAT-09  trial_eligible features have min_tier PRO (not FREE or TEAM)
AC-CAT-10  get_feature() returns correct feature or raises KeyError
"""

import pytest

from src.billing.feature_catalog import (
    FEATURES,
    PLAN_QUOTAS,
    QUOTA_DIMENSIONS,
    Feature,
    QuotaDimension,
    get_feature,
)

EXPECTED_KEYS = {
    "audit_log",
    "audit_log_export",
    "risk_map",
    "analytics",
    "holistic_scoring",
    "prompt_customization",
    "llm_config",
    "ai_author_mode",
    "slack_integration",
    "integrations_jira",
    "integrations_linear",
    "integrations_github_issues",
    "sso_saml",
    "scim",
    "environment_profile",
    "compliance_templates",
    "role_auditor",
    "role_billing_admin",
    "private_repos",
    "agent_rules",
}

VALID_TIERS = {"FREE", "PRO", "TEAM", "ENTERPRISE"}
VALID_GATES = {"tier", "flag"}


def test_ac_cat_01_features_non_empty_and_typed():
    """AC-CAT-01: FEATURES is a non-empty list of Feature instances."""
    assert len(FEATURES) > 0
    for f in FEATURES:
        assert isinstance(f, Feature), f"Expected Feature, got {type(f)} for {f}"


def test_ac_cat_02_all_expected_keys_present():
    """AC-CAT-02: All feature keys from features.ts are present."""
    actual_keys = {f.key for f in FEATURES}
    assert actual_keys == EXPECTED_KEYS


def test_ac_cat_03_non_empty_strings():
    """AC-CAT-03: label, description, group are non-empty strings."""
    for f in FEATURES:
        assert f.label, f"Empty label on {f.key}"
        assert f.description, f"Empty description on {f.key}"
        assert f.group, f"Empty group on {f.key}"


def test_ac_cat_04_valid_gate():
    """AC-CAT-04: gate is 'tier' or 'flag'."""
    for f in FEATURES:
        assert f.gate in VALID_GATES, f"{f.key} has invalid gate {f.gate!r}"


def test_ac_cat_05_valid_min_tier():
    """AC-CAT-05: min_tier is FREE, PRO, TEAM, or ENTERPRISE."""
    for f in FEATURES:
        assert f.min_tier in VALID_TIERS, f"{f.key} has invalid min_tier {f.min_tier!r}"


def test_ac_cat_06_quota_dimensions():
    """AC-CAT-06: Required quota dimension keys present."""
    keys = {d.key for d in QUOTA_DIMENSIONS}
    assert "pr_analyses_monthly" in keys
    assert "repos" in keys
    assert "seats" in keys
    for d in QUOTA_DIMENSIONS:
        assert isinstance(d, QuotaDimension)
        assert d.label
        assert d.type in ("number", "boolean")


def test_ac_cat_07_plan_quotas_match_billing_ts():
    """AC-CAT-07: PLAN_QUOTAS match values from billing.ts."""
    assert PLAN_QUOTAS["FREE"]["pr_analyses_monthly"] == 50
    assert PLAN_QUOTAS["FREE"]["repos"] == 1
    assert PLAN_QUOTAS["FREE"]["seats"] == 1

    assert PLAN_QUOTAS["PRO"]["pr_analyses_monthly"] == 500
    assert PLAN_QUOTAS["PRO"]["repos"] == 5
    assert PLAN_QUOTAS["PRO"]["seats"] == 10

    assert PLAN_QUOTAS["TEAM"]["pr_analyses_monthly"] == -1  # unlimited
    assert PLAN_QUOTAS["TEAM"]["repos"] == 9999
    assert PLAN_QUOTAS["TEAM"]["seats"] == 100


def test_ac_cat_11_enterprise_plan_quotas_all_unlimited():
    """AC-CAT-11: ENTERPRISE plan has all-unlimited quota dimensions (-1)."""
    assert "ENTERPRISE" in PLAN_QUOTAS, "ENTERPRISE missing from PLAN_QUOTAS"
    assert PLAN_QUOTAS["ENTERPRISE"]["pr_analyses_monthly"] == -1
    assert PLAN_QUOTAS["ENTERPRISE"]["repos"] == -1
    assert PLAN_QUOTAS["ENTERPRISE"]["seats"] == -1


def test_ac_cat_12_all_plans_present_in_quotas():
    """AC-CAT-12: PLAN_QUOTAS covers all four tiers."""
    for tier in ("FREE", "PRO", "TEAM", "ENTERPRISE"):
        assert tier in PLAN_QUOTAS, f"{tier} missing from PLAN_QUOTAS"


def test_ac_cat_08_no_duplicate_keys():
    """AC-CAT-08: No duplicate feature keys."""
    keys = [f.key for f in FEATURES]
    assert len(keys) == len(set(keys)), "Duplicate feature keys found"


def test_ac_cat_09_trial_eligible_requires_pro():
    """AC-CAT-09: trial_eligible features must have min_tier PRO."""
    for f in FEATURES:
        if f.trial_eligible:
            assert f.min_tier == "PRO", (
                f"{f.key} is trial_eligible but min_tier={f.min_tier!r} (must be PRO)"
            )


def test_ac_cat_10_get_feature_found():
    """AC-CAT-10: get_feature returns correct Feature."""
    f = get_feature("audit_log")
    assert f.key == "audit_log"
    assert f.min_tier == "PRO"


def test_ac_cat_10_get_feature_not_found():
    """AC-CAT-10: get_feature raises KeyError for unknown key."""
    with pytest.raises(KeyError):
        get_feature("nonexistent_feature")
