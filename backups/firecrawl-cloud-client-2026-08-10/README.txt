# Firecrawl cloud-client backup (2026-08-10)

Created before switching APF enrichment to support self-hosted Firecrawl.

## Contents

- `enrichment-firecrawl.mjs` — cloud-only client (`api.firecrawl.dev` + API key required)
- `enrichment-firecrawl.test.ts` — matching tests
- `enrichment-page-fetch.mjs` — page-fetch as of backup time
- `firecrawl-ollama-rag-setup.md`, `product_enrichment_pipeline.py`, `vendor_trust_pipeline.py` — reference prototypes from Downloads

## Restore old APF Firecrawl client

```bash
cd /home/unloved/APF
cp backups/firecrawl-cloud-client-2026-08-10/enrichment-firecrawl.mjs scripts/
cp backups/firecrawl-cloud-client-2026-08-10/enrichment-firecrawl.test.ts server/
# optional: remove FIRECRAWL_BASE_URL from .env to force cloud-only again
```

## Self-hosted Firecrawl

- Repo: `/home/unloved/firecrawl` (pinned `v2.11.162`)
- API: `http://localhost:3002`
- Config: `/home/unloved/firecrawl/.env` (not in git)
- Start: `cd /home/unloved/firecrawl && docker compose up -d`
- Stop: `cd /home/unloved/firecrawl && docker compose down`
- APF points at it via `FIRECRAWL_BASE_URL=http://localhost:3002/v2` in `/home/unloved/APF/.env`
