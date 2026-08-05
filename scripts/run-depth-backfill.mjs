#!/usr/bin/env node
/**
 * Way 2 depth backfill — sets enrichment depth env then runs backfill-source-content.
 * Does not run SERP discovery (anti-dilution). Prefer this over review:once for depth.
 *
 * Usage:
 *   pnpm review:depth-backfill
 *   pnpm review:depth-backfill --product-id 8 --limit 50
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const depthEnv = {
  ...process.env,
  REVIEW_ENRICHMENT_JINA: process.env.REVIEW_ENRICHMENT_JINA || "1",
  REVIEW_ENRICHMENT_FIRECRAWL_MAX_SCRAPE_PER_JOB:
    process.env.REVIEW_ENRICHMENT_FIRECRAWL_MAX_SCRAPE_PER_JOB || "15",
  REVIEW_ENRICHMENT_FULL_PAGE_LIMIT:
    process.env.REVIEW_ENRICHMENT_FULL_PAGE_LIMIT || "20",
  REVIEW_ENRICHMENT_FULL_PAGE_MAX_ATTEMPTS:
    process.env.REVIEW_ENRICHMENT_FULL_PAGE_MAX_ATTEMPTS || "60",
  REVIEW_ENRICHMENT_FETCH_TIMEOUT_MS:
    process.env.REVIEW_ENRICHMENT_FETCH_TIMEOUT_MS || "12000",
};

const passthrough = process.argv.slice(2);
if (!passthrough.includes("--limit") && !passthrough.some((a, i) => passthrough[i - 1] === "--limit")) {
  // keep caller args; backfill default limit is fine
}

const child = spawn(
  process.execPath,
  [path.join(root, "scripts/backfill-source-content.mjs"), ...passthrough],
  {
    cwd: root,
    env: depthEnv,
    stdio: "inherit",
  },
);

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
