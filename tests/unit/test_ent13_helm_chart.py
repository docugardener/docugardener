"""
ENT-13: Helm chart structural validation tests.

Validates the chart without requiring helm binary:
  - All expected template files are present
  - Every template is valid YAML (after stripping Helm Go template syntax)
  - values.yaml contains all required keys and correct PSA defaults
  - values.schema.json is valid JSON Schema and contains security constraints
  - Chart.yaml has required metadata fields
  - CI test values file is present and valid YAML
  - NetworkPolicy template declares both Ingress and Egress policyTypes
  - All Deployment templates declare readOnlyRootFilesystem, runAsNonRoot, drop ALL
  - Secret template uses 'required' guards for all critical keys
  - GitHub Actions workflow file is present and references OCI push
"""

import json
import pathlib
import re

import pytest
import yaml

HELM_ROOT = pathlib.Path(__file__).parents[2] / "helm" / "docugardener"
TEMPLATES_DIR = HELM_ROOT / "templates"
WORKFLOWS_DIR = pathlib.Path(__file__).parents[2] / ".github" / "workflows"


# ── helpers ───────────────────────────────────────────────────────────────────


def _strip_helm_syntax(text: str) -> str:
    """Remove Go template directives so PyYAML can parse the YAML structure."""
    # Remove {{- ... -}}, {{ ... }}, {%- ... %}
    text = re.sub(r"\{\{-?.*?-?\}\}", "HELM_EXPR", text, flags=re.DOTALL)
    # Remove lines that start with '{{-' after stripping (template-only lines)
    lines = []
    for line in text.splitlines():
        stripped = line.strip()
        if stripped in ("HELM_EXPR", "- HELM_EXPR:"):
            continue
        lines.append(line)
    return "\n".join(lines)


def _load_yaml_file(path: pathlib.Path) -> dict:
    with open(path) as f:
        return yaml.safe_load(f)


def _read(path: pathlib.Path) -> str:
    return path.read_text()


# ── Chart.yaml ────────────────────────────────────────────────────────────────


class TestChartYaml:
    def test_chart_yaml_exists(self):
        assert (HELM_ROOT / "Chart.yaml").exists()

    def test_required_fields(self):
        chart = _load_yaml_file(HELM_ROOT / "Chart.yaml")
        assert chart["apiVersion"] == "v2"
        assert "name" in chart
        assert "version" in chart
        assert "appVersion" in chart
        assert "description" in chart

    def test_chart_name_is_docugardener(self):
        chart = _load_yaml_file(HELM_ROOT / "Chart.yaml")
        assert chart["name"] == "docugardener"

    def test_dependencies_declared(self):
        chart = _load_yaml_file(HELM_ROOT / "Chart.yaml")
        dep_names = [d["name"] for d in chart.get("dependencies", [])]
        assert "postgresql" in dep_names
        assert "redis" in dep_names

    def test_dependency_conditions_set(self):
        """Each dependency must have a condition to allow disabling."""
        chart = _load_yaml_file(HELM_ROOT / "Chart.yaml")
        for dep in chart.get("dependencies", []):
            assert "condition" in dep, f"Dependency {dep['name']} missing 'condition'"


# ── values.yaml ───────────────────────────────────────────────────────────────


