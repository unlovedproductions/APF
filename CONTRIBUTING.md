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
pnpm test
```

CI runs the same checks on every push and pull request (see `.github/workflows/ci.yml`).

## Architecture

- `server/` — Express + tRPC API
- `client/` — Vite React SPA
- `scripts/` — enrichment daemons, importers, ShadowCast export
- `drizzle/` — SQL migrations

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for data flow and ShadowCast handoff.

## Pull request expectations

- Keep PRs focused; one logical change per PR when possible.
- Run `pnpm check` and `pnpm test` locally before opening.
- Match existing code style; avoid unrelated refactors or drive-by edits.
- Add or update tests when changing scoring, enrichment, or export behavior.
- Document operator-only steps (Digistore login, promolink promote) in `LOCAL_SHADOWCAST.md` or `docs/` — do not embed secrets or hardcoded home paths in scripts.
- Link related issues or plan todos in the PR description when applicable.
