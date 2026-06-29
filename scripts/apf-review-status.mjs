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
