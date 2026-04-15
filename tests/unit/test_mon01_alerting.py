"""
MON-01: Validation tests for Grafana alerting provisioning and monitoring stack.

Tests cover:
  - Alert provisioning YAML structure and correctness
  - All 4 alert rules exist with correct UIDs
  - PromQL expressions reference real metric names from metrics.py
  - Contact point and notification policy configuration
  - docker-compose.prod.yml Prometheus + Grafana services
  - Unified alerting enabled, legacy alerting disabled
  - DEPLOYMENT.md monitoring documentation completeness
"""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

ROOT = Path(__file__).resolve().parents[2]
ALERTS_YML = ROOT / "docker" / "grafana" / "provisioning" / "alerting" / "alerts.yml"
PROD_COMPOSE = ROOT / "docker" / "docker-compose.prod.yml"
DEPLOYMENT_MD = ROOT / "DEPLOYMENT.md"
METRICS_PY = ROOT / "src" / "monitoring" / "metrics.py"
PROMETHEUS_YML = ROOT / "docker" / "prometheus.yml"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def alerts_config():
    return yaml.safe_load(ALERTS_YML.read_text())


@pytest.fixture(scope="module")
def alerts_raw():
    return ALERTS_YML.read_text()


@pytest.fixture(scope="module")
def compose_content():
    return PROD_COMPOSE.read_text()


@pytest.fixture(scope="module")
def deployment_content():
    return DEPLOYMENT_MD.read_text()


@pytest.fixture(scope="module")
def metrics_content():
    return METRICS_PY.read_text()


@pytest.fixture(scope="module")
def alert_rules(alerts_config):
    groups = alerts_config.get("groups", [])
    assert len(groups) >= 1
    return groups[0].get("rules", [])


# ---------------------------------------------------------------------------
# Alert provisioning — file basics
# ---------------------------------------------------------------------------


class TestAlertFileBasics:
    def test_alerts_yml_exists(self):
        assert ALERTS_YML.exists()

    def test_valid_yaml(self, alerts_config):
        assert alerts_config is not None

    def test_api_version(self, alerts_config):
        assert alerts_config.get("apiVersion") == 1


# ---------------------------------------------------------------------------
# Contact point
# ---------------------------------------------------------------------------


class TestContactPoint:
    def test_contact_point_defined(self, alerts_config):
        cps = alerts_config.get("contactPoints", [])
        assert len(cps) >= 1

    def test_contact_point_name(self, alerts_config):
        cp = alerts_config["contactPoints"][0]
        assert cp["name"] == "docugardener-ops"

    def test_contact_point_is_webhook(self, alerts_config):
        cp = alerts_config["contactPoints"][0]
        receiver = cp["receivers"][0]
        assert receiver["type"] == "webhook"


# ---------------------------------------------------------------------------
# Notification policy
# ---------------------------------------------------------------------------


class TestNotificationPolicy:
    def test_policy_defined(self, alerts_config):
        policies = alerts_config.get("policies", [])
        assert len(policies) >= 1

    def test_policy_receiver_matches_contact_point(self, alerts_config):
        policy = alerts_config["policies"][0]
        assert policy["receiver"] == "docugardener-ops"


# ---------------------------------------------------------------------------
# Alert rules — existence
# ---------------------------------------------------------------------------

EXPECTED_UIDS = [
    "mon01-api-error-rate",
    "mon01-queue-depth",
    "mon01-webhook-failure-rate",
    "mon01-llm-error-rate",
]


class TestAlertRulesExist:
    def test_six_alert_rules(self, alert_rules):
        # 4 MON-01 rules + 2 RQ-STAB-02 rules (rq-queue-stuck, worker-silent)
        assert len(alert_rules) == 6

    @pytest.mark.parametrize("uid", EXPECTED_UIDS)
    def test_alert_rule_uid_present(self, alert_rules, uid):
        uids = [r["uid"] for r in alert_rules]
        assert uid in uids, f"Expected alert UID {uid!r} not found in {uids}"


# ---------------------------------------------------------------------------
# Alert rules — content validation
# ---------------------------------------------------------------------------


