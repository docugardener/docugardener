# SPDX-License-Identifier: AGPL-3.0-or-later
"""
SCAL-03: Helm chart worker command fix + KEDA ScaledObject template tests.

Covers:
  - Worker deployment command must include 'high' queue before 'default'
  - keda-scaledobject.yaml template exists and is structurally correct
  - values.yaml has keda section with safe defaults (enabled: false)
"""

import pathlib

import yaml

HELM_ROOT = pathlib.Path(__file__).parents[2] / "helm" / "docugardener"
TEMPLATES_DIR = HELM_ROOT / "templates"


def _read(path: pathlib.Path) -> str:
    return path.read_text()


def _load_yaml(path: pathlib.Path) -> dict:
    with open(path) as f:
        return yaml.safe_load(f)


# ─────────────────────────────────────────────────────────────────────────────
# Worker command — must include 'high' queue
# ─────────────────────────────────────────────────────────────────────────────


class TestWorkerCommandIncludesHighQueue:
    """
    SCAL-03 Fix-1: Worker deployment command must include 'high' queue before
    'default' so fix_pr and ignore_drift jobs are not starved behind analysis jobs.
    """

    def test_worker_command_contains_high_queue(self):
        text = _read(TEMPLATES_DIR / "deployment-worker.yaml")
        assert '"high"' in text, (
            "deployment-worker.yaml command must include 'high' queue — "
            "fix/ignore jobs route to rq:queue:high and will never be consumed "
            "without it."
        )

    def test_worker_command_high_before_default(self):
        text = _read(TEMPLATES_DIR / "deployment-worker.yaml")
        high_pos = text.find('"high"')
        default_pos = text.find('"default"')
        assert high_pos != -1, "command missing 'high' queue"
        assert default_pos != -1, "command missing 'default' queue"
        assert high_pos < default_pos, (
            "'high' must appear before 'default' in worker command "
            "(RQ consumes queues left-to-right with priority)."
        )


# ─────────────────────────────────────────────────────────────────────────────
# KEDA ScaledObject template
# ─────────────────────────────────────────────────────────────────────────────


class TestKedaScaledObjectTemplate:
    """SCAL-03 Fix-2: keda-scaledobject.yaml must exist and be structurally correct."""

    def test_keda_template_file_exists(self):
        assert (TEMPLATES_DIR / "keda-scaledobject.yaml").exists(), (
            "helm/docugardener/templates/keda-scaledobject.yaml is missing — "
            "run SCAL-03 to create it."
        )

    def test_keda_template_gated_on_keda_enabled(self):
        """Template must be wrapped in a {{- if .Values.keda.enabled }} guard."""
        text = _read(TEMPLATES_DIR / "keda-scaledobject.yaml")
        assert "keda.enabled" in text, (
            "keda-scaledobject.yaml must be gated on .Values.keda.enabled — "
            "it must not render when keda is disabled (default)."
        )

    def test_keda_template_api_version(self):
        text = _read(TEMPLATES_DIR / "keda-scaledobject.yaml")
        assert "keda.sh" in text, "ScaledObject must use keda.sh apiVersion"

    def test_keda_template_targets_worker(self):
        text = _read(TEMPLATES_DIR / "keda-scaledobject.yaml")
        assert "ScaledObject" in text
        assert "worker" in text.lower()

    def test_keda_template_has_redis_triggers(self):
        text = _read(TEMPLATES_DIR / "keda-scaledobject.yaml")
        assert "redis" in text.lower(), "ScaledObject must have Redis triggers"

    def test_keda_template_monitors_both_queues(self):
        text = _read(TEMPLATES_DIR / "keda-scaledobject.yaml")
        assert "rq:queue:default" in text, "must monitor default queue"
        assert "rq:queue:high" in text, "must monitor high queue"

    def test_keda_template_has_list_length(self):
        text = _read(TEMPLATES_DIR / "keda-scaledobject.yaml")
        assert "listLength" in text, (
            "Redis trigger must specify listLength (queue depth threshold for scale-up)"
        )

    def test_keda_template_has_replica_bounds(self):
        text = _read(TEMPLATES_DIR / "keda-scaledobject.yaml")
        assert "minReplicaCount" in text
        assert "maxReplicaCount" in text


# ─────────────────────────────────────────────────────────────────────────────
# values.yaml — keda section with safe defaults
# ─────────────────────────────────────────────────────────────────────────────


class TestKedaValuesDefaults:
    """keda section must exist in values.yaml with opt-in=false defaults."""

    def setup_method(self):
        self.values = _load_yaml(HELM_ROOT / "values.yaml")

    def test_keda_section_exists(self):
        assert "keda" in self.values, "values.yaml must have a 'keda' top-level section"

    def test_keda_enabled_defaults_false(self):
        assert self.values["keda"]["enabled"] is False, (
            "keda.enabled must default to false — KEDA ScaledObject is opt-in "
            "and requires the KEDA operator to be installed in the cluster."
        )

    def test_keda_redis_address_defaults_empty(self):
        assert self.values["keda"].get("redisAddress", "") == "", (
            "keda.redisAddress must default to empty string"
        )
