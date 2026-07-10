# APF Recovery Guide

## 1) Purpose
APF (Affiliate Product Finder) identifies and scores affiliate products, enriches them with review intelligence, and hands approved products to ShadowCast.

## 2) Source Of Truth
- Repository: `https://github.com/unlovedproductions/APF`
- Default branch: `main`
- Local root: `/home/unloved/APF`

## 3) Dependencies
- Node.js 22+
- pnpm
- MySQL (from `DATABASE_URL`)
- ShadowCast (`http://localhost:8000`)
- Optional enrichment services: SearXNG (`http://localhost:8088`), Ollama (`http://localhost:11434`)

## 4) Secrets Inventory (names only)
- `DATABASE_URL`
- `JWT_SECRET`
- `DIGISTORE24_ID`
- `SHADOWCAST_BASE_URL`
- `INTERNAL_SERVICE_SECRET`
- `REVIEW_ENRICHMENT_ENABLED`
- `REVIEW_ENRICHMENT_PROVIDER`
- `SEARXNG_BASE_URL`
- `OLLAMA_BASE_URL`

Do not store secret values in docs. Keep values in local env files only.

## 5) Data To Back Up
- MySQL database referenced by `DATABASE_URL` (schema + data)
- Optional operational artifacts:
  - `exports/review-enrichment-daemon.log`
  - generated exports from APF scripts

## 6) Recovery A: New Machine
1. Clone and install:
   - `git clone https://github.com/unlovedproductions/APF.git`
   - `cd APF && pnpm install`
2. Provision MySQL and create the APF database.
3. Restore env file with required variable names.
4. Apply schema:
   - `pnpm db:push`
5. Start app:
   - `pnpm local:start`
6. Start Digistore daemon if used:
   - `pnpm digistore24:daemon`
7. Verify with checklist below.

## 7) Recovery B: Corrupted Working Tree
1. Capture local state:
   - `git status`
2. Save local changes if needed:
   - `git stash push -u`
3. Clean reset to remote:
   - `git fetch origin`
   - `git checkout main`
   - `git reset --hard origin/main`
4. Reinstall dependencies:
   - `pnpm install`
5. Re-apply schema:
   - `pnpm db:push`

## 8) Recovery C: Database Loss
1. Recreate database server/db.
2. Ensure `DATABASE_URL` points to the new database.
3. Rebuild schema:
   - `pnpm db:push`
4. Re-ingest products from upstream sources (data is not fully reconstructible from code alone).

## 9) Verification Checklist
- `pnpm check`
- `pnpm db:push`
- `curl -fsS http://localhost:3000 >/dev/null`
- `pnpm review:status`

## 10) Stack Dependencies
- ShadowCast is required for handoff paths and local smoke tests.
- Mission Control consumes APF APIs and expects aligned `INTERNAL_SERVICE_SECRET`.

## 11) Last Verified
- Date: 2026-07-09
- Commit: `c397ac3`
