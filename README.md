# Fuel Fleet Management System

Fuel Feet is a planned web application for a Sri Lankan fuel transportation business. It will track trip-sheet revenue, crew earnings and payments, vehicle expenses, and monthly operating profit in LKR.

## Project status

Phase 03 adds a responsive dashboard, read-only sample record views, Colombo reporting periods, and a saved appearance preference. Demonstration figures and records come from labeled frontend fixtures. The API connection indicator makes a live HTTP check. [Implementation checklist](docs/implementation-checklist.md)

## Local development

Use Node 24.22.3 and npm 11.19.1, the versions used to verify this workspace. If you use nvm, run `nvm install` and `nvm use` from the repository root first.

```sh
npm ci
npm run dev
```

The web app runs at `http://localhost:5173` and the API at `http://localhost:4000`. Open the web app and look for **Connected** under API status, or run `curl -fsS http://localhost:4000/api/health` to check Express directly. The API returns `{"status":"ok"}`.

Defaults work without external services. To change them, copy `.env.example` to `.env` in the repository root. Set `PORT` to change both the local API listener and Vite proxy target. Set `WEB_ORIGIN` to the browser origin when accessing Express directly from another origin. Set `VITE_API_BASE_URL` at web build time when the API is hosted separately.

## Check and build

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

`npm run build` emits the shared library, API, and static web build in their respective `dist/` directories. `npm run start:api` starts the compiled Express application.

Run `npx playwright install chromium` once, then `npm run test:e2e`. Alternatively, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to an installed Chromium executable. The browser runner uses ports 4175 and 4176 and starts its own web and API processes. [Testing guide](docs/testing.md)

## Project documentation

| Document | Covers |
| --- | --- |
| [Requirements](docs/requirements.md) | Business workflows, scope, and decisions for the owner |
| [Architecture](docs/architecture.md) | Workspace, services, authentication, and integrity |
| [Database schema](docs/database-schema.md) | Proposed entities, relationships, and constraints |
| [Financial rules](docs/financial-rules.md) | Earnings, payments, profit, dates, and rounding |
| [API](docs/api.md) | Planned endpoints and data contracts |
| [UI design system](docs/ui-design-system.md) | Pages, components, accessibility, and themes |
| [Deployment](docs/deployment.md) | Local setup plan, provider evaluation, and release gates |
| [Backup and recovery](docs/backup-and-recovery.md) | Recovery objectives, backup scope, and restore drills |
| [Testing](docs/testing.md) | Unit, integration, and browser acceptance scenarios |
| [Implementation checklist](docs/implementation-checklist.md) | Milestones and completion criteria |

See [AGENTS.md](AGENTS.md) for coding rules and [.env.example](.env.example) for active and planned configuration names.