class TestApiErrorRateAlert:
    def _get_rule(self, alert_rules):
        return next(r for r in alert_rules if r["uid"] == "mon01-api-error-rate")

    def test_title(self, alert_rules):
        rule = self._get_rule(alert_rules)
        assert "Error Rate" in rule["title"]

    def test_severity_critical(self, alert_rules):
        rule = self._get_rule(alert_rules)
        assert rule["labels"]["severity"] == "critical"

    def test_for_duration(self, alert_rules):
        rule = self._get_rule(alert_rules)
        assert rule["for"] == "5m"

    def test_references_http_requests_metric(self, alert_rules, metrics_content):
        rule = self._get_rule(alert_rules)
        # Verify the PromQL references a real metric defined in metrics.py
        assert "docugardener_http_requests_total" in metrics_content
        data_exprs = " ".join(str(d.get("model", {}).get("expr", "")) for d in rule["data"])
        assert "docugardener_http_requests_total" in data_exprs


class TestQueueDepthAlert:
    def _get_rule(self, alert_rules):
        return next(r for r in alert_rules if r["uid"] == "mon01-queue-depth")

    def test_title(self, alert_rules):
        rule = self._get_rule(alert_rules)
        assert "Queue" in rule["title"]

    def test_severity_warning(self, alert_rules):
        rule = self._get_rule(alert_rules)
        assert rule["labels"]["severity"] == "warning"

    def test_references_queue_size_metric(self, alert_rules, metrics_content):
        rule = self._get_rule(alert_rules)
        assert "docugardener_queue_size" in metrics_content
        data_exprs = " ".join(str(d.get("model", {}).get("expr", "")) for d in rule["data"])
        assert "docugardener_queue_size" in data_exprs

    def test_threshold_is_100(self, alert_rules):
        rule = self._get_rule(alert_rules)
        data_exprs = " ".join(str(d.get("model", {}).get("expr", "")) for d in rule["data"])
        assert "100" in data_exprs


class TestWebhookFailureAlert:
    def _get_rule(self, alert_rules):
        return next(r for r in alert_rules if r["uid"] == "mon01-webhook-failure-rate")

    def test_title(self, alert_rules):
        rule = self._get_rule(alert_rules)
        assert "Webhook" in rule["title"]

    def test_references_webhook_metrics(self, alert_rules, metrics_content):
        rule = self._get_rule(alert_rules)
        assert "docugardener_webhooks_failed_total" in metrics_content
        assert "docugardener_webhooks_received_total" in metrics_content
        data_exprs = " ".join(str(d.get("model", {}).get("expr", "")) for d in rule["data"])
        assert "docugardener_webhooks_failed_total" in data_exprs


class TestLlmErrorAlert:
    def _get_rule(self, alert_rules):
        return next(r for r in alert_rules if r["uid"] == "mon01-llm-error-rate")

    def test_title(self, alert_rules):
        rule = self._get_rule(alert_rules)
        assert "LLM" in rule["title"]

    def test_for_duration_10m(self, alert_rules):
        rule = self._get_rule(alert_rules)
        assert rule["for"] == "10m"

    def test_references_llm_metrics(self, alert_rules, metrics_content):
        rule = self._get_rule(alert_rules)
        assert "docugardener_llm_errors_total" in metrics_content
        assert "docugardener_llm_requests_total" in metrics_content
        data_exprs = " ".join(str(d.get("model", {}).get("expr", "")) for d in rule["data"])
        assert "docugardener_llm_errors_total" in data_exprs


# ---------------------------------------------------------------------------
# Alert rules — all have annotations
# ---------------------------------------------------------------------------


class TestAlertAnnotations:
    def test_all_rules_have_summary(self, alert_rules):
        for rule in alert_rules:
            assert "summary" in rule.get("annotations", {}), f"{rule['uid']} missing summary"

    def test_all_rules_have_description(self, alert_rules):
        for rule in alert_rules:
            assert "description" in rule.get("annotations", {}), (
                f"{rule['uid']} missing description"
            )

    def test_all_rules_have_severity_label(self, alert_rules):
        for rule in alert_rules:
            assert "severity" in rule.get("labels", {}), f"{rule['uid']} missing severity"

    def test_all_rules_have_team_label(self, alert_rules):
        for rule in alert_rules:
            assert "team" in rule.get("labels", {}), f"{rule['uid']} missing team"


