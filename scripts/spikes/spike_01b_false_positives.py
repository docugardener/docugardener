# SPDX-License-Identifier: AGPL-3.0-or-later
"""
Spike 1b (v2): False Positive Calibration — realistic corpus + plan tier limits.

v2 changes vs v1:
  - [SIGNAL]/[TANGENT]/[NOISE] labels STRIPPED from content before embedding
    and before LLM prompting. Labels kept in GROUND_TRUTH dict for post-hoc
    scoring only. v1 had the labels in the content, making it trivially easy
    for the LLM to "read the answer" — invalid measurement.
  - temperature=0.2 (was 0.0) — tests real-world variance, not determinism
  - 10 LLM runs per config (was 3) — pass threshold ≥9/10 for hard ACs
  - AC1b-5 redefined: variance bound (stdev ≤ 1.0) not perfect determinism

Corpus design per namespace:
  - 2-3 docs: GENUINELY IMPACTED (must surface)
  - 5-8 docs: TANGENTIAL — mention "users" in unrelated context (must NOT surface)
  - 15-20 docs: COMPLETELY UNRELATED (must never surface)

Special case:
  - demo-hr-spike1b: an HR tool repo with a `users` database table —
    the classic "God Mode" false positive from the problem statement.
    Must return 0 findings regardless of threshold.

Acceptance criteria:
  AC1b-1  TEAM config (top_k=3, conf≥60): findings ≤ 3 in ≥9/10 runs
  AC1b-2  ENTERPRISE config (top_k=5, conf≥50): findings ≤ 5 in ≥9/10 runs
  AC1b-3  HR repo: 0 findings in ALL 10 runs at both configs (hard stop)
  AC1b-4  Signal docs rank above tangential in embedding retrieval (no LLM)
  AC1b-5  Finding count stdev ≤ 1.0 across 10 runs (variance bound)
"""

import asyncio
import json
import statistics
import time

from src.agents.llm import LLMConfig, LLMProvider, create_llm_client
from src.analysis.embeddings import generate_batch_embeddings, generate_embedding
from src.core.config import settings
from src.storage.vectordb import DocumentRecord
from src.storage.weaviate_db import WeaviateDB

# ---------------------------------------------------------------------------
# Namespace names (all cleaned up in finally)
# ---------------------------------------------------------------------------
NS_API   = "demo-api-spike1b"
NS_SDK   = "demo-sdk-spike1b"
NS_DOCS  = "demo-docs-spike1b"
NS_HR    = "demo-hr-spike1b"      # the false-positive trap

ALL_NS = [NS_API, NS_SDK, NS_DOCS, NS_HR]
SIBLING_NS = [NS_SDK, NS_DOCS, NS_HR]  # API is the source repo, not searched

# ---------------------------------------------------------------------------
# Demo diff: /users → /accounts rename
# ---------------------------------------------------------------------------
DIFF_DESCRIPTION = """
Breaking API change: rename REST endpoint /users to /accounts in demo-api.
- src/routes/users.py: @app.get("/users") → @app.get("/accounts")
- src/routes/users.py: get_users() → get_accounts()
- Response model unchanged, only the path and function name changed.
This breaks all consumers calling GET /users or using client.get_users().
"""
QUERY_TEXT = "GET /users endpoint renamed to /accounts — breaking change, all consumers of /users affected"

# ---------------------------------------------------------------------------
# Corpus: (id, file_path, clean_content)
# Labels are ONLY in GROUND_TRUTH below — never in content or embeddings.
# ---------------------------------------------------------------------------

