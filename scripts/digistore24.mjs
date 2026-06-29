#!/usr/bin/env node
import fs from "node:fs";
import process from "node:process";
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

const DATABASE_URL = process.env.DATABASE_URL;
const DIGISTORE24_ID = process.env.DIGISTORE24_ID || "UnlovedProducts";
const CAMPAIGN_PREFIX = process.env.DIGISTORE24_CAMPAIGN_PREFIX || "apf";
const BASE = (process.env.DIGISTORE24_PROMOLINK_BASE_URL || "https://www.checkout-ds24.com/redir").replace(/\/+$/, "");

if (!DATABASE_URL) {
  console.error("DATABASE_URL missing from .env");
  process.exit(1);
}

function arg(name, fallback = "") {
  const i = process.argv.indexOf(name);
  if (i === -1) return fallback;
  return process.argv[i + 1] || fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function cleanId(value) {
  return String(value || "").trim().replace(/[^0-9]/g, "");
}

function cleanText(value, max = 255) {
  return String(value || "").trim().slice(0, max);
}

function campaignKey(productOrDsId) {
  return `${CAMPAIGN_PREFIX}_${String(productOrDsId).replace(/[^A-Za-z0-9_-]/g, "_")}`.slice(0, 80);
}

function buildPromolink(dsProductId, campaign = "") {
  const id = cleanId(dsProductId);
  if (!id) return "";

  const camp = campaign || campaignKey(id);
  return `${BASE}/${encodeURIComponent(id)}/${encodeURIComponent(DIGISTORE24_ID)}/${encodeURIComponent(camp)}`;
}

async function ensureTables(conn) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS product_affiliate_links (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      product_id BIGINT NOT NULL,
      provider VARCHAR(32) NOT NULL,
      affiliate_nickname VARCHAR(100) NOT NULL,
      vendor_nickname VARCHAR(100),
      platform_product_id VARCHAR(100),
      affiliate_url TEXT NOT NULL,
      campaign_key VARCHAR(120),
      status VARCHAR(32) NOT NULL DEFAULT 'generated',
      notes TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_product_provider_affiliate (product_id, provider, affiliate_nickname),
      INDEX idx_product_affiliate_links_product (product_id),
      INDEX idx_product_affiliate_links_provider (provider),
      INDEX idx_product_affiliate_links_status (status)
    );
  `);
}

async function columns(conn, table) {
  const [rows] = await conn.query(`SHOW COLUMNS FROM \`${table}\``);
  return rows.map(r => r.Field);
}

async function firstUserId(conn) {
  try {
    const [rows] = await conn.query(`SELECT id FROM users ORDER BY createdAt ASC LIMIT 1`);
    return rows[0]?.id || null;
  } catch {
    return null;
  }
}

async function queueReview(conn, productId) {
  try {
    await conn.query(`
      INSERT INTO review_enrichment_jobs (product_id, status, next_run_at)
      VALUES (?, 'queued', NOW())
      ON DUPLICATE KEY UPDATE
        status = CASE
          WHEN status IN ('complete','failed','pending_api_key') THEN 'queued'
          ELSE status
        END,
        next_run_at = NOW(),
        updated_at = NOW()
    `, [productId]);
  } catch {
    // Review enrichment tables may not exist yet. Ignore safely.
  }
}