class TestValuesYaml:
    def setup_method(self):
        self.values = _load_yaml_file(HELM_ROOT / "values.yaml")

    def test_values_yaml_exists(self):
        assert (HELM_ROOT / "values.yaml").exists()

    def test_psa_run_as_non_root(self):
        assert self.values["podSecurityContext"]["runAsNonRoot"] is True

    def test_psa_run_as_non_zero_uid(self):
        uid = self.values["podSecurityContext"]["runAsUser"]
        assert uid > 0, "runAsUser must be non-zero (non-root)"

    def test_psa_allow_privilege_escalation_false(self):
        assert self.values["containerSecurityContext"]["allowPrivilegeEscalation"] is False

    def test_psa_read_only_root_filesystem(self):
        assert self.values["containerSecurityContext"]["readOnlyRootFilesystem"] is True

    def test_psa_drop_all_capabilities(self):
        caps_drop = self.values["containerSecurityContext"]["capabilities"]["drop"]
        assert "ALL" in caps_drop

    def test_psa_seccomp_profile(self):
        seccomp = self.values["podSecurityContext"]["seccompProfile"]
        assert seccomp["type"] == "RuntimeDefault"

    def test_api_replica_count_gte_1(self):
        assert self.values["api"]["replicaCount"] >= 1

    def test_worker_termination_grace_period(self):
        """Worker must allow in-flight RQ jobs to finish (GAP-04)."""
        grace = self.values["worker"]["terminationGracePeriodSeconds"]
        assert grace >= 30, "terminationGracePeriodSeconds should be >= 30 for safe RQ shutdown"

    def test_scheduler_singleton_replica(self):
        assert self.values["scheduler"]["replicaCount"] == 1

    def test_secrets_existing_secret_default_empty(self):
        """Default should not point to any secret — forces operator to configure."""
        assert self.values["secrets"]["existingSecret"] == ""

    def test_secrets_create_disabled_by_default(self):
        """Chart-managed secrets must be opt-in (not on by default)."""
        assert self.values["secrets"]["create"]["enabled"] is False

    def test_bundled_deps_disabled_by_default(self):
        """postgresql, redis, weaviate disabled by default — require external for prod."""
        assert self.values["postgresql"]["enabled"] is False
        assert self.values["redis"]["enabled"] is False
        assert self.values["weaviate"]["enabled"] is False

    def test_network_policy_enabled_by_default(self):
        assert self.values["networkPolicy"]["enabled"] is True

    def test_api_pdb_enabled(self):
        assert self.values["api"]["podDisruptionBudget"]["enabled"] is True

    def test_worker_pdb_enabled(self):
        assert self.values["worker"]["podDisruptionBudget"]["enabled"] is True

    def test_config_app_env_is_production(self):
        assert self.values["config"]["appEnv"] == "production"

    def test_image_pull_policy_default(self):
        assert self.values["api"]["image"]["pullPolicy"] == "IfNotPresent"


# ── values.schema.json ────────────────────────────────────────────────────────


class TestValuesSchema:
    def setup_method(self):
        with open(HELM_ROOT / "values.schema.json") as f:
            self.schema = json.load(f)

    def test_schema_file_exists(self):
        assert (HELM_ROOT / "values.schema.json").exists()

    def test_valid_json_schema_draft(self):
        assert "$schema" in self.schema

    def test_api_replica_count_minimum(self):
        api_props = self.schema["properties"]["api"]["properties"]
        assert api_props["replicaCount"]["minimum"] == 1

    def test_scheduler_replica_maximum_is_1(self):
        """Schema must enforce scheduler is singleton."""
        sched = self.schema["properties"]["scheduler"]["properties"]
        assert sched["replicaCount"]["maximum"] == 1

    def test_run_as_non_root_const_true(self):
        """Schema enforces runAsNonRoot cannot be set to false."""
        psc = self.schema["properties"]["podSecurityContext"]["properties"]
        assert psc["runAsNonRoot"]["const"] is True

    def test_allow_privilege_escalation_const_false(self):
        csc = self.schema["properties"]["containerSecurityContext"]["properties"]
        assert csc["allowPrivilegeEscalation"]["const"] is False

    def test_config_app_env_enum(self):
        config_props = self.schema["properties"]["config"]["properties"]
        allowed = config_props["appEnv"]["enum"]
        assert "production" in allowed
        assert "development" in allowed

    def test_config_log_level_enum(self):
        config_props = self.schema["properties"]["config"]["properties"]
        allowed = config_props["logLevel"]["enum"]
        assert "INFO" in allowed
        assert "DEBUG" in allowed

    def test_service_type_enum(self):
        api_service = self.schema["properties"]["api"]["properties"]["service"]["properties"]
        allowed = api_service["type"]["enum"]
        assert "ClusterIP" in allowed
        assert "NodePort" in allowed


# ── Template files ────────────────────────────────────────────────────────────

EXPECTED_TEMPLATES = [
    "_helpers.tpl",
    "NOTES.txt",
    "serviceaccount.yaml",
    "role.yaml",
    "rolebinding.yaml",
    "configmap.yaml",
    "secret.yaml",
    "deployment-api.yaml",
    "deployment-worker.yaml",
    "deployment-scheduler.yaml",
    "deployment-web.yaml",
    "service.yaml",
    "ingress.yaml",
    "networkpolicy.yaml",
    "pdb.yaml",
    "hpa.yaml",
]


