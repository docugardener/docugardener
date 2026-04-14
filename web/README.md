# DocuGardener — Web Frontend

The Next.js 15 admin dashboard and API layer for DocuGardener.

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Auth**: NextAuth.js v4 (GitHub OAuth provider)
- **Database**: PostgreSQL via Prisma ORM
- **UI**: Tailwind CSS + shadcn/ui components (Zinc design system)
- **Testing**: Vitest + Testing Library

## Prerequisites

- Node.js 20+
- PostgreSQL (local or via Docker: `docker-compose up -d` from the project root)
- GitHub OAuth App credentials (separate from the GitHub App used for webhooks)

## Setup

```bash
cd web

# Install dependencies
npm install

# Copy and configure environment
cp .env.example .env
# Edit .env — see variable descriptions below

# Run database migrations
npx prisma migrate dev --name init

# Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

See `.env.example` for the full list. Key variables:

| Variable | Description |
| :--- | :--- |
| `DATABASE_URL` | PostgreSQL connection string |
| `NEXTAUTH_URL` | Full URL of the app (e.g., `http://localhost:3000`) |
| `NEXTAUTH_SECRET` | Random string for session signing |
| `GITHUB_ID` | GitHub OAuth App Client ID |
| `GITHUB_SECRET` | GitHub OAuth App Client Secret |
| `GEMINI_API_KEY` | Google Gemini key (used as BYOK default in dev) |
| `BUNDLED_GEMINI_KEY` | Operator fallback key — controls "Platform Default" card visibility in Settings |
| `BUNDLED_GEMINI_MODEL` | Model for the bundled key (default: `gemini-2.0-flash`) |

> **Important:** `BUNDLED_GEMINI_KEY` must also be set in the root `.env` for the Python backend. Both env files must stay in sync for the Platform Default feature to work end-to-end.

## Running Tests

```bash
# Run all frontend tests
npx vitest run

# Watch mode
npx vitest

# With verbose output
npx vitest run --reporter=verbose
```

## Project Structure

```
web/
├── app/
│   ├── api/                    # API Routes (NextAuth, settings, onboarding, etc.)
│   ├── dashboard/
│   │   ├── page.tsx            # Redirects → /dashboard/inbox
│   │   ├── inbox/              # Triage Inbox (default home)
│   │   ├── reports/            # Garden Health metrics dashboard
│   │   ├── jobs/               # Job history listing
│   │   ├── settings/           # LLM config, integrations, ignore patterns
│   │   ├── prompts/            # Prompt Engineering playground
│   │   └── simulation/         # Drift Simulator
│   └── onboarding/             # GitHub App installation flow
├── components/
│   ├── layout/
│   │   └── Sidebar.tsx         # Progressive-disclosure nav
│   ├── onboarding/
│   │   └── GettingStartedBanner.tsx  # First-run 3-step banner
│   ├── settings/
│   │   └── LLMConfigForm.tsx   # Provider card selector (incl. Platform Default)
│   └── ui/                     # shadcn/ui primitives
├── __tests__/                  # Vitest test files
└── prisma/
    └── schema.prisma
```

## Key Features

- **Inbox as Home**: Post-login redirect lands at `/dashboard/inbox` — zero navigation friction.
- **Progressive Sidebar**: Developer Tools (Prompts, Simulator, Components) are collapsed by default.
- **First-Run Banner**: 3-step contextual guide shown in the Inbox until dismissed.
- **Platform Default**: Settings shows a "Platform Default" provider card when `BUNDLED_GEMINI_KEY` is configured, letting tenants use the operator's bundled Gemini Flash key without entering their own.
- **Geometrically aligned Reports page**: A single `grid-cols-12` declaration owns all content rows so vertical column dividers and horizontal row heights are mathematically exact. Layout: KPI bar → (Drift Velocity 7/12 | Vitality Index 5/12) → (Repositories 7/12 | Withering Zones 5/12) → Team collapsible section.

## Linting & Type Checking

```bash
npm run lint
npx tsc --noEmit
```
