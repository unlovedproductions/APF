#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import mysql from "mysql2/promise";
import { buildPayload, loadEnv } from "./shadowcast-direct-lib.mjs";

loadEnv(path.resolve(process.cwd(), ".env"));

const productId = process.argv[2];
const force = process.argv.includes("--force");

function allowDegradedExport() {
  const v = String(process.env.APF_ALLOW_DEGRADED_EXPORT || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function isEnrichmentExportReady(status) {
  if (status === "complete") return true;
  if (status === "complete_degraded" && allowDegradedExport()) return true;
  return false;
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL missing.");
  process.exit(1);
}
if (!productId) {
  console.error("Usage: pnpm run export:shadowcast <product_id> [--force]");
  process.exit(1);
}

async function enrichmentStatus(id) {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    const [rows] = await conn.query(
      `SELECT COALESCE(b.enrichment_status, 'pending') AS status
       FROM products p
       LEFT JOIN product_review_briefs b ON b.product_id = p.id
       WHERE p.id=? LIMIT 1`,
      [id],
    );
    return String(rows[0]?.status || "pending");
  } finally {
    await conn.end();
  }
}

async function main() {
  const status = await enrichmentStatus(Number(productId));
  if (!force && !isEnrichmentExportReady(status)) {
    console.error(
      `Review enrichment is not export-ready (status=${status}). `
      + `Need status=complete (or complete_degraded with APF_ALLOW_DEGRADED_EXPORT=1). `
      + `Use --force to write anyway.`,
    );
    process.exit(1);
  }
  if (status === "complete_degraded" && !force) {
    console.warn(
      `Warning: exporting complete_degraded brief (APF_ALLOW_DEGRADED_EXPORT enabled).`,
    );
  }

  const payload = await buildPayload(Number(productId));
  const safe = String(payload?.product?.name || `product_${productId}`).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const outDir = path.resolve(process.cwd(), "exports");
  fs.mkdirSync(outDir, {recursive: true});
  const out = path.join(outDir, `${safe || "product"}_shadowcast_enriched.json`);
  fs.writeFileSync(out, JSON.stringify(payload, null, 2));
  console.log(out);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
