#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import mysql from "mysql2/promise";
import { chromium } from "playwright";

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

const DATABASE_URL = process.env.DATABASE_URL;
const DIGISTORE24_ID = process.env.DIGISTORE24_ID || "UnlovedProducts";
const PROFILE_DIR = process.env.DIGISTORE24_BROWSER_PROFILE || "/home/unloved/.config/unloved-digistore24-browser";
const LIMIT = Number(arg("--limit", "50"));
const QUERY = arg("--query", "");
const HEADLESS = process.argv.includes("--headless");

if (!DATABASE_URL) {
  console.error("DATABASE_URL missing from APF .env");
  process.exit(1);
}

function arg(name, fallback = "") {
  const i = process.argv.indexOf(name);
  return i === -1 ? fallback : (process.argv[i + 1] || fallback);
}

function clean(v, max = 2000) {
  return String(v || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function extractDetailId(url) {
  const m = String(url || "").match(/\/affiliate\/account\/marketplace\/[^/]+\/detail\/(\d+)/i);
  return m ? m[1] : "";
}

function hashId(value) {
  return "ds24_" + crypto.createHash("sha1").update(String(value)).digest("hex").slice(0, 14);
}

function findAffiliateUrl(urls) {
  return urls.find(u =>
    /checkout-ds24\.com\/redir/i.test(u) ||
    /#aff=UnlovedProducts/i.test(u) ||
    /[?&]aff=UnlovedProducts/i.test(u)
  ) || "";
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
    )
  `);
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
  } catch {}
}

async function upsertProduct(conn, item) {
  const productColumns = await columns(conn, "products");

  const platformProductId = item.platformProductId || hashId(item.detailUrl || item.affiliateLink || item.name);
  const affiliateLink = item.affiliateLink || "";
  const status = affiliateLink ? "approved" : "needs_approval";

  const [existing] = await conn.query(`
    SELECT id
    FROM products
    WHERE platform='digistore24' AND platformProductId=?
    LIMIT 1
  `, [platformProductId]);

  let productId;

  if (existing.length) {
    productId = existing[0].id;

    await conn.query(`
      UPDATE products
      SET name=?, vendor=?, category=?, description=?, affiliateLink=COALESCE(NULLIF(?, ''), affiliateLink),
          keywords=?, lastUpdatedAt=NOW()
      WHERE id=?
    `, [
      item.name,
      item.vendor,
      item.category,
      item.description,
      affiliateLink,
      `${item.name}, ${item.category}, Digistore24, review, pros and cons`,
      productId
    ]);
  } else {
    const data = {
      platform: "digistore24",
      platformProductId,
      name: item.name,
      vendor: item.vendor || "digistore24",
      category: item.category || "Digistore24",
      keywords: `${item.name}, ${item.category || "Digistore24"}, Digistore24, review, pros and cons`,
      description: item.description || "",
      saleCount: 0,
      aggregateSales: 0,
      refundCount: 0,
      commissionRate: null,
      commissionType: "affiliate",
      affiliateLink,
      hiddenGemScore: 0,
      scoreComponents: JSON.stringify({
        marketplace: "digistore24",
        source: "digistore24_browser_collector",
        affiliate_id: DIGISTORE24_ID,
        detail_url: item.detailUrl || "",
        affiliate_status: status
      }),
      createdAt: new Date(),
      platformCreatedAt: new Date(),
      lastUpdatedAt: new Date()
    };

    if (productColumns.includes("userId")) {
      const userId = await firstUserId(conn);
      if (!userId) throw new Error("products.userId exists but no users row was found. Open/login to APF once, then rerun.");
      data.userId = userId;
    }

    const keys = Object.keys(data).filter(k => productColumns.includes(k));
    const placeholders = keys.map(() => "?").join(", ");
    const sql = `INSERT INTO products (${keys.map(k => `\`${k}\``).join(", ")}) VALUES (${placeholders})`;
    const [result] = await conn.query(sql, keys.map(k => data[k]));
    productId = result.insertId;
  }

  await conn.query(`
    INSERT INTO product_affiliate_links
    (product_id, provider, affiliate_nickname, vendor_nickname, platform_product_id, affiliate_url, campaign_key, status, notes)
    VALUES (?, 'digistore24', ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      vendor_nickname=VALUES(vendor_nickname),
      platform_product_id=VALUES(platform_product_id),
      affiliate_url=VALUES(affiliate_url),
      campaign_key=VALUES(campaign_key),
      status=VALUES(status),
      notes=VALUES(notes),
      updated_at=NOW()
  `, [
    productId,
    DIGISTORE24_ID,
    item.vendor || "",
    platformProductId,
    affiliateLink || item.detailUrl || "",
    `apf_${platformProductId}`.slice(0, 80),
    status,
    status === "approved" ? "Collected affiliate/promolink from logged-in Digistore24 browser session" : "Collected marketplace product; approval/promolink still needed"
  ]);

  await queueReview(conn, productId);

  return {
    apf_product_id: productId,
    status,
    platformProductId,
    name: item.name,
    affiliateLink: affiliateLink || "(needs approval/promolink)"
  };
}

async function collectFromMarketplace(page) {
  const marketplaceUrl = "https://www.digistore24-app.com/app/en/affiliate/account/marketplace/all";

  await page.goto(marketplaceUrl, { waitUntil: "domcontentloaded", timeout: 60000 });

  if (/login/i.test(page.url())) {
    console.log("");
    console.log("Digistore24 login page opened.");
    console.log("Log in inside the browser window. Then return here and press Enter.");
    await new Promise(resolve => process.stdin.once("data", resolve));
    await page.goto(marketplaceUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  }

  await page.waitForTimeout(3000);

  if (QUERY) {
    const searchBox = await page.locator('input[type="search"], input[placeholder*="Search" i], input[name*="search" i]').first();
    if (await searchBox.count()) {
      await searchBox.fill(QUERY);
      await searchBox.press("Enter");
      await page.waitForTimeout(3000);
    }
  }

  for (let i = 0; i < 8; i++) {
    await page.mouse.wheel(0, 2500);
    await page.waitForTimeout(1000);
  }

  const detailLinks = await page.evaluate(() => {
    const out = [];
    for (const a of document.querySelectorAll("a[href]")) {
      const href = new URL(a.getAttribute("href"), location.href).href;
      if (/\/affiliate\/account\/marketplace\/[^/]+\/detail\/\d+/i.test(href)) {
        const box = a.closest("tr, article, section, div") || a;
        out.push({
          detailUrl: href,
          text: (box.innerText || a.innerText || "").trim().slice(0, 2000)
        });
      }
    }
    const seen = new Set();
    return out.filter(x => {
      if (seen.has(x.detailUrl)) return false;
      seen.add(x.detailUrl);
      return true;
    });
  });

  return detailLinks.slice(0, LIMIT);
}

async function enrichDetail(page, item) {
  await page.goto(item.detailUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2000);

  const data = await page.evaluate((affiliateId) => {
    const allLinks = [...document.querySelectorAll("a[href], input[value], textarea")]
      .map(el => el.href || el.value || el.textContent || "")
      .filter(Boolean);

    const title =
      document.querySelector("h1")?.innerText ||
      document.querySelector("h2")?.innerText ||
      document.title ||
      "";

    const body = document.body?.innerText || "";

    const affiliateLink = allLinks.find(v =>
      /checkout-ds24\.com\/redir/i.test(v) ||
      new RegExp(`#aff=${affiliateId}`, "i").test(v) ||
      new RegExp(`[?&]aff=${affiliateId}`, "i").test(v)
    ) || "";

    return {
      title: title.trim(),
      body: body.slice(0, 4000),
      affiliateLink
    };
  }, DIGISTORE24_ID);

  const lines = clean(item.text || data.body, 2000).split(/\n| {2,}/).map(s => clean(s)).filter(Boolean);
  const name = clean(data.title || lines[0] || `Digistore24 Product ${extractDetailId(item.detailUrl)}`, 255);

  return {
    platformProductId: extractDetailId(item.detailUrl),
    detailUrl: item.detailUrl,
    name,
    vendor: "digistore24",
    category: "Digistore24",
    description: clean(lines.slice(1, 8).join(" "), 2000),
    affiliateLink: clean(data.affiliateLink, 2000)
  };
}

async function main() {
  console.log("Starting Digistore24 browser collector.");
  console.log("Browser profile:", PROFILE_DIR);
  console.log("Limit:", LIMIT);
  if (QUERY) console.log("Query:", QUERY);

  const browser = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: HEADLESS,
    viewport: { width: 1440, height: 1000 }
  });

  const page = browser.pages()[0] || await browser.newPage();

  try {
    const links = await collectFromMarketplace(page);
    console.log(`Found marketplace detail links: ${links.length}`);

    const conn = await mysql.createConnection(DATABASE_URL);
    await ensureTables(conn);

    try {
      const output = [];

      for (const item of links) {
        const detail = await enrichDetail(page, item);
        output.push(await upsertProduct(conn, detail));
      }

      console.table(output);
      console.log("");
      console.log("Done.");
      console.log("Products with affiliate links are ready for review enrichment.");
      console.log("Products marked needs_approval need Promote Now/approval in Digistore24, but APF has still captured the product.");
      console.log("");
      console.log("Next:");
      console.log("  pnpm run review:once");
      console.log("  pnpm run shadowcast:export-ui");
    } finally {
      await conn.end();
    }
  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
