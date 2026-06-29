#!/usr/bin/env node
import fs from "node:fs";
import crypto from "node:crypto";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import mysql from "mysql2/promise";
import { chromium, firefox, webkit } from "playwright";
import { scoreProduct, SCORING_VERSION } from "./marketplace-scoring.mjs";

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

function arg(name, fallback = "") {
  const i = process.argv.indexOf(name);
  return i === -1 ? fallback : process.argv[i + 1] || fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function clean(v) {
  return String(v ?? "").replace(/\s+/g, " ").trim();
}

function finiteOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function hashId(v) {
  return crypto.createHash("sha1").update(String(v)).digest("hex").slice(0, 16);
}

function productIdFromUrl(url) {
  const s = String(url || "");
  const m =
    s.match(/\/detail\/(\d+)/i) ||
    s.match(/[?&](?:product|product_id|id)=(\d+)/i) ||
    s.match(/checkout-ds24\.com\/redir\/(\d+)\//i);
  return m ? m[1] : "";
}

function extractAffiliateLinkFromAnchors(anchors, affiliateId) {
  const aff = clean(affiliateId).toLowerCase();

  const preferred = anchors.find(a => {
    const h = clean(a.href).toLowerCase();
    return h.includes("checkout-ds24.com/redir") || h.includes(`#aff=${aff}`) || h.includes(`?aff=${aff}`) || h.includes(`&aff=${aff}`);
  });

  return preferred?.href || "";
}

async function saveDebug(page, reason) {
  fs.mkdirSync("exports", { recursive: true });

  const safeReason = reason.replace(/[^a-z0-9_-]+/gi, "_").slice(0, 80);
  const htmlPath = `exports/digistore24_debug_${safeReason}.html`;
  const pngPath = `exports/digistore24_debug_${safeReason}.png`;
  const linksPath = `exports/digistore24_debug_${safeReason}_links.json`;

  const html = await page.content();
  const anchors = await page.evaluate(() =>
    Array.from(document.querySelectorAll("a")).map(a => ({
      text: (a.innerText || a.textContent || "").replace(/\s+/g, " ").trim(),
      href: a.href
    }))
  );

  fs.writeFileSync(htmlPath, html);
  fs.writeFileSync(linksPath, JSON.stringify(anchors, null, 2));
  await page.screenshot({ path: pngPath, fullPage: true }).catch(() => {});

  console.log("");
  console.log("Debug files saved:");
  console.log(" ", htmlPath);
  console.log(" ", pngPath);
  console.log(" ", linksPath);
}

async function upsertProduct(conn, product) {
  const scored = scoreProduct({
    ...product,
    source_count: 0,
    confidence_score: 0,
    link_status: product.affiliateLink ? "approved" : "needs_approval"
  });

  const components = {
    ...scored.components,
    _meta: {
      scoring_version: SCORING_VERSION,
      marketplace: scored.marketplace,
      strategy: scored.strategy,
      collector: "digistore24_guided_collector",
      affiliate_ready: Boolean(product.affiliateLink),
      detail_url: product.detailUrl
    }
  };

  const params = [
    product.userId,
    "digistore24",
    product.platformProductId,
    product.name,
    product.vendor,
    product.category,
    JSON.stringify(product.keywords),
    product.description,
    0,
    0,
    0,
    null,
    "digistore24",
    product.affiliateLink || "",
    scored.score,
    JSON.stringify(components),
    new Date(),
    new Date()
  ].map(v => (typeof v === "number" && !Number.isFinite(v)) ? null : v);

  const [result] = await conn.query(`
    INSERT INTO products (
      userId,
      platform,
      platformProductId,
      name,
      vendor,
      category,
      keywords,
      description,
      saleCount,
      aggregateSales,
      refundCount,
      commissionRate,
      commissionType,
      affiliateLink,
      hiddenGemScore,
      scoreComponents,
      platformCreatedAt,
      dataFetchedAt
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      name=VALUES(name),
      vendor=VALUES(vendor),
      category=VALUES(category),
      keywords=VALUES(keywords),
      description=VALUES(description),
      affiliateLink=VALUES(affiliateLink),
      hiddenGemScore=VALUES(hiddenGemScore),
      scoreComponents=VALUES(scoreComponents),
      dataFetchedAt=VALUES(dataFetchedAt),
      lastUpdatedAt=NOW()
  `, params);

  const [rows] = await conn.query(`
    SELECT id FROM products
    WHERE platform='digistore24' AND platformProductId=?
    LIMIT 1
  `, [product.platformProductId]);

  const productId = rows?.[0]?.id || result.insertId;

  if (productId && product.affiliateLink) {
    await conn.query(`
      INSERT INTO product_affiliate_links (
        product_id,
        provider,
        affiliate_id,
        affiliate_url,
        status,
        created_at,
        updated_at
      )
      VALUES (?, 'digistore24', ?, ?, 'approved', NOW(), NOW())
      ON DUPLICATE KEY UPDATE
        affiliate_url=VALUES(affiliate_url),
        status='approved',
        updated_at=NOW()
    `, [
      productId,
      process.env.DIGISTORE24_ID || "UnlovedProducts",
      product.affiliateLink
    ]).catch(() => {});
  }

  if (productId) {
    await conn.query(`
      INSERT INTO review_enrichment_jobs (
        product_id,
        status,
        priority,
        created_at,
        updated_at
      )
      VALUES (?, 'queued', 5, NOW(), NOW())
      ON DUPLICATE KEY UPDATE
        updated_at=NOW()
    `, [productId]).catch(() => {});
  }

  return { productId, score: scored.score, components };
}

async function main() {
  loadEnv();

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL missing from .env");
    process.exit(1);
  }

  const limit = Number(arg("--limit", "10"));
  const affiliateId = process.env.DIGISTORE24_ID || "UnlovedProducts";
  const userId = Number(process.env.APF_USER_ID || "1");
  const startUrl = arg("--url", "https://www.digistore24-app.com/app/en/affiliate/account/marketplace/all");

  console.log("Starting guided Digistore24 collector.");
  console.log("Limit:", limit);
  console.log("Affiliate ID:", affiliateId);
  console.log("");
  console.log("A browser will open.");
  console.log("1. Log into Digistore24 completely.");
  console.log("2. Navigate to the affiliate marketplace if it does not open automatically.");
  console.log("3. Scroll/search/filter however you want.");
  console.log("4. Return here and press Enter. APF will collect visible product detail links.");
  console.log("");

  const browserName = arg("--browser", process.env.DIGISTORE24_BROWSER || "chromium").toLowerCase();

  const browserType =
    browserName === "firefox" ? firefox :
    browserName === "webkit" ? webkit :
    chromium;

  console.log("Browser:", browserName);

  const browser = await browserType.launch({
    headless: false
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 }
  });

  const page = await context.newPage();
  await page.goto(startUrl, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});

  const rl = readline.createInterface({ input, output });
  await rl.question("After you are logged in and can see marketplace products, press Enter to collect...");
  rl.close();

  await page.waitForTimeout(2000);

  // Try a few auto-scrolls to lazy-load product cards.
  for (let i = 0; i < 8; i++) {
    await page.mouse.wheel(0, 1400).catch(() => {});
    await page.waitForTimeout(700);
  }

  const anchors = await page.evaluate(() =>
    Array.from(document.querySelectorAll("a")).map(a => ({
      text: (a.innerText || a.textContent || "").replace(/\s+/g, " ").trim(),
      href: a.href
    }))
  );

  const detailLinks = [];
  const seen = new Set();

  for (const a of anchors) {
    const href = clean(a.href);
    if (!href) continue;

    const isDetail =
      /digistore24-app\.com\/app\/[^/]+\/affiliate\/account\/marketplace\/.*\/detail\/\d+/i.test(href) ||
      /\/affiliate\/account\/marketplace\/.*\/detail\/\d+/i.test(href);

    if (!isDetail) continue;

    const normalized = href.split("#")[0];
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    detailLinks.push({ href: normalized, text: clean(a.text) });
  }

  console.log("");
  console.log(`Found ${detailLinks.length} visible Digistore24 detail link(s).`);

  if (detailLinks.length === 0) {
    await saveDebug(page, "no_detail_links_found");
    console.log("");
    console.log("No products imported.");
    console.log("This means Digistore24 is using different link markup than expected, or the page was not on a marketplace listing.");
    await browser.close();
    return;
  }

  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  const imported = [];

  try {
    for (const item of detailLinks.slice(0, limit)) {
      const detailUrl = item.href;
      const platformProductId = productIdFromUrl(detailUrl) || `url-${hashId(detailUrl)}`;

      console.log("");
      console.log("Opening detail:", detailUrl);

      const detailPage = await context.newPage();
      await detailPage.goto(detailUrl, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
      await detailPage.waitForTimeout(2500);

      const detail = await detailPage.evaluate(() => {
        const txt = el => (el?.innerText || el?.textContent || "").replace(/\s+/g, " ").trim();

        const title =
          txt(document.querySelector("h1")) ||
          txt(document.querySelector("h2")) ||
          document.title.replace(/\s+/g, " ").trim();

        const body = txt(document.body).slice(0, 6000);

        const anchors = Array.from(document.querySelectorAll("a")).map(a => ({
          text: txt(a),
          href: a.href
        }));

        return { title, body, anchors };
      });

      const affiliateLink = extractAffiliateLinkFromAnchors(detail.anchors, affiliateId);

      const product = {
        userId,
        platformProductId,
        name: clean(detail.title || item.text || `Digistore24 Product ${platformProductId}`).slice(0, 255),
        vendor: "digistore24",
        category: "Digistore24 Marketplace",
        keywords: [
          "digistore24",
          ...clean(detail.title).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).slice(0, 12)
        ],
        description: clean(detail.body || `Digistore24 marketplace product ${platformProductId}`).slice(0, 3000),
        affiliateLink,
        detailUrl
      };

      const saved = await upsertProduct(conn, product);

      imported.push({
        id: saved.productId,
        platformProductId,
        name: product.name,
        score: saved.score,
        affiliate: affiliateLink ? "approved" : "needs_approval"
      });

      console.log(`Imported: ${product.name}`);
      console.log(`Score: ${saved.score}`);
      console.log(`Affiliate: ${affiliateLink ? "approved" : "needs_approval"}`);

      await detailPage.close().catch(() => {});
    }
  } finally {
    await conn.end();
    await browser.close();
  }

  console.log("");
  console.table(imported);
  console.log("");
  console.log("Done. Next run:");
  console.log("  pnpm run score:digistore24:explain");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
