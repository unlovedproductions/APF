#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";
import {
  ensureVendorMaterialsTable,
  upsertVendorMaterial,
  extractBuyerFacingBlocks,
} from "./digistore24-vendor-materials.mjs";

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
  try {
    await ensureVendorMaterialsTable(conn);

    const [products] = await conn.query(`
      SELECT id, name, description, affiliateLink, category
      FROM products
      WHERE platform='digistore24'
      ORDER BY id ASC
    `);

    let requeued = 0;
    let seededMaterials = 0;
    for (const p of products) {
      const [existing] = await conn.query(
        `SELECT COUNT(*) AS n FROM product_vendor_materials WHERE product_id=?`,
        [p.id]
      );
      if (!existing[0]?.n) {
        const description = String(p.description || p.name || "").trim();
        if (description) {
          await upsertVendorMaterial(conn, {
            productId: p.id,
            sourceUrl: p.affiliateLink || `digistore24:product:${p.id}`,
            sourceType: p.affiliateLink ? "sales_page" : "offer_page",
            title: p.name,
            contentText: description,
            structuredBlocks: extractBuyerFacingBlocks(description),
            isVendorHosted: Boolean(p.affiliateLink),
            fetchStatus: p.affiliateLink ? "seeded_from_product" : "seeded_from_offer",
          });
          seededMaterials += 1;
        }
      }

      await conn.query(`
        INSERT INTO review_enrichment_jobs (product_id, status, next_run_at)
        VALUES (?, 'queued', NOW())
        ON DUPLICATE KEY UPDATE
          status='queued',
          next_run_at=NOW(),
          error_message=NULL,
          updated_at=NOW()
      `, [p.id]);
      requeued += 1;
    }

    console.log(JSON.stringify({
      digistore24_products: products.length,
      seeded_vendor_materials: seededMaterials,
      requeued_jobs: requeued,
      next: "Run pnpm review:worker or pnpm review:once until Digistore briefs refresh",
    }, null, 2));
  } finally {
    await conn.end();
  }
}

main().catch(err => {
  console.error(err?.message || err);
  process.exit(1);
});