SDK_CORPUS = [
    # --- signal ---
    ("sdk-001", "README.md",
     "Use client.get_users() which calls GET /users to retrieve all users. "
     "Example: users = client.get_users(page=1, limit=20)"),
    ("sdk-002", "MIGRATION.md",
     "v3.0 migration: client.get_users() has been renamed to client.get_accounts(). "
     "Update all calls from GET /users to GET /accounts."),

    # --- tangential ---
    ("sdk-003", "docs/auth.md",
     "Authentication: users must provide a valid JWT token in the Authorization header. "
     "Users without tokens receive 401 Unauthorized."),
    ("sdk-004", "docs/pagination.md",
     "All list endpoints support pagination. Users can set limit and offset parameters. "
     "Default page size is 20 items per request."),
    ("sdk-005", "CHANGELOG.md",
     "v2.5.0: Fixed bug where users with special characters in email could not log in. "
     "Improved error messages for users on expired sessions."),
    ("sdk-006", "docs/errors.md",
     "Error handling guide for users of the SDK. "
     "When users encounter a 429 error, implement exponential backoff."),
    ("sdk-007", "docs/rate-limiting.md",
     "Rate limiting applies per API key. Users are limited to 1000 requests per hour. "
     "Enterprise users have higher limits."),
    ("sdk-008", "README.md#contributing",
     "Contributing: users who want to contribute should fork the repo and open a PR. "
     "New users should read the code of conduct first."),

    # --- noise ---
    ("sdk-010", "docs/installation.md",
     "Install the SDK: npm install @demo/sdk or pip install demo-sdk. "
     "Requires Node.js 18+ or Python 3.10+."),
    ("sdk-011", "docs/webhooks.md",
     "Webhook configuration: set the endpoint URL in your dashboard settings. "
     "Webhooks support JSON and form-encoded payloads."),
    ("sdk-012", "docs/billing.md",
     "Billing integration: use the BillingClient to manage subscriptions. "
     "Stripe is the payment processor."),
    ("sdk-013", "src/client.py",
     "class DemoClient: def __init__(self, api_key): self.api_key = api_key "
     "def get_orders(self): return self._get('/orders')"),
    ("sdk-014", "docs/orders.md",
     "Order management API: POST /orders creates a new order. "
     "GET /orders lists all orders with optional status filter."),
    ("sdk-015", "docs/products.md",
     "Product catalog: GET /products returns paginated product list. "
     "Use category_id filter to narrow results."),
    ("sdk-016", "SECURITY.md",
     "Security policy: all API keys are hashed with SHA-256. "
     "Do not commit API keys to version control."),
    ("sdk-017", "docs/events.md",
     "Event streaming: subscribe to real-time events using the EventSource API. "
     "Events are delivered over WebSocket or SSE."),
    ("sdk-018", "docs/caching.md",
     "Caching: responses are cached with ETags. "
     "Send If-None-Match header to avoid re-downloading unchanged data."),
    ("sdk-019", "docs/search.md",
     "Full-text search: use GET /search?q=term to search across all resources. "
     "Results are ranked by relevance score."),
    ("sdk-020", "docs/filtering.md",
     "Filtering: all list endpoints support field filters using dot notation. "
     "Example: filter[status]=active"),
    ("sdk-021", "docs/sorting.md",
     "Sorting: use sort=field or sort=-field for descending order. "
     "Multiple sort fields are comma-separated."),
    ("sdk-022", "LICENSE",
     "MIT License. Copyright 2024 Demo Corp. "
     "Permission is hereby granted, free of charge, to any person obtaining a copy."),
    ("sdk-023", "docs/testing.md",
     "Testing: use the sandbox environment at sandbox.api.demo.com. "
     "Sandbox keys start with sk_test_."),
    ("sdk-024", "docs/graphql.md",
     "GraphQL API: POST /graphql accepts introspection and mutation queries. "
     "Schema documentation is auto-generated."),
    ("sdk-025", "docs/batch.md",
     "Batch operations: POST /batch accepts up to 100 operations per request. "
     "Operations are executed in order."),
    ("sdk-026", "docs/idempotency.md",
     "Idempotency: include Idempotency-Key header to safely retry POST requests. "
     "Keys expire after 24 hours."),
    ("sdk-027", "docs/versioning.md",
     "API versioning: include Accept: application/vnd.demo.v2+json header. "
     "v1 is deprecated and will be removed in Q4."),
    ("sdk-028", "docs/compression.md",
     "Compression: send Accept-Encoding: gzip to receive compressed responses. "
     "Reduces payload size by ~70%."),
    ("sdk-029", "docs/cors.md",
     "CORS: all origins are allowed in sandbox. "
     "Production restricts to allowlisted domains."),
    ("sdk-030", "CONTRIBUTING.md",
     "Development setup: clone the repo, run npm install, then npm test. "
     "Tests use Jest and require Node 18."),
]

