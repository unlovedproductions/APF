Playwright Stealth backup 2026-08-10

Restore APF page-fetch:
  cp backups/playwright-stealth-2026-08-10/enrichment-page-fetch.mjs scripts/

Restore Firecrawl playwright-service (pre-stealth):
  cp backups/playwright-stealth-2026-08-10/api.ts /home/unloved/firecrawl/apps/playwright-service-ts/
  cp backups/playwright-stealth-2026-08-10/package.json /home/unloved/firecrawl/apps/playwright-service-ts/
  cd /home/unloved/firecrawl/apps/playwright-service-ts && pnpm install
  cd /home/unloved/firecrawl && docker compose up --build -d playwright-service

APF stealth module (new): scripts/enrichment-playwright-stealth.mjs
Disable: REVIEW_ENRICHMENT_PLAYWRIGHT_STEALTH=0
