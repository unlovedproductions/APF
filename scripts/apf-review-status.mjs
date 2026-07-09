#!/usr/bin/env node
import fs from "node:fs";
import mysql from "mysql2/promise";

function loadEnv(file = ".env") {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}

loadEnv();

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL missing from .env");
  process.exit(1);
}

const conn = await mysql.createConnection(process.env.DATABASE_URL);

try {
  const [statusRows] = await conn.query(`
    SELECT status, COUNT(*) AS count
    FROM review_enrichment_jobs
    GROUP BY status
    ORDER BY status;
  `);

  console.log("\nReview job status:");
  console.table(statusRows);

  const [claimableRows] = await conn.query(`
    SELECT COUNT(*) AS count
    FROM review_enrichment_jobs
    WHERE status IN ('queued','failed','pending_api_key')
      AND next_run_at <= NOW()
      AND attempts < 10
  `);

  const [staleQueuedRows] = await conn.query(`
    SELECT COUNT(*) AS count
    FROM review_enrichment_jobs j
    WHERE j.status = 'queued'
      AND (
        j.next_run_at > NOW()
        OR j.attempts >= 10
        OR EXISTS (
          SELECT 1
          FROM product_review_briefs b
          WHERE b.product_id = j.product_id
            AND b.enrichment_status = 'complete'
        )
      )
  `);

  console.log("\nQueue claimability:");
  console.table([
    { label: "claimable_now", count: claimableRows[0].count },
    { label: "stale_queued", count: staleQueuedRows[0].count },
  ]);

  const [staleDetailRows] = await conn.query(`
    SELECT
      j.id,
      j.attempts,
      j.next_run_at,
      j.error_message,
      p.name,
      p.platform,
      COALESCE(b.enrichment_status, 'not_enriched') AS enrichment_status
    FROM review_enrichment_jobs j
    JOIN products p ON p.id = j.product_id
    LEFT JOIN product_review_briefs b ON b.product_id = j.product_id
    WHERE j.status = 'queued'
      AND (
        j.next_run_at > NOW()
        OR j.attempts >= 10
        OR b.enrichment_status = 'complete'
      )
    ORDER BY j.next_run_at ASC, j.id ASC
    LIMIT 25
  `);

  if (staleDetailRows.length) {
    console.log("\nStale queued jobs (not claimable or already enriched):");
    console.table(staleDetailRows);
  }

  const [todoRows] = await conn.query(`
    SELECT 
      p.id,
      p.name,
      COALESCE(b.enrichment_status, 'not_enriched') AS enrichment_status,
      COALESCE(b.source_count, 0) AS source_count
    FROM products p
    LEFT JOIN product_review_briefs b ON b.product_id = p.id
    WHERE b.product_id IS NULL
       OR b.enrichment_status <> 'complete'
    ORDER BY p.lastUpdatedAt DESC
    LIMIT 100;
  `);

  console.log("\nProducts still needing enrichment:");
  console.table(todoRows);
} finally {
  await conn.end();
}
