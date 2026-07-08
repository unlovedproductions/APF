#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";
import { sendToShadowCast } from "./shadowcast-direct-lib.mjs";

function loadEnv(file = ".env") {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}

loadEnv(path.resolve(process.cwd(), ".env"));

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL missing.");
  process.exit(1);
}

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  const [rows] = await conn.query(`
    SELECT id, platform, name, hiddenGemScore
    FROM products
    WHERE platform IN ('clickbank','digistore24')
    ORDER BY
      CASE WHEN platform='clickbank' THEN 0 ELSE 1 END,
      COALESCE(lastUpdatedAt, createdAt) DESC
    LIMIT 1
  `);
  await conn.end();
  if (!rows.length) {
    throw new Error("No products found. Run a ClickBank or Digistore24 refresh first.");
  }

  const row = rows[0];
  const productId = Number(row.id);
  const score = Number(row.hiddenGemScore || 0);
  if (!Number.isFinite(score) || score <= 0) {
    throw new Error(`Score check failed for product ${productId} (${row.platform}). Run scoring backfill first.`);
  }

  const response = await sendToShadowCast(productId);
  if (!response?.open_url) {
    throw new Error("ShadowCast response did not include open_url.");
  }
  console.log(`Smoke test passed for product ${productId} (${row.platform})`);
  console.log(`Score check passed: ${score.toFixed(1)}/100`);
  console.log(`Draft URL: ${response.open_url}`);
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
