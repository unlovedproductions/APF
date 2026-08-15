---
title: Unloved Stack Useful Commands
author: Unloved Productions
date: August 2026
---

# Unloved Stack Useful Commands

APF (Affiliate Product Finder) — local workflow reference for enrichment, Digistore24, scoring, and ShadowCast handoff.

For desktop launchers and Mission Control, see **Unloved Full Stack Commands** in the same folder.

---

## Prerequisites

```bash
cd ~/APF
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

APF dev server default: **http://localhost:3001** (`PORT=3001` in desktop launcher; override in `.env`).

### Required .env flags

```env
REVIEW_ENRICHMENT_ENABLED=true
REVIEW_ENRICHMENT_PROVIDER=searxng
SEARXNG_BASE_URL=http://localhost:8088
SEARXNG_ENGINES=brave
SEARXNG_FALLBACK_ENGINES=bing,duckduckgo
REVIEW_ENRICHMENT_SEARCH_DELAY_MS=8000
REVIEW_ENRICHMENT_MAX_QUERIES=4
REVIEW_ENRICHMENT_MAX_VENDOR_QUERIES=2
# Rich full-page successes to collect (default 6)
REVIEW_ENRICHMENT_FULL_PAGE_LIMIT=6
# Max fetch attempts while filling that quota (default 18)
REVIEW_ENRICHMENT_FULL_PAGE_MAX_ATTEMPTS=18
# Playwright stealth → Jina → Firecrawl escalate for thin/blocked pages
# REVIEW_ENRICHMENT_PLAYWRIGHT_STEALTH=1
# Prefer self-hosted Firecrawl; cloud BYOK if BASE_URL unset + FIRECRAWL_API_KEY
# FIRECRAWL_BASE_URL=http://localhost:3002/v2
# FIRECRAWL_API_KEY=
# Oxylabs last SERP fallback
# OXYLABS_USERNAME=
# OXYLABS_PASSWORD=
# TRUSTPILOT_API_KEY=
# Free recovery after CAPTCHA/rate-limits: docker restart unloved-searxng, wait,
# probe until hits return, then re-enrich slowly (DELAY_MS>=8000, MAX_RETRIES=1).
# Brave Search API is optional/paid-adjacent — not required for free-only.
OLLAMA_BASE_URL=http://localhost:11434
SHADOWCAST_BASE_URL=http://localhost:8000
INTERNAL_SERVICE_SECRET=change-me-local-secret
DIGISTORE24_ID=YourAffiliateNickname
```

`INTERNAL_SERVICE_SECRET` must match `~/shadowcast-/backend/.env`.

---

## Infrastructure startup (run before APF)

```bash
# MySQL
docker start apf-mysql          # preferred if Docker container exists
# or: sudo systemctl start mysql

# SearXNG (APF review enrichment)
cd ~/searxng
docker compose up -d            # starts unloved-searxng on :8088
docker compose down             # stop
docker restart unloved-searxng  # restart existing container
# After restart, wait then probe before bulk re-enrich:
# curl -fsS 'http://localhost:8088/search?q=test&format=json&engines=brave' | python3 -c 'import sys,json;d=json.load(sys.stdin);print(len(d.get("results")or[]),d.get("unresponsive_engines"))'
# Slow re-enrich: REVIEW_ENRICHMENT_SEARCH_DELAY_MS=5000 REVIEW_ENRICHMENT_SEARCH_MAX_RETRIES=1 SEARXNG_ENGINES=brave

# Ollama (enrichment + ShadowCast LLM)
ollama serve &                  # skip if already running
ollama pull qwen2.5:14b-instruct-q5_K_M   # ShadowCast default; adjust per .env
```

### Health checks

```bash
mysqladmin ping -h 127.0.0.1 -u root   # or pnpm db:push
curl -fsS http://localhost:8088/ >/dev/null
curl -fsS http://localhost:11434/api/tags >/dev/null
curl -fsS http://localhost:8000/api/health >/dev/null
curl -fsS http://localhost:3001/api/health >/dev/null   # APF (adjust PORT if needed)
```

---

## ShadowCast (minimal — for APF handoff)

```bash
cd ~/shadowcast-/backend
source ../.venv/bin/activate    # or ../venv/bin/activate
source .env
python -m uvicorn app:app --host 0.0.0.0 --port 8000 --reload
# alt: python3 app.py
```

---

## Daily startup (recommended order)

1. Start infrastructure: MySQL → SearXNG → Ollama → ShadowCast (commands above)
2. `pnpm db:push` (first time or after migrations)
3. **Terminal 1 — APF + enrichment daemon:**

   ```bash
   cd ~/APF
   pnpm local:start
   ```

   Starts review enrichment daemon (if enabled) and dev server (default `:3001`).

4. **Terminal 2 — Digistore24 browser collector:**

   ```bash
   pnpm digistore24:daemon
   ```

5. **First login or expired session:**

   ```bash
   pnpm digistore24:login
   ```

6. **In the UI:** Digistore24 → Refresh Data (collects, scores, queues enrichment).
7. `pnpm review:status` until `enrichment_status = complete`, then ShadowCast handoff.

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
| `pnpm review:dqs` | Digistore enrichment DQS snapshot (`--write` optional) |
| `pnpm review:prune-thin` | Soft-prune thin review sources (`--days 0` disables age gate) |
| `pnpm review:depth-backfill` | Depth backfill pass |
| `pnpm review:trustpilot` | Trustpilot Business Units collector (keyed; dry-run default) |
| `pnpm digistore:refresh-names` | Refresh Digistore placeholder names from vendor materials |
| `pnpm promote:outcome` | Log / import campaign promote outcomes |
| `pnpm promote:outcomes:list` | List promote outcomes |
| `pnpm promote:calibrate` | Apply gated Hidden Gem calibration (≥3 real `promote_result`) |

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

1. Start MySQL, SearXNG, Ollama, ShadowCast (see Infrastructure startup)
2. `pnpm db:push`
3. `pnpm local:start`
4. `pnpm digistore24:daemon` (+ login if needed)
5. Refresh Digistore24 in UI
6. `pnpm review:status` until `complete`
7. `pnpm local:smoke-test` or Send to ShadowCast in UI

---

*Full runbook: LOCAL_SHADOWCAST.md. Full stack + desktop launchers: unloved-full-stack-commands.md in this folder.*
