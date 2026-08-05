#!/usr/bin/env node
/**
 * Seed promote_result rows from Digistore marketplace EPC/refund signals found
 * in vendor materials / score meta. Notes mark listing_signal — not campaign
 * outcomes. Calibration still needs ≥3 real campaign rows to apply.
 *
 * Usage:
 *   pnpm promote:seed-listing [--dry-run] [--product-id N]
 */
import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";
import { ensurePromoteOutcomesTable, logPromoteOutcome } from "./promote-outcomes.mjs";

function loadEnv(file = ".env") {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[m[1]] ||= v;
  }
}

loadEnv();

function arg(name, fallback = "") {
  const i = process.argv.indexOf(name);
  if (i === -1) return fallback;
  return process.argv[i + 1] ?? fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function parseMeta(scoreComponents) {
  let components = scoreComponents;
  if (typeof components === "string") {
    try { components = JSON.parse(components); } catch { return {}; }
  }
  if (!components || typeof components !== "object") return {};
  return components._meta || components.meta || {};
}

function extractListingEpc(materials = []) {
  const patterns = [
    /\bEPC\s*[:\-]?\s*\$?\s*(\d+(?:\.\d{1,2})?)/i,
    /\$\s*(\d+(?:\.\d{1,2})?)\s*EPCs?\b/i,
    /Over\s+\$?\s*(\d+(?:\.\d{1,2})?)\s*EPCs?\b/i,
  ];
  for (const material of materials) {
    const text = String(material?.content_text || "");
    for (const re of patterns) {
      const m = text.match(re);
      if (!m) continue;
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > 0 && n < 500) return n;
    }
  }
  return null;
}

function extractListingRefund(materials = [], meta = {}) {
  const fromMeta = Number(meta.detected_refund_rate);
  if (Number.isFinite(fromMeta) && fromMeta > 0) return fromMeta;
  for (const material of materials) {
    const text = String(material?.content_text || "");
    const m = text.match(/refund(?:\s*rate)?[^0-9]{0,20}(\d+(?:\.\d+)?)\s*%/i);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n >= 0 && n <= 100) return n;
    }
  }
  return null;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL missing");
    process.exit(1);
  }
  const productId = Number(arg("--product-id", "0"));
  const dryRun = hasFlag("--dry-run");
  const userId = Number(arg("--user-id", process.env.APF_USER_ID || "1"));
  const conn = await mysql.createConnection(process.env.DATABASE_URL);

  try {
    await ensurePromoteOutcomesTable(conn);
    const params = [];
    let sql = `
      SELECT id, name, hiddenGemScore, scoreComponents
      FROM products WHERE platform='digistore24'
    `;
    if (productId > 0) {
      sql += ` AND id=?`;
      params.push(productId);
    }
    sql += ` ORDER BY id ASC`;
    const [products] = await conn.query(sql, params);

    const seeded = [];
    for (const product of products) {
      const [materials] = await conn.query(
        `SELECT source_type, content_text FROM product_vendor_materials WHERE product_id=? ORDER BY id ASC`,
        [product.id],
      );
      const meta = parseMeta(product.scoreComponents);
      const epc = extractListingEpc(materials || []);
      const refund = extractListingRefund(materials || [], meta);
      if (epc == null && refund == null) continue;

      const [existing] = await conn.query(
        `SELECT id FROM product_promote_outcomes
         WHERE product_id=? AND event='promote_result' AND notes LIKE 'listing_signal%'
         LIMIT 1`,
        [product.id],
      );
      if (existing.length) continue;

      const notes = "listing_signal: digistore marketplace EPC/refund (not campaign outcome); replace with real promote_result when available";
      const row = {
        productId: product.id,
        name: product.name,
        netEpc: epc,
        refundRate: refund,
        notes,
      };
      seeded.push(row);
      if (!dryRun) {
        await logPromoteOutcome(conn, {
          userId,
          productId: product.id,
          event: "promote_result",
          netEpc: epc,
          refundRate: refund,
          hiddenGemScore: product.hiddenGemScore,
          notes,
        });
      }
    }

    console.log(JSON.stringify({
      scanned: products.length,
      seeded: seeded.length,
      dry_run: dryRun,
      rows: seeded,
      note: "Calibration still gated until ≥3 campaign promote_result rows per product.",
    }, null, 2));
  } finally {
    await conn.end();
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