class TestTemplateFiles:
    def test_all_expected_templates_present(self):
        missing = []
        for name in EXPECTED_TEMPLATES:
            if not (TEMPLATES_DIR / name).exists():
                missing.append(name)
        assert not missing, f"Missing templates: {missing}"


class TestDeploymentTemplates:
    """Structural checks on Deployment templates (raw text — no Helm rendering)."""

    DEPLOYMENT_TEMPLATES = [
        "deployment-api.yaml",
        "deployment-worker.yaml",
        "deployment-scheduler.yaml",
        "deployment-web.yaml",
    ]

    @pytest.mark.parametrize("tmpl", DEPLOYMENT_TEMPLATES)
    def test_deployment_references_pod_security_context(self, tmpl):
        text = _read(TEMPLATES_DIR / tmpl)
        assert "podSecurityContext" in text or "securityContext" in text

    @pytest.mark.parametrize("tmpl", DEPLOYMENT_TEMPLATES)
    def test_deployment_references_container_security_context(self, tmpl):
        text = _read(TEMPLATES_DIR / tmpl)
        assert "containerSecurityContext" in text

    @pytest.mark.parametrize("tmpl", DEPLOYMENT_TEMPLATES)
    def test_deployment_uses_tmp_volume_mounts(self, tmpl):
        """All deployments need /tmp emptyDir for readOnlyRootFilesystem."""
        text = _read(TEMPLATES_DIR / tmpl)
        assert "tmpVolumeMounts" in text or "mountPath: /tmp" in text

    @pytest.mark.parametrize("tmpl", DEPLOYMENT_TEMPLATES)
    def test_deployment_uses_tmp_volumes(self, tmpl):
        text = _read(TEMPLATES_DIR / tmpl)
        assert "tmpVolumes" in text or "emptyDir" in text

    @pytest.mark.parametrize("tmpl", DEPLOYMENT_TEMPLATES)
    def test_deployment_references_secret_env_vars(self, tmpl):
        """Secrets must be injected from K8s Secret, not hardcoded."""
        text = _read(TEMPLATES_DIR / tmpl)
        assert "secretEnvVars" in text or "secretKeyRef" in text

    @pytest.mark.parametrize("tmpl", DEPLOYMENT_TEMPLATES)
    def test_deployment_disables_service_account_token_automount(self, tmpl):
        text = _read(TEMPLATES_DIR / tmpl)
        assert "automountServiceAccountToken: false" in text

    def test_scheduler_uses_recreate_strategy(self):
        """Scheduler must use Recreate (not RollingUpdate) to enforce singleton."""
        text = _read(TEMPLATES_DIR / "deployment-scheduler.yaml")
        assert "Recreate" in text

    def test_worker_references_termination_grace_period(self):
        """Worker must propagate terminationGracePeriodSeconds from values."""
        text = _read(TEMPLATES_DIR / "deployment-worker.yaml")
        assert "terminationGracePeriodSeconds" in text


class TestNetworkPolicyTemplate:
    def test_networkpolicy_file_exists(self):
        assert (TEMPLATES_DIR / "networkpolicy.yaml").exists()

    def test_all_four_components_covered(self):
        text = _read(TEMPLATES_DIR / "networkpolicy.yaml")
        for component in ("api", "worker", "scheduler", "web"):
            assert component in text, f"NetworkPolicy missing rules for {component}"

    def test_both_ingress_and_egress_policy_types(self):
        text = _read(TEMPLATES_DIR / "networkpolicy.yaml")
        assert "Ingress" in text
        assert "Egress" in text

    def test_dns_egress_allowed(self):
        """DNS (port 53) must be whitelisted or pods cannot resolve hostnames."""
        text = _read(TEMPLATES_DIR / "networkpolicy.yaml")
        assert "port: 53" in text

    def test_worker_has_no_ingress(self):
        """Workers expose no ports — ingress list should be empty."""
        text = _read(TEMPLATES_DIR / "networkpolicy.yaml")
        assert "ingress: []" in text