DOCS_CORPUS = [
    # --- signal ---
    ("docs-001", "quickstart.md",
     "Step 3: Fetch your users with response = api.get('/users'). "
     "This endpoint returns a paginated list of all users in your account."),
    ("docs-002", "api-reference/endpoints.md",
     "GET /users — Returns all users. Parameters: page, limit, sort. "
     "Deprecated in v3.0 in favour of GET /accounts. Update your integrations."),

    # --- tangential ---
    ("docs-003", "guides/permissions.md",
     "Role-based access: users with ADMIN role can manage billing. "
     "Regular users have read-only access to most resources."),
    ("docs-004", "guides/onboarding.md",
     "Onboarding checklist: invite your users by going to Settings > Team. "
     "New users receive an invitation email."),
    ("docs-005", "reference/glossary.md",
     "Glossary — User: a person with access to the platform. "
     "Users are identified by their email address and belong to exactly one tenant."),
    ("docs-006", "guides/notifications.md",
     "Notification settings: users can opt out of email notifications "
     "in their profile settings. Users receive alerts for drift events."),
    ("docs-007", "guides/sso.md",
     "SSO setup: after configuring Okta, all users will be provisioned "
     "automatically. Existing users are migrated on next login."),
    ("docs-008", "release-notes/v2.md",
     "v2.0 release: improved performance for teams with more than 50 users. "
     "Fixed edge case where users in multiple orgs saw incorrect data."),

    # --- noise ---
    ("docs-010", "guides/installation.md",
     "Installation: pull the Docker image with docker pull demo/app:latest. "
     "Set the required environment variables from .env.example."),
    ("docs-011", "guides/webhooks.md",
     "Webhook setup: configure your webhook URL in the dashboard. "
     "Verify HMAC signatures with your webhook secret."),
    ("docs-012", "architecture/overview.md",
     "Architecture: three-tier application with React frontend, FastAPI backend, "
     "and PostgreSQL database. Redis for job queuing."),
    ("docs-013", "guides/billing.md",
     "Billing: upgrade to Pro at /pricing. "
     "Annual plans include a 20% discount."),
    ("docs-014", "api-reference/orders.md",
     "POST /orders: creates a new order. Required fields: product_id, quantity. "
     "Returns 201 with the order object."),
    ("docs-015", "api-reference/products.md",
     "GET /products: returns paginated product list. "
     "Filter by category_id or status=active."),
    ("docs-016", "guides/security.md",
     "Security hardening: enable MFA in Settings > Security. "
     "Rotate API keys every 90 days."),
    ("docs-017", "guides/ci-cd.md",
     "CI/CD integration: add DEMO_API_KEY to your GitHub Actions secrets. "
     "Use the official GitHub Action from the marketplace."),
    ("docs-018", "guides/monitoring.md",
     "Monitoring: connect Grafana to our metrics endpoint at /metrics/prometheus. "
     "Alerts fire at p99 > 500ms."),
    ("docs-019", "guides/data-export.md",
     "Data export: download all your data as CSV from Settings > Export. "
     "GDPR deletion requests are processed within 72 hours."),
    ("docs-020", "guides/sdk-setup.md",
     "SDK quickstart: install with pip install demo-sdk then import DemoClient. "
     "Requires Python 3.10 or higher."),
    ("docs-021", "guides/testing.md",
     "Testing guide: use the sandbox environment at sandbox.demo.com. "
     "Sandbox data is reset every 24 hours."),
    ("docs-022", "api-reference/search.md",
     "GET /search: full-text search across all resources. "
     "Supports boolean operators AND, OR, NOT."),
    ("docs-023", "api-reference/batch.md",
     "POST /batch: run up to 100 API calls in a single HTTP request. "
     "Failed operations do not roll back successful ones."),
    ("docs-024", "guides/migration-v3.md",
     "Migrating to v3: the main breaking changes are in authentication and rate limits. "
     "OAuth2 replaces API key auth for server-side applications."),
    ("docs-025", "architecture/database.md",
     "Database schema: all tables use UUIDs as primary keys. "
     "Multi-tenant isolation via row-level security policies."),
    ("docs-026", "guides/compliance.md",
     "SOC2 Type II compliance: annual audit completed March 2025. "
     "Report available under NDA upon request."),
    ("docs-027", "api-reference/events.md",
     "GET /events: returns audit log entries. "
     "Filter by event_type, actor_id, or date range."),
    ("docs-028", "guides/integrations.md",
     "Integrations: connect Slack, PagerDuty, and Jira from Settings > Integrations. "
     "Webhooks are used for real-time push notifications."),
    ("docs-029", "guides/performance.md",
     "Performance tips: enable response compression, use field selection with ?fields=, "
     "and implement client-side caching with ETags."),
    ("docs-030", "guides/troubleshooting.md",
     "Troubleshooting: if you get 429 errors, reduce request frequency. "
     "Enable debug logging with LOG_LEVEL=DEBUG."),
]