async function saveAffiliateLink(conn, product, force = false) {
  const dsProductId = cleanId(product.platformProductId);
  if (!dsProductId) {
    return {
      id: product.id,
      name: product.name,
      platformProductId: product.platformProductId,
      status: "missing_digistore24_product_id"
    };
  }

  const campaign = campaignKey(product.id || dsProductId);
  const link = buildPromolink(dsProductId, campaign);

  await conn.query(`
    INSERT INTO product_affiliate_links
    (product_id, provider, affiliate_nickname, vendor_nickname, platform_product_id, affiliate_url, campaign_key, status, notes)
    VALUES (?, 'digistore24', ?, ?, ?, ?, ?, 'generated', 'Generated locally by APF')
    ON DUPLICATE KEY UPDATE
      vendor_nickname=VALUES(vendor_nickname),
      platform_product_id=VALUES(platform_product_id),
      affiliate_url=VALUES(affiliate_url),
      campaign_key=VALUES(campaign_key),
      status='generated',
      notes=VALUES(notes),
      updated_at=NOW()
  `, [
    product.id,
    DIGISTORE24_ID,
    product.vendor || "",
    dsProductId,
    link,
    campaign
  ]);

  let productUpdated = false;

  if (force || !product.affiliateLink || !String(product.affiliateLink).trim()) {
    await conn.query(`
      UPDATE products
      SET affiliateLink=?, platform='digistore24', lastUpdatedAt=NOW()
      WHERE id=?
    `, [link, product.id]);

    productUpdated = true;
  }

  return {
    id: product.id,
    name: product.name,
    platformProductId: dsProductId,
    campaign,
    affiliateLink: link,
    status: productUpdated ? "products.affiliateLink_updated" : "generated_saved_existing_product_link_kept"
  };
}

async function listDigistoreProducts(conn, onlyMissing = false) {
  const [rows] = await conn.query(`
    SELECT
      id,
      platform,
      platformProductId,
      name,
      vendor,
      category,
      affiliateLink,
      hiddenGemScore,
      lastUpdatedAt,
      createdAt
    FROM products
    WHERE
      LOWER(COALESCE(platform, '')) IN ('digistore24','digistore','ds24')
      OR affiliateLink LIKE '%checkout-ds24.com%'
      OR affiliateLink LIKE '%digistore24%'
    ORDER BY COALESCE(lastUpdatedAt, createdAt) DESC, id DESC
    LIMIT 500
  `);

  if (!onlyMissing) return rows;

  return rows.filter(p => !p.affiliateLink || !String(p.affiliateLink).includes("checkout-ds24.com"));
}

