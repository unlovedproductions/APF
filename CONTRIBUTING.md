# Contributing to APF

## Prerequisites

- Node.js 20+
- pnpm 9+
- MySQL (Docker `apf-mysql` or local)
- Copy `.env.example` → `.env` and set `DATABASE_URL`, `JWT_SECRET`, `INTERNAL_SERVICE_SECRET`

## Setup

```bash
pnpm install
pnpm db:push
pnpm dev
```

## Checks before PR

```bash
pnpm check
```

## Architecture

- `server/` — Express + tRPC API
- `client/` — Vite React SPA
- `scripts/` — enrichment daemons, importers, ShadowCast export
- `drizzle/` — SQL migrations

See `docs/ARCHITECTURE.md` for data flow and ShadowCast handoff.