# The HR tool trap — a completely different domain that happens to have a "users" table
HR_CORPUS = [
    ("hr-001", "README.md",
     "HR Management Platform: manage employee records, payroll, and time-off requests. "
     "Built with Django and PostgreSQL."),
    ("hr-002", "docs/database.md",
     "Database schema: the `users` table stores employee records with fields: "
     "id, name, email, department_id, hire_date, salary. "
     "Not related to any external API — internal HR data only."),
    ("hr-003", "docs/api.md",
     "Internal HR API: GET /employees returns all employee records. "
     "POST /employees creates a new employee. Requires ADMIN role."),
    ("hr-004", "docs/payroll.md",
     "Payroll module: calculates monthly salary based on grade and hours. "
     "Integrates with accounting system via SFTP export."),
    ("hr-005", "docs/time-off.md",
     "Time-off management: employees request leave via the portal. "
     "Managers approve or reject within 48 hours."),
    ("hr-006", "docs/onboarding.md",
     "Employee onboarding workflow: HR team creates user account, assigns department, "
     "sets up benefits. Average onboarding time: 3 days."),
    ("hr-007", "docs/reporting.md",
     "HR Reports: headcount by department, attrition rate, salary bands. "
     "Reports are generated monthly and emailed to management."),
    ("hr-008", "docs/compliance.md",
     "GDPR compliance: employee personal data is stored in EU region. "
     "Data retention policy: 7 years after employment ends."),
    ("hr-009", "docs/integration.md",
     "Integrations: syncs with Slack for automated user provisioning. "
     "New hires get Slack accounts automatically on day 1."),
    ("hr-010", "CHANGELOG.md",
     "v1.5.0: added bulk import for users table via CSV upload. "
     "Fixed issue with duplicate employee records on re-hire."),
    ("hr-011", "docs/permissions.md",
     "Permission levels: ADMIN (full access), MANAGER (team view), EMPLOYEE (self only). "
     "All roles are stored in the users table permissions column."),
    ("hr-012", "docs/setup.md",
     "Initial setup: run python manage.py migrate to create all tables including users. "
     "Seed data with manage.py seed_hr_data."),
    ("hr-013", "docs/backup.md",
     "Backup policy: nightly pg_dump of all tables to S3. "
     "Point-in-time recovery available for last 30 days."),
    ("hr-014", "docs/authentication.md",
     "Authentication: LDAP integration with Active Directory. "
     "Users log in with their corporate email and AD password."),
    ("hr-015", "docs/audit.md",
     "Audit log: all changes to employee records are logged. "
     "Logs include timestamp, actor, and changed fields."),
    ("hr-016", "docs/benefits.md",
     "Benefits management: health insurance, pension, and stock options. "
     "Employees select benefits during onboarding period."),
    ("hr-017", "docs/performance.md",
     "Performance reviews: annual cycle with quarterly check-ins. "
     "Ratings are stored per employee in the performance_reviews table."),
    ("hr-018", "docs/recruitment.md",
     "Recruitment module: job postings, applicant tracking, interview scheduling. "
     "Connects to LinkedIn and Indeed via job board API."),
    ("hr-019", "docs/org-chart.md",
     "Org chart: hierarchical view of all departments and reporting lines. "
     "Generated dynamically from users table manager_id field."),
    ("hr-020", "docs/export.md",
     "Data export: HR data can be exported as Excel or PDF. "
     "Sensitive fields like salary are redacted for non-admin exports."),
    ("hr-021", "docs/notifications.md",
     "Notification system: automated emails for birthdays, work anniversaries, "
     "probation end dates. Configurable per HR admin."),
    ("hr-022", "docs/mobile.md",
     "Mobile app: employees can view payslips and request leave on iOS and Android. "
     "Push notifications for approval status updates."),
    ("hr-023", "docs/sso.md",
     "SSO configuration: supports SAML 2.0 with Okta, Azure AD, and Google Workspace. "
     "JIT provisioning creates users automatically on first login."),
    ("hr-024", "docs/api-keys.md",
     "API access: generate API keys from HR Admin > Developer Settings. "
     "Keys are scoped to read-only or read-write access."),
    ("hr-025", "docs/bulk-operations.md",
     "Bulk operations: import or update up to 10,000 employee records via CSV. "
     "Validation errors are reported per row."),
    ("hr-026", "docs/departments.md",
     "Department management: create, rename, and archive departments. "
     "Archiving a department reassigns its members."),
    ("hr-027", "docs/workflows.md",
     "Approval workflows: multi-step approval chains for sensitive HR actions "
     "like salary changes and terminations."),
    ("hr-028", "docs/localization.md",
     "Localization: supports 12 languages and multi-currency for global teams. "
     "Date formats follow locale settings."),
    ("hr-029", "docs/disaster-recovery.md",
     "Disaster recovery: RTO < 4h, RPO < 1h. "
     "Failover to secondary region is automated via Route53 health checks."),
    ("hr-030", "docs/training.md",
     "Training records: track certifications, mandatory training completion, "
     "and skills assessments per employee."),
]