async function addProduct(conn) {
  const dsProductId = cleanId(arg("--ds-product-id") || arg("--product-id"));
  const name = cleanText(arg("--name"));
  const vendor = cleanText(arg("--vendor", "digistore24"));
  const category = cleanText(arg("--category", "Digistore24"));
  const description = cleanText(arg("--description", ""), 2000);

  if (!dsProductId || !name) {
    console.error(`Usage:
  pnpm run digistore24:add -- --ds-product-id 220831 --name "Product Name" --vendor "Vendor" --category "Category"

Required:
  --ds-product-id
  --name`);
    process.exit(1);
  }

  const [existing] = await conn.query(`
    SELECT id, name, platformProductId, affiliateLink, vendor, category
    FROM products
    WHERE platform='digistore24' AND platformProductId=?
    LIMIT 1
  `, [dsProductId]);

  if (existing.length) {
    const p = existing[0];
    const result = await saveAffiliateLink(conn, p, true);
    await queueReview(conn, p.id);
    console.log("Existing Digistore24 product found and updated:");
    console.table([result]);
    return;
  }

  const productColumns = await columns(conn, "products");
  const userId = productColumns.includes("userId") ? await firstUserId(conn) : null;

  const data = {
    platform: "digistore24",
    platformProductId: dsProductId,
    name,
    vendor,
    category,
    keywords: `${name}, ${category}, Digistore24, review, pros and cons`,
    description,
    saleCount: 0,
    aggregateSales: 0,
    refundCount: 0,
    commissionRate: null,
    commissionType: "affiliate",
    affiliateLink: buildPromolink(dsProductId, campaignKey(dsProductId)),
    hiddenGemScore: 0,
    scoreComponents: JSON.stringify({
      marketplace: "digistore24",
      source: "manual_add",
      affiliate_id: DIGISTORE24_ID
    }),
    createdAt: new Date(),
    platformCreatedAt: new Date(),
    lastUpdatedAt: new Date()
  };

  if (productColumns.includes("userId")) {
    if (!userId) {
      throw new Error("products.userId exists but no users row was found. Create/login to APF once, then rerun this.");
    }
    data.userId = userId;
  }

  const keys = Object.keys(data).filter(k => productColumns.includes(k));
  const placeholders = keys.map(() => "?").join(", ");
  const sql = `INSERT INTO products (${keys.map(k => `\`${k}\``).join(", ")}) VALUES (${placeholders})`;

  const [result] = await conn.query(sql, keys.map(k => data[k]));
  const apfProductId = result.insertId;

  const [rows] = await conn.query(`SELECT * FROM products WHERE id=? LIMIT 1`, [apfProductId]);
  const saved = await saveAffiliateLink(conn, rows[0], true);
  await queueReview(conn, apfProductId);

  console.log("Added Digistore24 product to APF:");
  console.table([saved]);
  console.log("");
  console.log("Review enrichment was queued for this product.");
}

async function applyLinks(conn) {
  const force = hasFlag("--force");
  const onlyMissing = hasFlag("--missing");
  const productId = arg("--apf-product-id") || arg("--id");

  let rows;

  if (productId) {
    const [one] = await conn.query(`SELECT * FROM products WHERE id=? LIMIT 1`, [productId]);
    rows = one;
  } else {
    rows = await listDigistoreProducts(conn, onlyMissing);
  }

  const output = [];
  for (const p of rows) {
    output.push(await saveAffiliateLink(conn, p, force));
  }

  console.table(output);

  if (!output.length) {
    console.log("No Digistore24 products found yet.");
    console.log("");
    console.log("Add one manually:");
    console.log('  pnpm run digistore24:add -- --ds-product-id 220831 --name "Product Name" --vendor "Vendor" --category "Category"');
  }
}

async function preview(conn) {
  const rows = await listDigistoreProducts(conn, false);

  const output = rows.map(p => {
    const dsProductId = cleanId(p.platformProductId);
    const campaign = campaignKey(p.id || dsProductId);

    return {
      id: p.id,
      name: p.name,
      platform: p.platform,
      platformProductId: p.platformProductId,
      currentAffiliateLink: p.affiliateLink || "",
      generatedPromolink: dsProductId ? buildPromolink(dsProductId, campaign) : "",
      status: dsProductId ? "ready" : "missing_digistore24_product_id"
    };
  });

  console.table(output);

  if (!output.length) {
    console.log("No Digistore24 products found yet.");
    console.log("");
    console.log("Add one:");
    console.log('  pnpm run digistore24:add -- --ds-product-id 220831 --name "Product Name" --vendor "Vendor" --category "Category"');
  }
}

async function status(conn) {
  const [rows] = await conn.query(`
    SELECT
      p.id,
      p.name,
      p.platform,
      p.platformProductId,
      p.affiliateLink,
      l.status AS link_status,
      l.affiliate_url AS generated_url,
      l.campaign_key
    FROM products p
    LEFT JOIN product_affiliate_links l
      ON l.product_id = p.id
     AND l.provider = 'digistore24'
     AND l.affiliate_nickname = ?
    WHERE
      LOWER(COALESCE(p.platform, '')) IN ('digistore24','digistore','ds24')
      OR p.affiliateLink LIKE '%checkout-ds24.com%'
      OR l.provider = 'digistore24'
    ORDER BY p.id DESC
    LIMIT 500
  `, [DIGISTORE24_ID]);

  console.table(rows);
}

async function main() {
  const conn = await mysql.createConnection(DATABASE_URL);

  try {
    await ensureTables(conn);

    if (hasFlag("--add")) {
      await addProduct(conn);
      return;
    }

    if (hasFlag("--apply")) {
      await applyLinks(conn);
      return;
    }

    if (hasFlag("--status")) {
      await status(conn);
      return;
    }

    await preview(conn);
    console.log("");
    console.log("Preview only.");
    console.log("Save generated Digistore24 links:");
    console.log("  pnpm run digistore24:links -- --apply");
    console.log("");
    console.log("Overwrite existing Digistore24 product affiliate links:");
    console.log("  pnpm run digistore24:links -- --apply --force");
  } finally {
    await conn.end();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
