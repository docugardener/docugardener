# Contributing to DocuGardener

Thank you for your interest in contributing. DocuGardener is licensed under AGPL-3.0.

---

## Development Setup

### Prerequisites

- Python 3.12+
- Node.js 20+
- Docker + Docker Compose (Colima on macOS)
- A GitHub App for local webhook testing (see [docs/self-hosting/github-app](https://docugardener.dev/docs/self-hosting/github-app))

### Running Locally

```bash
# Clone and install
git clone https://github.com/docugardener/docugardener.git
cd docugardener

# Python backend
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"

# Frontend
cd web && npm install

# Start all services
make dev-up

# Start the Next.js dev server
cd web && npm run dev -- --port 3003
```

See [`.env.example`](.env.example) and [`web/.env.example`](web/.env.example) for required environment variables.

---

## Running Tests

```bash
# Python unit + integration
pytest tests/unit/ tests/integration/ -q

# Python E2E (requires Docker services running)
E2E_ENABLED=1 pytest tests/e2e/ -m e2e -v

# Frontend (Vitest)
cd web && npx vitest run

# Frontend E2E (Playwright)
cd web && npx playwright test

# TypeScript
cd web && npx tsc --noEmit
```

All suites must pass with zero regressions before submitting a PR.

---

## UI Contributions

DocuGardener's frontend uses a locked design system. Before writing any UI code:

1. **Read [`docs/design-system.md`](docs/design-system.md)** — 5 minutes, saves a review round.
2. **Use the primitives** — `StatusChip`, `DataTable`, `PageHeader`, shadcn `Card`.
3. **Run the pre-PR checks** listed at the bottom of that file.

PRs that introduce `border-l-8`, raw `<table>` elements in dashboard pages, or hardcoded hex colours will be asked to revise before review.

---

## Code Conventions

### Python

- Type hints on every function signature — no bare `dict`, use `TypedDict` or dataclass.
- Structured logging with correlation IDs — never `print()`.
- RQ jobs: always define `on_failure` callback; use `Retry(max=3, interval=[30,60,120])`.
- DB sessions via context manager — never leak `SessionLocal`.

### TypeScript / Next.js

- No `any` — use proper types or `unknown` with narrowing.
- API routes: validate input with Zod before touching the DB.
- Prisma: use transactions for multi-table writes.
- RBAC: every API route must check role (`ADMIN | VIEWER | AUDITOR | BILLING_ADMIN`).

### General

- No secrets in code or logs.
- No `TODO` comments without a linked issue or spec ID.
- All new files: `// SPDX-License-Identifier: AGPL-3.0-or-later` header.

---

## Pull Requests

- One logical unit per PR — feature, fix, or refactor. Not all three.
- Include test coverage for new behaviour.
- Update `README.md` or relevant docs if your change affects setup, configuration, or user-facing behaviour.
- Reference the relevant spec (`docs/specs/`) or GitHub issue in the PR description.

---

## Reporting Issues

- **Bugs:** [GitHub Issues](https://github.com/docugardener/docugardener/issues) — include DocuGardener version, Python/Node versions, and a minimal reproduction.
- **Security vulnerabilities:** Do not open a public issue. Email `security@docugardener.dev`.
- **Feature requests:** Open an issue with the `enhancement` label and describe the use case, not just the solution.