# ---------------------------------------------------------------------------
# Ground truth — labels kept SEPARATE from content, never passed to LLM
# ---------------------------------------------------------------------------
GROUND_TRUTH: dict[str, str] = {}
for _doc_id, _file_path, _content in SDK_CORPUS + DOCS_CORPUS + HR_CORPUS:
    # All HR docs are NOISE; SDK/DOCS split is 2 SIGNAL, 6 TANGENT, 22 NOISE
    if _doc_id.startswith("hr-"):
        GROUND_TRUTH[_doc_id] = "NOISE"

GROUND_TRUTH.update({
    "sdk-001": "SIGNAL", "sdk-002": "SIGNAL",
    "sdk-003": "TANGENT", "sdk-004": "TANGENT", "sdk-005": "TANGENT",
    "sdk-006": "TANGENT", "sdk-007": "TANGENT", "sdk-008": "TANGENT",
    "docs-001": "SIGNAL", "docs-002": "SIGNAL",
    "docs-003": "TANGENT", "docs-004": "TANGENT", "docs-005": "TANGENT",
    "docs-006": "TANGENT", "docs-007": "TANGENT", "docs-008": "TANGENT",
})
# Everything else defaults to NOISE
for _doc_id, _, _ in SDK_CORPUS + DOCS_CORPUS:
    if _doc_id not in GROUND_TRUTH:
        GROUND_TRUTH[_doc_id] = "NOISE"

# ---------------------------------------------------------------------------
# LLM prompt (precision over recall — unchanged from Spike 2 design)
# ---------------------------------------------------------------------------
SYSTEM_PROMPT = """\
You are a cross-repository documentation drift detector. Your job is to analyse
a code diff from a SOURCE REPO and determine which documentation chunks from
SIBLING REPOS reference constructs that the diff changes.

Rules:
- PRECISION OVER RECALL. Only report a finding when you are genuinely confident
  (>= 50/100) that the chunk references a construct directly affected by the diff.
- Private/internal changes that are not part of any public API or interface do NOT
  impact sibling documentation.
- Generic mentions of the word "users" in unrelated contexts (HR systems, UI copy,
  authentication descriptions) are NOT impacted by a REST endpoint rename.
- An EMPTY findings array is a valid and expected output. Do NOT hallucinate impact.
- Output ONLY valid JSON. No markdown fences. No preamble. No trailing explanation.

Output schema (strict):
{
  "findings": [
    {
      "file":       "<filename in the sibling repo>",
      "repo":       "<sibling repo name>",
      "line_hint":  <integer line number or null>,
      "confidence": <integer 0-100>,
      "reason":     "<max 80 chars explaining the direct impact>"
    }
  ]
}

Omit any finding with confidence < 50.\
"""


def _build_user_message(diff: str, chunks: list[dict]) -> str:
    chunks_text = "\n".join(
        f"[{i+1}] repo={c['repo']} file={c['file']}\n{c['content']}"
        for i, c in enumerate(chunks)
    )
    return (
        f"<source_diff>\n{diff.strip()}\n</source_diff>\n\n"
        f"<sibling_chunks>\n{chunks_text}\n</sibling_chunks>\n\n"
        "Which of the sibling chunks are impacted by this diff? "
        "Return JSON only."
    )


