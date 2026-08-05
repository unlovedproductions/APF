#!/usr/bin/env node
/**
 * Refresh Digistore buyer prices from vendor materials (honest signals only).
 *
 * Usage:
 *   pnpm digistore:refresh-prices
 *   pnpm digistore:refresh-prices --product-id 6
 *   pnpm digistore:refresh-prices --dry-run
 */
import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";
import {
  extractBuyerPriceFromVendorMaterials,
  sanitizeBuyerPrice,
} from "./digistore24-detail-extractor.mjs";

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

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL missing from .env");
    process.exit(1);
  }

  const productId = Number(arg("--product-id", "0"));
  const dryRun = hasFlag("--dry-run");
  const conn = await mysql.createConnection(process.env.DATABASE_URL);

  try {
    const params = [];
    let sql = `
      SELECT p.id, p.name, p.cartValue, b.price_display
      FROM products p
      LEFT JOIN product_review_briefs b ON b.product_id = p.id
      WHERE p.platform='digistore24'
    `;
    if (productId > 0) {
      sql += ` AND p.id=?`;
      params.push(productId);
    }
    sql += ` ORDER BY p.id ASC`;
    const [products] = await conn.query(sql, params);

    const updates = [];
    for (const product of products) {
      const current = sanitizeBuyerPrice(product.price_display || "", product.cartValue);
      const [materials] = await conn.query(
        `SELECT source_type, title, content_text FROM product_vendor_materials WHERE product_id=? ORDER BY id ASC`,
        [product.id],
      );
      const extracted = extractBuyerPriceFromVendorMaterials(materials || []);
      if (!extracted) continue;

      const currentNum = Number(String(current || "").replace(/[^0-9.]/g, ""));
      const same = current
        && current !== "See official offer page"
        && Number.isFinite(currentNum)
        && Math.abs(currentNum - Number(extracted.cartValue)) < 0.01;
      if (same) continue;

      updates.push({
        id: product.id,
        name: product.name,
        from: current || null,
        to: extracted.display,
        cartValue: extracted.cartValue,
        reason: extracted.reason,
        source: extracted.source,
      });

      if (!dryRun) {
        await conn.query(
          `UPDATE products SET cartValue=?, lastUpdatedAt=NOW() WHERE id=? AND platform='digistore24'`,
          [extracted.cartValue, product.id],
        );
        await conn.query(
          `UPDATE product_review_briefs SET price_display=?, updated_at=NOW() WHERE product_id=?`,
          [extracted.display, product.id],
        );
      }
    }

    console.log(JSON.stringify({
      scanned: products.length,
      updated: updates.length,
      dry_run: dryRun,
      updates,
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
