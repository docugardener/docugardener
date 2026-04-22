// SPDX-License-Identifier: AGPL-3.0-or-later

import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Observability — Self-Hosting — DocuGardener Docs",
  description:
    "Prometheus metrics, Grafana dashboards, and alert rules for self-hosted DocuGardener deployments.",
};

export default function ObservabilityPage() {
  return (
    <div className="max-w-3xl mx-auto py-10 px-4">
      <h1 className="text-3xl font-bold text-foreground mb-2">Observability</h1>
      <p className="text-muted-foreground mb-8 text-lg">
        DocuGardener ships with a pre-wired Prometheus + Grafana stack. Production deployments get
        dashboards and alert rules with zero extra setup. Local dev requires a one-line change to
        opt in.
      </p>

      {/* ── What's included ───────────────────────────────────── */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-foreground mb-3">What&apos;s included</h2>
        <ul className="list-disc list-inside space-y-1 text-muted-foreground">
          <li>
            <strong className="text-foreground">Prometheus</strong> — scrapes{" "}
            <code className="bg-muted px-1 py-0.5 rounded text-sm">/metrics</code> on the FastAPI
            backend (port 8000). Metrics are emitted via{" "}
            <code className="bg-muted px-1 py-0.5 rounded text-sm">
              prometheus_fastapi_instrumentator
            </code>{" "}
            plus custom counters and gauges.
          </li>
          <li>
            <strong className="text-foreground">Grafana</strong> — pre-provisioned datasource,
            three dashboards (Overview, LLM Usage, Queue Health), and two alert rules. No manual
            setup needed.
          </li>
          <li>
            <strong className="text-foreground">Provisioning</strong> — datasources, dashboards, and
            alerting rules are loaded automatically from{" "}
            <code className="bg-muted px-1 py-0.5 rounded text-sm">
              docker/grafana/provisioning/
            </code>{" "}
            at container startup.
          </li>
        </ul>
      </section>

      {/* ── Enabling in local dev ─────────────────────────────── */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-foreground mb-3">Enabling in local dev</h2>
        <p className="text-muted-foreground mb-3">
          The Prometheus and Grafana services are commented out in{" "}
          <code className="bg-muted px-1 py-0.5 rounded text-sm">
            docker/docker-compose.yml
          </code>{" "}
          by default to keep the dev environment lightweight. To enable them, uncomment the{" "}
          <code className="bg-muted px-1 py-0.5 rounded text-sm">prometheus</code> and{" "}
          <code className="bg-muted px-1 py-0.5 rounded text-sm">grafana</code> service blocks,
          then restart:
        </p>
        <pre className="bg-muted rounded-lg p-4 text-sm overflow-x-auto mb-3">
          <code>{`# In docker/docker-compose.yml — uncomment these two service blocks:
#   prometheus:
#   grafana:

make dev-up`}</code>
        </pre>
        <p className="text-muted-foreground mb-1">
          Grafana is then available at{" "}
          <code className="bg-muted px-1 py-0.5 rounded text-sm">http://localhost:3004</code>.
        </p>
        <p className="text-muted-foreground text-sm">
          Default credentials:{" "}
          <code className="bg-muted px-1 py-0.5 rounded text-sm">admin / admin</code>. Change the
          password immediately or set{" "}
          <code className="bg-muted px-1 py-0.5 rounded text-sm">GF_SECURITY_ADMIN_PASSWORD</code>{" "}
          in your{" "}
          <code className="bg-muted px-1 py-0.5 rounded text-sm">.env</code> before starting.
        </p>
      </section>

      {/* ── Accessing in production ───────────────────────────── */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-foreground mb-3">Accessing in production</h2>
        <p className="text-muted-foreground mb-3">
          In production (
          <code className="bg-muted px-1 py-0.5 rounded text-sm">
            docker/docker-compose.prod.yml
          </code>
          ) both services are enabled by default. Grafana is intentionally not exposed on a public
          host port — access it through an SSH tunnel:
        </p>
        <pre className="bg-muted rounded-lg p-4 text-sm overflow-x-auto mb-3">
          <code>{`ssh -L 3000:localhost:3000 user@your-vps-ip`}</code>
        </pre>
        <p className="text-muted-foreground mb-3">
          Then open{" "}
          <code className="bg-muted px-1 py-0.5 rounded text-sm">http://localhost:3000</code> in
          your browser.
        </p>
        <p className="text-muted-foreground">
          If you need to expose Grafana publicly (e.g. behind your reverse proxy), set{" "}
          <code className="bg-muted px-1 py-0.5 rounded text-sm">GF_SERVER_ROOT_URL</code> to your
          public URL and add appropriate authentication in front of it. Never expose Grafana without
          authentication.
        </p>
      </section>

      {/* ── Metrics reference ─────────────────────────────────── */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-foreground mb-4">Metrics reference</h2>
        <p className="text-muted-foreground mb-4">
          All custom metrics are exposed in Prometheus format at{" "}
          <code className="bg-muted px-1 py-0.5 rounded text-sm">
            http://&lt;backend&gt;:8000/metrics
          </code>
          . Standard FastAPI request metrics are also included via{" "}
          <code className="bg-muted px-1 py-0.5 rounded text-sm">
            prometheus_fastapi_instrumentator
          </code>
          .
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 pr-4 font-semibold text-foreground">Metric name</th>
                <th className="text-left py-2 pr-4 font-semibold text-foreground">Labels</th>
                <th className="text-left py-2 font-semibold text-foreground">Description</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              <tr className="border-b border-border">
                <td className="py-2 pr-4 align-top">
                  <code className="bg-muted px-1 py-0.5 rounded text-xs">
                    docugardener_webhooks_total
                  </code>
                </td>
                <td className="py-2 pr-4 align-top">
                  <code className="bg-muted px-1 py-0.5 rounded text-xs">event_type</code>,{" "}
                  <code className="bg-muted px-1 py-0.5 rounded text-xs">success</code>
                </td>
                <td className="py-2 align-top">
                  Counter — webhook events received from GitHub, labelled by event type (e.g.{" "}
                  <code className="bg-muted px-1 py-0.5 rounded text-xs">pull_request</code>) and
                  whether processing succeeded.
                </td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 pr-4 align-top">
                  <code className="bg-muted px-1 py-0.5 rounded text-xs">
                    docugardener_jobs_completed_total
                  </code>
                </td>
                <td className="py-2 pr-4 align-top">
                  <code className="bg-muted px-1 py-0.5 rounded text-xs">status</code>
                </td>
                <td className="py-2 align-top">
                  Counter — analysis jobs completed, labelled by terminal status (e.g.{" "}
                  <code className="bg-muted px-1 py-0.5 rounded text-xs">RESOLVED</code>,{" "}
                  <code className="bg-muted px-1 py-0.5 rounded text-xs">FAILED</code>,{" "}
                  <code className="bg-muted px-1 py-0.5 rounded text-xs">CLEAN</code>).
                </td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 pr-4 align-top">
                  <code className="bg-muted px-1 py-0.5 rounded text-xs">
                    docugardener_llm_requests_total
                  </code>
                </td>
                <td className="py-2 pr-4 align-top">
                  <code className="bg-muted px-1 py-0.5 rounded text-xs">provider</code>,{" "}
                  <code className="bg-muted px-1 py-0.5 rounded text-xs">model</code>,{" "}
                  <code className="bg-muted px-1 py-0.5 rounded text-xs">success</code>
                </td>
                <td className="py-2 align-top">
                  Counter — LLM API calls made, labelled by provider (e.g.{" "}
                  <code className="bg-muted px-1 py-0.5 rounded text-xs">anthropic</code>,{" "}
                  <code className="bg-muted px-1 py-0.5 rounded text-xs">openai</code>), model
                  name, and success flag.
                </td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 pr-4 align-top">
                  <code className="bg-muted px-1 py-0.5 rounded text-xs">
                    docugardener_llm_tokens_total
                  </code>
                </td>
                <td className="py-2 pr-4 align-top">
                  <code className="bg-muted px-1 py-0.5 rounded text-xs">provider</code>,{" "}
                  <code className="bg-muted px-1 py-0.5 rounded text-xs">model</code>,{" "}
                  <code className="bg-muted px-1 py-0.5 rounded text-xs">type</code>
                </td>
                <td className="py-2 align-top">
                  Counter — tokens consumed, where{" "}
                  <code className="bg-muted px-1 py-0.5 rounded text-xs">type</code> is either{" "}
                  <code className="bg-muted px-1 py-0.5 rounded text-xs">input</code> or{" "}
                  <code className="bg-muted px-1 py-0.5 rounded text-xs">output</code>. Use this
                  to track spend per provider.
                </td>
              </tr>
              <tr>
                <td className="py-2 pr-4 align-top">
                  <code className="bg-muted px-1 py-0.5 rounded text-xs">
                    docugardener_active_tenants
                  </code>
                </td>
                <td className="py-2 pr-4 align-top">—</td>
                <td className="py-2 align-top">
                  Gauge — number of tenants that have processed at least one job in the last 30
                  days.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Pre-configured dashboards ─────────────────────────── */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-foreground mb-3">
          Pre-configured dashboards
        </h2>
        <p className="text-muted-foreground mb-4">
          Three dashboards are auto-loaded from{" "}
          <code className="bg-muted px-1 py-0.5 rounded text-sm">
            docker/grafana/provisioning/dashboards/
          </code>{" "}
          at startup. They are read-only by default — duplicate a dashboard in Grafana before
          modifying it.
        </p>
        <div className="space-y-4">
          <div className="border border-border rounded-lg p-4">
            <h3 className="font-semibold text-foreground mb-1">Overview</h3>
            <p className="text-muted-foreground text-sm">
              High-level health of the system: webhook receive rate, job completion rate, error rate,
              and active tenant count. The first dashboard to check when something feels off.
            </p>
          </div>
          <div className="border border-border rounded-lg p-4">
            <h3 className="font-semibold text-foreground mb-1">LLM Usage</h3>
            <p className="text-muted-foreground text-sm">
              Token consumption broken down by provider and model, input vs. output token split, and
              request success/failure rates per model. Useful for BYOK cost attribution.
            </p>
          </div>
          <div className="border border-border rounded-lg p-4">
            <h3 className="font-semibold text-foreground mb-1">Queue Health</h3>
            <p className="text-muted-foreground text-sm">
              RQ queue depth over time for the high and default priority queues, worker throughput
              (jobs completed per minute), and stale job detection lag. The alert rules below fire
              based on these signals.
            </p>
          </div>
        </div>
      </section>

      {/* ── Alert rules ───────────────────────────────────────── */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-foreground mb-4">Alert rules</h2>
        <p className="text-muted-foreground mb-4">
          Two alert rules are provisioned from{" "}
          <code className="bg-muted px-1 py-0.5 rounded text-sm">
            docker/grafana/provisioning/alerting/alerts.yml
          </code>
          . They fire to the{" "}
          <code className="bg-muted px-1 py-0.5 rounded text-sm">docugardener-ops</code> contact
          point — configure the delivery webhook URL in your{" "}
          <code className="bg-muted px-1 py-0.5 rounded text-sm">.env</code> (see below).
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 pr-4 font-semibold text-foreground">Rule name</th>
                <th className="text-left py-2 pr-4 font-semibold text-foreground">Condition</th>
                <th className="text-left py-2 font-semibold text-foreground">Severity</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              <tr className="border-b border-border">
                <td className="py-2 pr-4 align-top font-medium text-foreground">
                  RQ Queue Stuck
                </td>
                <td className="py-2 pr-4 align-top">
                  Queue depth &gt; 0 for more than 5 consecutive minutes with no worker activity.
                </td>
                <td className="py-2 align-top">
                  <span className="inline-flex items-center rounded-full bg-destructive/10 text-destructive px-2 py-0.5 text-xs font-medium">
                    critical
                  </span>
                </td>
              </tr>
              <tr>
                <td className="py-2 pr-4 align-top font-medium text-foreground">
                  Worker Silent
                </td>
                <td className="py-2 pr-4 align-top">
                  Queue is non-empty but no jobs have completed in the last 10 minutes — indicates
                  a crashed or hung worker.
                </td>
                <td className="py-2 align-top">
                  <span className="inline-flex items-center rounded-full bg-destructive/10 text-destructive px-2 py-0.5 text-xs font-medium">
                    critical
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Configuring alert delivery ────────────────────────── */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-foreground mb-3">
          Configuring alert delivery
        </h2>
        <p className="text-muted-foreground mb-3">
          The{" "}
          <code className="bg-muted px-1 py-0.5 rounded text-sm">docugardener-ops</code> contact
          point sends a JSON POST to whatever URL you provide in{" "}
          <code className="bg-muted px-1 py-0.5 rounded text-sm">GRAFANA_ALERT_WEBHOOK_URL</code>.
          This makes it compatible with Slack incoming webhooks, PagerDuty event routing endpoints,
          Discord webhooks, or any generic webhook receiver.
        </p>
        <p className="text-muted-foreground mb-3">
          Example — posting alerts to a Slack channel:
        </p>
        <pre className="bg-muted rounded-lg p-4 text-sm overflow-x-auto mb-3">
          <code>{`# .env
GRAFANA_ALERT_WEBHOOK_URL=https://hooks.slack.com/services/T00000000/B00000000/XXXX`}</code>
        </pre>
        <p className="text-muted-foreground text-sm">
          If this variable is not set, the contact point exists but has no destination — alerts fire
          internally in Grafana (visible in the Alerting tab) but are not delivered externally.
          This is acceptable for dev; set it before going to production.
        </p>
      </section>

      {/* ── Environment variables ─────────────────────────────── */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold text-foreground mb-4">Environment variables</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 pr-4 font-semibold text-foreground">Variable</th>
                <th className="text-left py-2 pr-4 font-semibold text-foreground">Default</th>
                <th className="text-left py-2 font-semibold text-foreground">Description</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              <tr className="border-b border-border">
                <td className="py-2 pr-4 align-top">
                  <code className="bg-muted px-1 py-0.5 rounded text-xs">
                    GRAFANA_ALERT_WEBHOOK_URL
                  </code>
                </td>
                <td className="py-2 pr-4 align-top text-xs italic">unset</td>
                <td className="py-2 align-top">
                  Webhook URL for the{" "}
                  <code className="bg-muted px-1 py-0.5 rounded text-xs">docugardener-ops</code>{" "}
                  Grafana contact point. Slack, PagerDuty, Discord, or any webhook receiver.
                </td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 pr-4 align-top">
                  <code className="bg-muted px-1 py-0.5 rounded text-xs">
                    GF_SECURITY_ADMIN_PASSWORD
                  </code>
                </td>
                <td className="py-2 pr-4 align-top">
                  <code className="bg-muted px-1 py-0.5 rounded text-xs">admin</code>
                </td>
                <td className="py-2 align-top">
                  Grafana admin password. Must be changed in production — the default is publicly
                  known.
                </td>
              </tr>
              <tr>
                <td className="py-2 pr-4 align-top">
                  <code className="bg-muted px-1 py-0.5 rounded text-xs">
                    GF_SERVER_ROOT_URL
                  </code>
                </td>
                <td className="py-2 pr-4 align-top text-xs italic">unset</td>
                <td className="py-2 align-top">
                  Set to your public-facing URL only if you expose Grafana through a reverse proxy
                  (e.g.{" "}
                  <code className="bg-muted px-1 py-0.5 rounded text-xs">
                    https://grafana.example.com
                  </code>
                  ). Leave unset when using the SSH tunnel approach.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