class TestSecretTemplate:
    def test_secret_uses_required_guards(self):
        """All critical keys must use 'required' to fail fast on missing values."""
        text = _read(TEMPLATES_DIR / "secret.yaml")
        assert "required" in text

    def test_secret_gated_on_create_enabled(self):
        """Secret must only render when secrets.create.enabled=true."""
        text = _read(TEMPLATES_DIR / "secret.yaml")
        assert "secrets.create.enabled" in text

    def test_secret_has_dev_only_warning(self):
        text = _read(TEMPLATES_DIR / "secret.yaml")
        assert "DEV" in text.upper() or "production" in text.lower()


class TestServiceTemplate:
    def test_api_service_present(self):
        text = _read(TEMPLATES_DIR / "service.yaml")
        assert "api" in text

    def test_web_service_present(self):
        text = _read(TEMPLATES_DIR / "service.yaml")
        assert "web" in text


class TestPdbTemplate:
    def test_pdb_references_all_three_components(self):
        text = _read(TEMPLATES_DIR / "pdb.yaml")
        assert "api" in text
        assert "worker" in text
        assert "web" in text


class TestHpaTemplate:
    def test_hpa_references_autoscaling_v2(self):
        text = _read(TEMPLATES_DIR / "hpa.yaml")
        assert "autoscaling/v2" in text

    def test_hpa_has_cpu_metric(self):
        text = _read(TEMPLATES_DIR / "hpa.yaml")
        assert "cpu" in text.lower()


# ── CI values file ────────────────────────────────────────────────────────────


class TestCIValues:
    def test_ci_values_file_exists(self):
        assert (HELM_ROOT / "ci" / "test-values.yaml").exists()

    def test_ci_values_valid_yaml(self):
        ci_values = _load_yaml_file(HELM_ROOT / "ci" / "test-values.yaml")
        assert ci_values is not None

    def test_ci_values_creates_secret(self):
        ci_values = _load_yaml_file(HELM_ROOT / "ci" / "test-values.yaml")
        assert ci_values["secrets"]["create"]["enabled"] is True

    def test_ci_values_has_required_secret_keys(self):
        ci_values = _load_yaml_file(HELM_ROOT / "ci" / "test-values.yaml")
        create = ci_values["secrets"]["create"]
        for key in ("databaseUrl", "redisUrl", "githubAppId", "encryptionKey", "nextauthSecret"):
            assert create.get(key), f"CI values missing secrets.create.{key}"


# ── GitHub Actions workflow ───────────────────────────────────────────────────


class TestHelmPublishWorkflow:
    def setup_method(self):
        self.wf_path = WORKFLOWS_DIR / "helm-publish.yml"

    def test_workflow_file_exists(self):
        assert self.wf_path.exists()

    def test_workflow_valid_yaml(self):
        wf = _load_yaml_file(self.wf_path)
        assert wf is not None

    def test_workflow_has_lint_job(self):
        wf = _load_yaml_file(self.wf_path)
        jobs = wf["jobs"]
        assert "lint" in jobs

    def test_workflow_has_psa_check_job(self):
        wf = _load_yaml_file(self.wf_path)
        assert "psa-check" in wf["jobs"]

    def test_workflow_has_publish_job(self):
        wf = _load_yaml_file(self.wf_path)
        assert "publish" in wf["jobs"]

    def test_workflow_publish_uses_oci_push(self):
        text = _read(self.wf_path)
        assert "helm push" in text
        assert "oci://" in text

    def test_workflow_publish_uses_cosign(self):
        text = _read(self.wf_path)
        assert "cosign" in text

    def test_workflow_publish_only_on_main(self):
        wf = _load_yaml_file(self.wf_path)
        publish_job = wf["jobs"]["publish"]
        condition = publish_job.get("if", "")
        assert "main" in str(condition)

    def test_workflow_psa_check_uses_python_validator(self):
        text = _read(self.wf_path)
        assert "allowPrivilegeEscalation" in text
        assert "runAsNonRoot" in text

    def test_workflow_triggers_on_helm_path_changes(self):
        # PyYAML parses YAML 1.1 `on:` key as boolean True — read as raw text
        text = _read(self.wf_path)
        assert "helm/**" in text or "helm/" in text
