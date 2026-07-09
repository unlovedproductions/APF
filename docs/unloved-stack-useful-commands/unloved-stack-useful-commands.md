---
title: Unloved Stack Useful Commands
author: Unloved Productions
date: July 2026
---

# Unloved Stack Useful Commands

APF (Affiliate Product Finder) — local workflow reference for enrichment, Digistore24, scoring, and ShadowCast.

---

## Prerequisites

```bash
pnpm install
cp .env.example .env   # edit DATABASE_URL, DIGISTORE24_ID, SHADOWCAST_*, etc.
pnpm db:push           # apply migrations
```

### External services (must be running)

| Service    | Default URL              | Purpose              |
|------------|--------------------------|----------------------|
| MySQL      | per DATABASE_URL         | Database             |
| ShadowCast | http://localhost:8000    | Video draft handoff  |
| SearXNG    | http://localhost:8088    | Review search        |
| Ollama     | http://localhost:11434   | Review summarization |

### Required .env flags

```env
REVIEW_ENRICHMENT_ENABLED=true
REVIEW_ENRICHMENT_PROVIDER=searxng
SEARXNG_BASE_URL=http://localhost:8088
OLLAMA_BASE_URL=http://localhost:11434
SHADOWCAST_BASE_URL=http://localhost:8000
INTERNAL_SERVICE_SECRET=change-me-local-secret
DIGISTORE24_ID=YourAffiliateNickname
```

---

## Daily startup (recommended order)

**Terminal 1 — APF + enrichment daemon**

```bash
pnpm local:start
```

Starts review enrichment daemon (if enabled) and dev server on :3000.

**Terminal 2 — Digistore24 browser collector**

```bash
pnpm digistore24:daemon
```

**First login or expired session**

```bash
pnpm digistore24:login
```

**In the UI:** Digistore24 → Refresh Data (collects, scores, queues enrichment).

---

## Enrichment commands

| Command | Purpose |
|---------|---------|
| `pnpm review:daemon:start` | Start enrichment daemon manually |
| `pnpm review:daemon:logs` | Tail enrichment logs |
| `pnpm review:worker` | Run worker loop continuously |
| `pnpm review:once` | Process one job and exit |
| `pnpm review:status` | Queue status + products not yet complete |
| `pnpm review:requeue-digistore24` | Re-queue all Digistore24 + seed vendor materials |

### Typical enrichment flow

1. Products queue automatically on collection.
2. Daemon/worker processes jobs (SearXNG + Ollama).
3. Check progress: `pnpm review:status`
4. Force Digistore refresh after schema changes:

   ```bash
   pnpm review:requeue-digistore24
   pnpm review:once    # repeat until complete
   ```

5. Wait for `enrichment_status = complete` before ShadowCast handoff.

---

## Digistore24 health & diagnostics

```bash
pnpm digistore24:session:check
pnpm digistore24:daemon:health
pnpm digistore24:daemon:open      # ensure daemon + open browser
pnpm digistore24:daemon:collect   # trigger collect
pnpm digistore24:daemon:stop
```

### Optional API/import tools (not main refresh path)

```bash
pnpm digistore24:test-api
pnpm digistore24:import-api
pnpm digistore24:discover
pnpm digistore24:import-all
```

---

## Scoring

```bash
pnpm score:explain              # dry-run, 25 products
pnpm score:backfill             # all marketplaces
pnpm score:digistore24          # Digistore only
pnpm score:digistore24:explain  # dry-run Digistore
```

---

## ShadowCast handoff

After enrichment is `complete`:

- **UI:** Product detail → Send to ShadowCast
- **CLI:**

  ```bash
  pnpm local:smoke-test       # end-to-end check
  pnpm shadowcast:send        # direct send
  pnpm export:shadowcast      # export enriched JSON
  pnpm shadowcast:export-ui   # local picker UI
  ```

---

## Other useful commands

```bash
pnpm dev                 # APF only (no enrichment daemon)
pnpm build && pnpm start # production
pnpm check               # TypeScript
pnpm test                # vitest
```

---

## Minimal checklist

1. `pnpm db:push`
2. Start MySQL, ShadowCast, SearXNG, Ollama
3. `pnpm local:start`
4. `pnpm digistore24:daemon` (+ login if needed)
5. Refresh Digistore24 in UI
6. `pnpm review:status` until `complete`
7. `pnpm local:smoke-test` or Send to ShadowCast in UI

---

*Full runbook: LOCAL_SHADOWCAST.md in the APF repo.*
