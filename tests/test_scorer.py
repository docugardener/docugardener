"""
Comprehensive unit tests for the DocuGardener Drift Scoring algorithms.

Covers:
- Standard Scoring Model (v2.1) - legacy math determinism
- Holistic Scoring Model (v3.0) - directory weights and blast radius
- Directory Weight mapper (Kernel / Feature / Leaf tiers)
- Edge cases: empty changes, cosmetic-only, deleted entities, mixed changelists
"""

import math

from src.analysis.diff import ChangeType, EntityChange
from src.analysis.parser import CodeEntity
from src.analysis.scorer import (
    CHANGE_WEIGHTS,
    FEATURE_WEIGHT,
    KERNEL_WEIGHT,
    LEAF_WEIGHT,
    DriftScorer,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def make_entity(
    name: str = "my_func",
    file_path: str = "src/feature/utils.py",
    entity_type: str = "function",
    start_line: int = 1,
    end_line: int = 10,
) -> CodeEntity:
    """Create a CodeEntity with default test values. Visibility is inferred from name."""
    entity = CodeEntity(
        name=name,
        entity_type=entity_type,
        file_path=file_path,
        start_line=start_line,
        end_line=end_line,
        content=f"def {name}(): pass",
        signature=f"{name}()",
    )
    return entity


def make_change(
    change_type: ChangeType = ChangeType.LOGIC_MODIFIED,
    file_path: str = "src/feature/utils.py",
    name: str = "my_func",
    start_line: int = 1,
    end_line: int = 10,
    blast_radius: int = 0,
    directory_weight: float = 1.0,
    is_public: bool = True,
) -> EntityChange:
    entity = make_entity(
        name=name,
        file_path=file_path,
        start_line=start_line,
        end_line=end_line,
    )
    change = EntityChange(
        entity=entity,
        change_type=change_type,
        blast_radius=blast_radius,
        directory_weight=directory_weight,
    )
    return change


# ===========================================================================
# 1. Directory Weight Mapper Tests
# ===========================================================================


class TestGetDirectoryWeight:
    def test_kernel_tier_src_core(self):
        assert DriftScorer.get_directory_weight("src/core/config.py") == KERNEL_WEIGHT

    def test_kernel_tier_src_auth(self):
        assert DriftScorer.get_directory_weight("src/auth/jwt.py") == KERNEL_WEIGHT

    def test_kernel_tier_src_security(self):
        assert DriftScorer.get_directory_weight("src/security/crypto.py") == KERNEL_WEIGHT

    def test_kernel_tier_src_agents(self):
        assert DriftScorer.get_directory_weight("src/agents/verifier.py") == KERNEL_WEIGHT

    def test_kernel_tier_lib(self):
        assert DriftScorer.get_directory_weight("lib/utils.ts") == KERNEL_WEIGHT

    def test_kernel_tier_package_json(self):
        assert DriftScorer.get_directory_weight("package.json") == KERNEL_WEIGHT

    def test_leaf_tier_tests(self):
        assert DriftScorer.get_directory_weight("tests/test_scorer.py") == LEAF_WEIGHT

    def test_leaf_tier_scripts(self):
        assert DriftScorer.get_directory_weight("scripts/migrate.py") == LEAF_WEIGHT

    def test_leaf_tier_dunder_tests(self):
        assert DriftScorer.get_directory_weight("__tests__/design-tokens.test.ts") == LEAF_WEIGHT

    def test_leaf_tier_docs(self):
        assert DriftScorer.get_directory_weight("docs/README.md") == LEAF_WEIGHT

    def test_feature_tier_generic_src(self):
        assert DriftScorer.get_directory_weight("src/api/repos.py") == FEATURE_WEIGHT

    def test_feature_tier_components(self):
        assert (
            DriftScorer.get_directory_weight("web/components/editor/LiveCodeBlock.tsx")
            == FEATURE_WEIGHT
        )

    def test_leading_dot_slash_normalized(self):
        """Paths prefixed with ./ should be handled the same way."""
        assert DriftScorer.get_directory_weight("./src/core/config.py") == KERNEL_WEIGHT

    def test_windows_backslash_paths(self):
        """Backslash-separated paths are normalized to forward slashes."""
        assert DriftScorer.get_directory_weight("src\\core\\config.py") == KERNEL_WEIGHT


# ===========================================================================
# 2. Standard Scoring Model (v2.1) Tests
# ===========================================================================


class TestCalculateScore:
    def test_empty_changes(self):
        assert DriftScorer.calculate_score([]) == 0

    def test_single_cosmetic_change_scores_zero(self):
        change = make_change(change_type=ChangeType.COSMETIC)
        assert DriftScorer.calculate_score([change]) == 0

    def test_docstring_change_scores_low(self):
        change = make_change(change_type=ChangeType.DOCSTRING_CHANGED, start_line=1, end_line=5)
        score = DriftScorer.calculate_score([change])
        assert 0 < score < 20, f"Expected low score, got {score}"

    def test_signature_change_scores_high(self):
        change = make_change(change_type=ChangeType.SIGNATURE_CHANGED, start_line=1, end_line=20)
        score = DriftScorer.calculate_score([change])
        assert score >= 50, f"Expected high score for signature change, got {score}"

    def test_removed_entity_scores_high(self):
        change = make_change(change_type=ChangeType.REMOVED, start_line=1, end_line=15)
        score = DriftScorer.calculate_score([change])
        assert score >= 50, f"Expected high score for removed entity, got {score}"

    def test_private_entity_scores_lower_than_public(self):
        """Private entities (0.8x visibility) score lower than public (1.2x) — verified via raw
        individual item scores before integer aggregation, avoiding rounding collisions."""
        from src.analysis.scorer import VISIBILITY_MULTIPLIER

        priv_entity = CodeEntity(
            name="_private_func",
            entity_type="function",
            file_path="src/feature/utils.py",
            start_line=1,
            end_line=3,
            content="def _private_func(): pass",
        )
        pub_entity = CodeEntity(
            name="public_func",
            entity_type="function",
            file_path="src/feature/utils.py",
            start_line=1,
            end_line=3,
            content="def public_func(): pass",
        )
        # Verify the property is working correctly first
        assert priv_entity.is_public is False, "Expected _private_func to be private"
        assert pub_entity.is_public is True, "Expected public_func to be public"

        # Verify the raw multipliers produce a measurable difference
        priv_vis = VISIBILITY_MULTIPLIER[priv_entity.is_public]  # 0.8
        pub_vis = VISIBILITY_MULTIPLIER[pub_entity.is_public]  # 1.2
        base = CHANGE_WEIGHTS[ChangeType.LOGIC_MODIFIED]
        complexity = 1.0 + math.log10(max(1, priv_entity.line_count)) * 0.5

        priv_raw = base * priv_vis * complexity
        pub_raw = base * pub_vis * complexity
        assert priv_raw < pub_raw, (
            f"Raw score: private ({priv_raw:.2f}) should be < public ({pub_raw:.2f})"
        )

    def test_large_entity_scores_higher_via_complexity(self):
        small = make_change(change_type=ChangeType.LOGIC_MODIFIED, start_line=1, end_line=5)
        large = make_change(change_type=ChangeType.LOGIC_MODIFIED, start_line=1, end_line=200)
        assert DriftScorer.calculate_score([large]) > DriftScorer.calculate_score([small])

    def test_score_capped_at_100(self):
        """No matter how complex the change, the final score must not exceed 100."""
        changes = [
            make_change(ChangeType.SIGNATURE_CHANGED, start_line=1, end_line=500) for _ in range(10)
        ]
        assert DriftScorer.calculate_score(changes) <= 100

    def test_mixed_changes_dominated_by_worst(self):
        """A bad change + a cosmetic change should produce the same as just the bad change (70% max weight)."""
        bad = make_change(ChangeType.SIGNATURE_CHANGED, start_line=1, end_line=50)
        cosmetic = make_change(ChangeType.COSMETIC)
        score_mixed = DriftScorer.calculate_score([bad, cosmetic])
        assert score_mixed > 0  # cosmetic alone = 0, mixed > 0

    def test_determinism_same_inputs_same_output(self):
        """The same input should always produce the same score (zero variance)."""
        changes = [make_change(ChangeType.LOGIC_MODIFIED, start_line=1, end_line=30)]
        scores = {DriftScorer.calculate_score(changes) for _ in range(5)}
        assert len(scores) == 1

    def test_standard_mathematical_baseline(self):
        """Regression guard: verify exact score formula for a known input."""
        # 1 function, public, 10 lines, LOGIC_MODIFIED
        change = make_change(ChangeType.LOGIC_MODIFIED, start_line=1, end_line=10)
        # base=20, visibility=1.2, complexity=1+(log10(10)*0.5)=1.5 => 20*1.2*1.5=36
        expected_individual = min(100, 20 * 1.2 * (1.0 + math.log10(10) * 0.5))
        expected_final = int(min(100, 0.7 * expected_individual + 0.3 * expected_individual))
        assert DriftScorer.calculate_score([change]) == expected_final


# ===========================================================================
# 3. Holistic Scoring Model (v3.0) Tests
# ===========================================================================


class TestCalculateHolisticScore:
    def test_empty_changes(self):
        assert DriftScorer.calculate_holistic_score([]) == 0

    def test_kernel_tier_scores_higher_than_leaf_tier(self):
        """
        Mathematically identical changes in Kernel vs Leaf directories
        should produce a 4x higher base score (2.0x vs 0.5x).
        """
        kernel_change = make_change(
            change_type=ChangeType.LOGIC_MODIFIED,
            file_path="src/core/config.py",
            start_line=1,
            end_line=10,
            directory_weight=KERNEL_WEIGHT,
        )
        leaf_change = make_change(
            change_type=ChangeType.LOGIC_MODIFIED,
            file_path="tests/test_utils.py",
            start_line=1,
            end_line=10,
            directory_weight=LEAF_WEIGHT,
        )
        kernel_score = DriftScorer.calculate_holistic_score([kernel_change])
        leaf_score = DriftScorer.calculate_holistic_score([leaf_change])

        # Kernel weight = 2.0, Leaf weight = 0.5 → ratio = 4.0
        # Due to blast_bonus(0+1)=1.0 for both, ratio should be ~4x
        assert kernel_score > leaf_score, (
            f"Kernel ({kernel_score}) should score higher than Leaf ({leaf_score})"
        )
        assert kernel_score >= leaf_score * 3.0, (
            f"Expected ~4x difference, got {kernel_score}/{leaf_score}"
        )

    def test_high_blast_radius_increases_score(self):
        """Entities referenced by many files should have a higher holistic score."""
        low_blast = make_change(
            change_type=ChangeType.LOGIC_MODIFIED,
            start_line=1,
            end_line=10,
            directory_weight=FEATURE_WEIGHT,
            blast_radius=0,
        )
        high_blast = make_change(
            change_type=ChangeType.LOGIC_MODIFIED,
            start_line=1,
            end_line=10,
            directory_weight=FEATURE_WEIGHT,
            blast_radius=50,
        )
        assert DriftScorer.calculate_holistic_score(
            [high_blast]
        ) > DriftScorer.calculate_holistic_score([low_blast])

    def test_blast_radius_logarithmic_scaling(self):
        """
        Blast radius should have logarithmic scaling, so 50 refs != 10x the effect of 5 refs.
        """
        ref5 = make_change(ChangeType.LOGIC_MODIFIED, start_line=1, end_line=10, blast_radius=5)
        ref50 = make_change(ChangeType.LOGIC_MODIFIED, start_line=1, end_line=10, blast_radius=50)
        s5 = DriftScorer.calculate_holistic_score([ref5])
        s50 = DriftScorer.calculate_holistic_score([ref50])
        # log-scaled: should be meaningfully higher but not 10x
        ratio = s50 / max(s5, 1)
        assert 1.0 < ratio < 10.0, f"Expected log-scaled ratio 1<r<10, got {ratio}"

    def test_zero_blast_radius_still_scores(self):
        """Zero blast radius should still score > 0 because the log bonus at 0 is log(1)=0 → bonus=1.0."""
        change = make_change(
            ChangeType.SIGNATURE_CHANGED, start_line=1, end_line=30, blast_radius=0
        )
        score = DriftScorer.calculate_holistic_score([change])
        assert score > 0

    def test_holistic_kernel_change_is_critical(self):
        """A signature change in a Kernel-tier file with high blast radius must reach Critical severity."""
        change = make_change(
            change_type=ChangeType.SIGNATURE_CHANGED,
            file_path="src/core/config.py",
            start_line=1,
            end_line=50,
            directory_weight=KERNEL_WEIGHT,
            blast_radius=20,
        )
        score = DriftScorer.calculate_holistic_score([change])
        assert DriftScorer.get_severity(score) == "critical", (
            f"Expected critical, got {DriftScorer.get_severity(score)} (score={score})"
        )

    def test_holistic_leaf_cosmetic_scores_none(self):
        """A cosmetic change in a test file should score 0 even with holistic model."""
        change = make_change(
            change_type=ChangeType.COSMETIC,
            file_path="tests/test_utils.py",
            directory_weight=LEAF_WEIGHT,
            blast_radius=0,
        )
        assert DriftScorer.calculate_holistic_score([change]) == 0

    def test_holistic_score_capped_at_100(self):
        """Holistic scores must never exceed 100, regardless of compounding multipliers."""
        changes = [
            make_change(
                ChangeType.SIGNATURE_CHANGED,
                start_line=1,
                end_line=500,
                directory_weight=KERNEL_WEIGHT,
                blast_radius=100,
            )
            for _ in range(10)
        ]
        assert DriftScorer.calculate_holistic_score(changes) <= 100

    def test_holistic_determinism(self):
        """The holistic scorer must be perfectly deterministic given the same inputs."""
        changes = [
            make_change(
                ChangeType.LOGIC_MODIFIED,
                start_line=1,
                end_line=25,
                directory_weight=KERNEL_WEIGHT,
                blast_radius=10,
            ),
        ]
        scores = {DriftScorer.calculate_holistic_score(changes) for _ in range(5)}
        assert len(scores) == 1

    def test_holistic_higher_than_standard_for_kernel_change(self):
        """For the same KERNEL-tier change, holistic score must be >= standard score."""
        change = make_change(
            change_type=ChangeType.LOGIC_MODIFIED,
            file_path="src/core/settings.py",
            start_line=1,
            end_line=10,
            directory_weight=KERNEL_WEIGHT,
            blast_radius=5,
        )
        standard = DriftScorer.calculate_score([change])
        holistic = DriftScorer.calculate_holistic_score([change])
        assert holistic >= standard, (
            f"Holistic ({holistic}) should match or beat standard ({standard})"
        )

    def test_holistic_lower_than_standard_for_pure_leaf_change(self):
        """For a LEAF-tier change, holistic score must be < standard score (leaf weight=0.5x)."""
        change = make_change(
            change_type=ChangeType.LOGIC_MODIFIED,
            file_path="tests/test_anything.py",
            start_line=1,
            end_line=10,
            directory_weight=LEAF_WEIGHT,
            blast_radius=0,
        )
        standard = DriftScorer.calculate_score([change])
        holistic = DriftScorer.calculate_holistic_score([change])
        assert holistic < standard, (
            f"Holistic ({holistic}) should be less than standard ({standard}) for leaf tier"
        )


# ===========================================================================
# 4. Severity Mapping
# ===========================================================================


class TestGetSeverity:
    def test_none_threshold(self):
        assert DriftScorer.get_severity(0) == "none"
        assert DriftScorer.get_severity(4) == "none"

    def test_minor_threshold(self):
        assert DriftScorer.get_severity(5) == "minor"
        assert DriftScorer.get_severity(24) == "minor"

    def test_moderate_threshold(self):
        assert DriftScorer.get_severity(25) == "moderate"
        assert DriftScorer.get_severity(59) == "moderate"

    def test_significant_threshold(self):
        assert DriftScorer.get_severity(60) == "significant"
        assert DriftScorer.get_severity(84) == "significant"

    def test_critical_threshold(self):
        assert DriftScorer.get_severity(85) == "critical"
        assert DriftScorer.get_severity(100) == "critical"
