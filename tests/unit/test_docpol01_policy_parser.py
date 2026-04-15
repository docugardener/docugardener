"""
DOCPOL-01: Unit tests for policy_parser.py

Tests the parse_policies() function — validation, defaults, and error handling.
"""

from src.pipeline.policy_parser import DEFAULT_ENFORCEMENT, parse_policies

# ── Happy-path ──────────────────────────────────────────────────────────────────


def test_parse_valid_two_rules():
    """Two well-formed rules are returned as PolicyRule objects."""
    config = {
        "policies": [
            {
                "name": "api-docs",
                "paths": ["src/api/**"],
                "require_docs": ["docs/api/**", "openapi.yaml"],
                "enforcement": "blocking",
            },
            {
                "name": "infra-runbook",
                "paths": ["infra/**"],
                "require_docs": ["runbooks/**"],
                "enforcement": "advisory",
            },
        ]
    }
    rules = parse_policies(config)

    assert len(rules) == 2
    assert rules[0].name == "api-docs"
    assert rules[0].paths == ["src/api/**"]
    assert rules[0].require_docs == ["docs/api/**", "openapi.yaml"]
    assert rules[0].enforcement == "blocking"
    assert rules[1].name == "infra-runbook"
    assert rules[1].enforcement == "advisory"


def test_parse_blocking_with_reason_enforcement():
    """blocking-with-reason enforcement level is accepted verbatim."""
    config = {
        "policies": [
            {
                "name": "sec-policy",
                "paths": ["src/security/**"],
                "require_docs": ["docs/security/**"],
                "enforcement": "blocking-with-reason",
            }
        ]
    }
    rules = parse_policies(config)
    assert len(rules) == 1
    assert rules[0].enforcement == "blocking-with-reason"


def test_enforcement_defaults_to_advisory():
    """A rule without an `enforcement` key defaults to advisory."""
    config = {
        "policies": [
            {
                "name": "no-enforcement-key",
                "paths": ["src/**"],
                "require_docs": ["docs/**"],
            }
        ]
    }
    rules = parse_policies(config)
    assert rules[0].enforcement == DEFAULT_ENFORCEMENT


def test_parse_free_plan_accepts_basic_rules():
    """FREE plan can parse standard path-based rules (no restriction in V1)."""
    config = {
        "policies": [
            {
                "name": "r1",
                "paths": ["src/**"],
                "require_docs": ["docs/**"],
                "enforcement": "advisory",
            }
        ]
    }
    rules = parse_policies(config, tenant_plan="FREE")
    assert len(rules) == 1


# ── Error handling — returns [] ──────────────────────────────────────────────────


def test_missing_policies_key_returns_empty():
    """Config with no `policies` key returns empty list."""
    assert parse_policies({}) == []
    assert parse_policies({"ignore_patterns": ["*.test.ts"]}) == []


def test_policies_is_not_a_list_returns_empty():
    """Non-list `policies` value returns empty list without raising."""
    assert parse_policies({"policies": "not-a-list"}) == []
    assert parse_policies({"policies": {"name": "bad"}}) == []


def test_empty_policies_list_returns_empty():
    """Empty `policies` list returns empty list."""
    assert parse_policies({"policies": []}) == []


def test_invalid_enforcement_level_defaults_to_advisory():
    """Unknown enforcement value is replaced with advisory; rule is kept."""
    config = {
        "policies": [
            {
                "name": "bad-enforcement",
                "paths": ["src/**"],
                "require_docs": ["docs/**"],
                "enforcement": "mandatory",  # unknown
            }
        ]
    }
    rules = parse_policies(config)
    assert len(rules) == 1
    assert rules[0].enforcement == DEFAULT_ENFORCEMENT


def test_missing_name_skips_rule():
    """Rule without `name` is skipped; other valid rules still returned."""
    config = {
        "policies": [
            {"paths": ["src/**"], "require_docs": ["docs/**"]},
            {"name": "valid-rule", "paths": ["infra/**"], "require_docs": ["runbooks/**"]},
        ]
    }
    rules = parse_policies(config)
    assert len(rules) == 1
    assert rules[0].name == "valid-rule"


def test_missing_paths_skips_rule():
    """Rule without `paths` is skipped."""
    config = {
        "policies": [
            {"name": "no-paths", "require_docs": ["docs/**"]},
        ]
    }
    assert parse_policies(config) == []


def test_missing_require_docs_skips_rule():
    """Rule without `require_docs` is skipped."""
    config = {
        "policies": [
            {"name": "no-require-docs", "paths": ["src/**"]},
        ]
    }
    assert parse_policies(config) == []


def test_non_dict_entry_is_skipped():
    """A non-dict entry in the list is skipped; valid entries still returned."""
    config = {
        "policies": [
            "not-a-dict",
            {"name": "valid", "paths": ["src/**"], "require_docs": ["docs/**"]},
        ]
    }
    rules = parse_policies(config)
    assert len(rules) == 1
    assert rules[0].name == "valid"