async def search_multi_namespace(
    db: WeaviateDB,
    query_vector: list[float],
    namespaces: list[str],
    top_k_per_ns: int = 3,
) -> list[dict]:
    tasks = [
        db.search(query_vector=query_vector, namespace=ns, top_k=top_k_per_ns)
        for ns in namespaces
    ]
    results_per_ns = await asyncio.gather(*tasks)
    merged = []
    for ns, results in zip(namespaces, results_per_ns):
        for r in results:
            merged.append({
                "id": r.id,
                "score": r.score,
                "content": r.content or "",
                "source_namespace": ns,
                "repo": ns.replace("-spike1b", ""),
                "file": r.metadata.get("file_path", "unknown"),
            })
    merged.sort(key=lambda x: x["score"], reverse=True)
    return merged


async def run_llm(client, diff: str, chunks: list[dict], temperature: float = 0.2) -> tuple[dict, float]:
    user_msg = _build_user_message(diff, [
        {"repo": c["repo"], "file": c["file"], "content": c["content"]}
        for c in chunks
    ])
    config = LLMConfig(temperature=temperature, max_tokens=1024)
    t0 = time.time()
    response = await client.generate(user_msg, system_prompt=SYSTEM_PROMPT, config=config)
    elapsed = time.time() - t0
    text = response.content.strip()
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
    try:
        return json.loads(text), elapsed
    except json.JSONDecodeError:
        return {"findings": [], "_parse_error": text[:100]}, elapsed


async def seed(db: WeaviateDB) -> None:
    """Seed namespaces. Content is clean — no labels embedded."""
    for ns, corpus in [
        (NS_SDK,  SDK_CORPUS),
        (NS_DOCS, DOCS_CORPUS),
        (NS_HR,   HR_CORPUS),
    ]:
        print(f"  [SEED] {ns} ({len(corpus)} docs)...", end=" ", flush=True)
        texts = [c[2] for c in corpus]   # clean content only
        embeddings = generate_batch_embeddings(texts)
        records = [
            DocumentRecord(
                id=c[0],
                content=c[2],            # clean content — no label prefix
                vector=emb.tolist(),
                metadata={"file_path": c[1], "entity_name": c[0],
                          "entity_type": "doc", "doc_type": "documentation"},
            )
            for c, emb in zip(corpus, embeddings)
        ]
        await db.upsert(records, namespace=ns)
        print("OK")


def label_of(chunk: dict) -> str:
    """Look up ground-truth label by doc id — never from content."""
    return GROUND_TRUTH.get(chunk["id"], "NOISE")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
