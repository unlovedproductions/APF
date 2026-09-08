#!/usr/bin/env node
/**
 * Refresh Digistore products.name from vendor materials when still a marketplace placeholder.
 *
 * Usage:
 *   pnpm digistore:refresh-names
 *   pnpm digistore:refresh-names --product-id 11
 *   pnpm digistore:refresh-names --dry-run
 */
import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";
import {
  isMarketplaceBrandName,
  needsDigistoreNameRefresh,
  resolveExportProductName,
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
      SELECT id, name, platformProductId, affiliateLink
      FROM products
      WHERE platform='digistore24'
    `;
    if (productId > 0) {
      sql += ` AND id=?`;
      params.push(productId);
    }
    sql += ` ORDER BY id ASC`;
    const [products] = await conn.query(sql, params);

    const updates = [];
    let placeholders = 0;
    let commissionTitles = 0;
    for (const product of products) {
      const [materials] = await conn.query(
        `SELECT title, source_type FROM product_vendor_materials WHERE product_id=? ORDER BY id ASC`,
        [product.id],
      );
      if (isMarketplaceBrandName(product.name)) placeholders += 1;
      if (needsDigistoreNameRefresh(product, materials || []) && /^earn\s+\d+%?\s*commission\s+promoting\b/i.test(String(product.name || ""))) {
        commissionTitles += 1;
      }
      if (!needsDigistoreNameRefresh(product, materials || [])) continue;

      const resolved = resolveExportProductName(product, materials || []);
      if (!resolved || isMarketplaceBrandName(resolved) || resolved === product.name) continue;

      updates.push({
        id: product.id,
        from: product.name,
        to: String(resolved).slice(0, 255),
        materials: (materials || []).length,
      });

      if (!dryRun) {
        await conn.query(
          `UPDATE products SET name=?, lastUpdatedAt=NOW() WHERE id=? AND platform='digistore24'`,
          [String(resolved).slice(0, 255), product.id],
        );
      }
    }

    console.log(JSON.stringify({
      scanned: products.length,
      placeholders,
      commission_titles: commissionTitles,
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