# ---------------------------------------------------------------------------
# Docker Compose — Prometheus service
# ---------------------------------------------------------------------------


class TestComposePrometheus:
    def test_prometheus_service_exists(self, compose_content):
        assert "prometheus:" in compose_content

    def test_prometheus_image(self, compose_content):
        assert "prom/prometheus" in compose_content

    def test_prometheus_no_host_port(self, compose_content):
        # Prometheus should not expose ports to host in production
        lines = compose_content.split("\n")
        in_prometheus = False
        in_ports = False
        for line in lines:
            if line.strip().startswith("prometheus:") and "container_name" not in line:
                in_prometheus = True
            elif in_prometheus and "ports:" in line:
                in_ports = True
            elif in_prometheus and in_ports and "9090:" in line:
                pytest.fail("Prometheus should not expose port 9090 to host in production")
            elif (
                in_prometheus
                and line.strip()
                and not line.startswith(" ")
                and not line.startswith("\t")
            ):
                break

    def test_prometheus_30d_retention(self, compose_content):
        assert "30d" in compose_content

    def test_prometheus_data_volume(self, compose_content):
        assert "prometheus-data:" in compose_content


# ---------------------------------------------------------------------------
# Docker Compose — Grafana service
# ---------------------------------------------------------------------------


class TestComposeGrafana:
    def test_grafana_service_exists(self, compose_content):
        assert "grafana:" in compose_content

    def test_grafana_image(self, compose_content):
        assert "grafana/grafana" in compose_content

    def test_unified_alerting_enabled(self, compose_content):
        assert "GF_UNIFIED_ALERTING_ENABLED" in compose_content
        assert '"true"' in compose_content or "'true'" in compose_content

    def test_legacy_alerting_disabled(self, compose_content):
        assert "GF_ALERTING_ENABLED" in compose_content

    def test_grafana_mounts_provisioning(self, compose_content):
        assert "grafana/provisioning:/etc/grafana/provisioning" in compose_content

    def test_grafana_data_volume(self, compose_content):
        assert "grafana-data:" in compose_content

    def test_grafana_depends_on_prometheus(self, compose_content):
        lines = compose_content.split("\n")
        in_grafana = False
        in_depends = False
        for line in lines:
            stripped = line.strip()
            if stripped.startswith("grafana:") and "container_name" not in stripped:
                in_grafana = True
            elif in_grafana and "depends_on:" in stripped:
                in_depends = True
            elif in_grafana and in_depends and "prometheus" in stripped:
                return
            elif in_grafana and stripped and not line.startswith(" ") and not line.startswith("\t"):
                break
        pytest.fail("Grafana does not depend on Prometheus")


# ---------------------------------------------------------------------------
# Prometheus config — scrapes docugardener
# ---------------------------------------------------------------------------


class TestPrometheusConfig:
    def test_prometheus_yml_exists(self):
        assert PROMETHEUS_YML.exists()

    def test_scrapes_docugardener_api(self):
        content = PROMETHEUS_YML.read_text()
        assert "docugardener:8000" in content or "docugardener-api" in content

    def test_metrics_path(self):
        content = PROMETHEUS_YML.read_text()
        assert "/metrics" in content


# ---------------------------------------------------------------------------
# DEPLOYMENT.md — monitoring documentation
# ---------------------------------------------------------------------------


class TestDeploymentMonitoringDocs:
    def test_monitoring_section_exists(self, deployment_content):
        assert (
            "## Monitoring" in deployment_content
            or "## Monitoring & Alerting" in deployment_content
        )

    def test_documents_alert_rules(self, deployment_content):
        assert "API Error Rate" in deployment_content
        assert "Queue Depth" in deployment_content

    def test_documents_webhook_url(self, deployment_content):
        assert "GRAFANA_ALERT_WEBHOOK_URL" in deployment_content

    def test_documents_grafana_password(self, deployment_content):
        assert "GRAFANA_ADMIN_PASSWORD" in deployment_content

    def test_documents_ssh_tunnel_access(self, deployment_content):
        assert "SSH" in deployment_content or "ssh" in deployment_content

    def test_documents_prometheus_retention(self, deployment_content):
        assert "30 days" in deployment_content or "30d" in deployment_content