async def main() -> None:
    print("=== SPIKE 1b v2: False Positive Calibration (labels stripped) ===\n")
    print("NOTE: [SIGNAL]/[TANGENT]/[NOISE] labels are NOT in content or embeddings.")
    print("      Ground truth is checked post-hoc from GROUND_TRUTH dict only.\n")

    import httpx
    try:
        r = httpx.get(f"{settings.weaviate_url}/v1/.well-known/ready", timeout=5)
        r.raise_for_status()
    except Exception:
        print(f"ERROR: Weaviate not reachable at {settings.weaviate_url}. Run `make dev-up`.")
        raise SystemExit(1)

    db = WeaviateDB()
    await db.initialize()

    provider_str = (settings.llm_provider or "gemini").lower()
    provider_map = {
        "gemini": LLMProvider.GEMINI,
        "anthropic": LLMProvider.ANTHROPIC,
        "openai": LLMProvider.OPENAI,
    }
    provider = provider_map.get(provider_str, LLMProvider.GEMINI)
    client = create_llm_client(provider=provider)
    model_name = getattr(client, "model", provider_str)

    RUNS = 10
    TEMPERATURE = 0.2
    PASS_THRESHOLD = 9  # ≥9/10 runs must pass each AC

    print(f"[CONFIG] Provider: {provider_str} | Model: {model_name}")
    print(f"[CONFIG] Corpus: 30 docs/namespace × 3 sibling namespaces = 90 total docs")
    print(f"[CONFIG] Runs: {RUNS} | Temperature: {TEMPERATURE} | Pass threshold: ≥{PASS_THRESHOLD}/{RUNS}\n")

    ac_results: dict[str, bool] = {}

    try:
        print("[SETUP] Seeding namespaces (clean content, no label prefixes)...")
        await seed(db)
        print()

        query_vec = generate_embedding(QUERY_TEXT).tolist()

        # ------------------------------------------------------------------
        # TEAM config: top_k=3 per namespace, confidence ≥ 60
        # ------------------------------------------------------------------
        print(f"--- Config: TEAM (top_k_per_ns=3, min_confidence=60) — {RUNS} runs ---")

        # Show retrieval ranking once (no LLM involved — embedding quality check)
        team_results = await search_multi_namespace(db, query_vec, SIBLING_NS, top_k_per_ns=3)
        print(f"  [RETRIEVAL] Top {len(team_results)} chunks across {len(SIBLING_NS)} namespaces:")
        for i, r in enumerate(team_results):
            tag = label_of(r)
            print(f"    #{i+1:2d} score={r['score']:.3f} [{tag:6s}] {r['repo']}/{r['file']}")
        print()

        team_finding_counts: list[int] = []
        team_hr_counts: list[int] = []
        for run in range(1, RUNS + 1):
            results = await search_multi_namespace(db, query_vec, SIBLING_NS, top_k_per_ns=3)
            llm_result, elapsed = await run_llm(client, DIFF_DESCRIPTION, results, TEMPERATURE)
            findings = [f for f in llm_result.get("findings", []) if f.get("confidence", 0) >= 60]
            hr_findings = [f for f in findings if "hr" in f.get("repo", "").lower()]
            team_finding_counts.append(len(findings))
            team_hr_counts.append(len(hr_findings))
            marker = "✓" if len(findings) <= 3 and len(hr_findings) == 0 else "✗"
            print(f"  Run {run:2d}: {marker} findings={len(findings)} HR={len(hr_findings)} ({elapsed:.1f}s)")

        team_pass_count = sum(1 for c in team_finding_counts if c <= 3)
        team_hr_zero    = sum(1 for c in team_hr_counts if c == 0)
        ac1b_1 = team_pass_count >= PASS_THRESHOLD
        ac1b_3_team = team_hr_zero == RUNS  # must be ALL runs, not just threshold
        team_stdev = statistics.stdev(team_finding_counts) if len(team_finding_counts) > 1 else 0.0

        print(f"\n  AC1b-1 (TEAM ≤3 in ≥{PASS_THRESHOLD}/{RUNS}): {team_pass_count}/{RUNS} — {'PASS' if ac1b_1 else 'FAIL'}")
        print(f"  AC1b-3 (TEAM HR=0 ALL runs):    {team_hr_zero}/{RUNS} — {'PASS' if ac1b_3_team else '*** HARD STOP ***'}")
        print(f"  Stdev of finding counts: {team_stdev:.2f}")
        ac_results["AC1b-1"] = ac1b_1

        if not ac1b_3_team:
            print("\n=== HARD STOP: HR false positive in TEAM config — no-go ===")
            raise SystemExit(2)
        print()

        # ------------------------------------------------------------------
        # ENTERPRISE config: top_k=5 per namespace, confidence ≥ 50
        # ------------------------------------------------------------------
        print(f"--- Config: ENTERPRISE (top_k_per_ns=5, min_confidence=50) — {RUNS} runs ---")

        ent_results_sample = await search_multi_namespace(db, query_vec, SIBLING_NS, top_k_per_ns=5)
        print(f"  [RETRIEVAL] Top {len(ent_results_sample)} chunks across {len(SIBLING_NS)} namespaces:")
        for i, r in enumerate(ent_results_sample):
            tag = label_of(r)
            print(f"    #{i+1:2d} score={r['score']:.3f} [{tag:6s}] {r['repo']}/{r['file']}")
        print()

        ent_finding_counts: list[int] = []
        ent_hr_counts: list[int] = []
        for run in range(1, RUNS + 1):
            results = await search_multi_namespace(db, query_vec, SIBLING_NS, top_k_per_ns=5)
            llm_result, elapsed = await run_llm(client, DIFF_DESCRIPTION, results, TEMPERATURE)
            findings = [f for f in llm_result.get("findings", []) if f.get("confidence", 0) >= 50]
            hr_findings = [f for f in findings if "hr" in f.get("repo", "").lower()]
            ent_finding_counts.append(len(findings))
            ent_hr_counts.append(len(hr_findings))
            marker = "✓" if len(findings) <= 5 and len(hr_findings) == 0 else "✗"
            print(f"  Run {run:2d}: {marker} findings={len(findings)} HR={len(hr_findings)} ({elapsed:.1f}s)")

        ent_pass_count = sum(1 for c in ent_finding_counts if c <= 5)
        ent_hr_zero    = sum(1 for c in ent_hr_counts if c == 0)
        ac1b_2 = ent_pass_count >= PASS_THRESHOLD
        ac1b_3_ent = ent_hr_zero == RUNS
        ent_stdev = statistics.stdev(ent_finding_counts) if len(ent_finding_counts) > 1 else 0.0

        print(f"\n  AC1b-2 (ENT ≤5 in ≥{PASS_THRESHOLD}/{RUNS}): {ent_pass_count}/{RUNS} — {'PASS' if ac1b_2 else 'FAIL'}")
        print(f"  AC1b-3 (ENT HR=0 ALL runs):   {ent_hr_zero}/{RUNS} — {'PASS' if ac1b_3_ent else '*** HARD STOP ***'}")
        print(f"  Stdev of finding counts: {ent_stdev:.2f}")
        ac_results["AC1b-2"] = ac1b_2
        ac_results["AC1b-3"] = ac1b_3_team and ac1b_3_ent

        if not ac1b_3_ent:
            print("\n=== HARD STOP: HR false positive in ENTERPRISE config — no-go ===")
            raise SystemExit(2)
        print()

        # ------------------------------------------------------------------
        # AC1b-4: Retrieval quality — signal ranks above tangential (no LLM)
        # ------------------------------------------------------------------
        print("--- AC1b-4: Retrieval quality (embedding-only, ENTERPRISE top_k=10 per ns) ---")
        results_full = await search_multi_namespace(db, query_vec, [NS_SDK, NS_DOCS], top_k_per_ns=10)
        signal_positions, tangent_positions = [], []
        for i, r in enumerate(results_full):
            gt = label_of(r)
            if gt == "SIGNAL":
                signal_positions.append(i + 1)
            elif gt == "TANGENT":
                tangent_positions.append(i + 1)

        print(f"  Signal positions:     {signal_positions}")
        print(f"  Tangential positions: {tangent_positions}")

        avg_signal  = sum(signal_positions)  / len(signal_positions)  if signal_positions  else 99
        avg_tangent = sum(tangent_positions) / len(tangent_positions) if tangent_positions else 99
        ac1b_4 = avg_signal < avg_tangent
        ac_results["AC1b-4"] = ac1b_4
        print(f"  Avg rank — signal={avg_signal:.1f}, tangential={avg_tangent:.1f} — {'PASS' if ac1b_4 else 'FAIL'}")
        print()

        # ------------------------------------------------------------------
        # AC1b-5: Variance bound (stdev ≤ 1.0 across runs)
        # ------------------------------------------------------------------
        ac1b_5 = team_stdev <= 1.0 and ent_stdev <= 1.0
        ac_results["AC1b-5"] = ac1b_5
        print(f"  AC1b-5 (stdev ≤ 1.0): TEAM={team_stdev:.2f}, ENT={ent_stdev:.2f} — {'PASS' if ac1b_5 else 'FAIL'}")

        # ------------------------------------------------------------------
        # Summary
        # ------------------------------------------------------------------
        passed = sum(1 for v in ac_results.values() if v)
        total  = len(ac_results)
        print(f"\n{'='*50}")
        for ac, result in ac_results.items():
            print(f"  {ac}: {'PASS' if result else 'FAIL'}")
        print(f"\n  Finding count distribution:")
        print(f"    TEAM (10 runs):       {team_finding_counts}  stdev={team_stdev:.2f}")
        print(f"    ENTERPRISE (10 runs): {ent_finding_counts}  stdev={ent_stdev:.2f}")
        verdict = "PASS — GO" if passed == total else f"FAIL ({passed}/{total})"
        print(f"\n=== RESULT: {passed}/{total} {verdict} ===")

    finally:
        print("\n[CLEANUP] Removing spike namespaces...")
        for ns in ALL_NS:
            try:
                await db.delete_namespace(ns)
            except Exception:
                pass
        await db.close()


if __name__ == "__main__":
    asyncio.run(main())
