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

async function extractPromolinksFromPage(page, affiliateId) {
  const aff = clean(affiliateId).toLowerCase();

  const fromDom = await page.evaluate((affArg) => {
    const clean = v => String(v ?? "").replace(/\s+/g, " ").trim();
    const raw = [];

    for (const a of Array.from(document.querySelectorAll("a"))) {
      raw.push(a.href || "");
      raw.push(a.innerText || "");
      raw.push(a.textContent || "");
      raw.push(a.getAttribute("href") || "");
    }

    for (const input of Array.from(document.querySelectorAll("input, textarea"))) {
      raw.push(input.value || "");
      raw.push(input.placeholder || "");
      raw.push(input.getAttribute("value") || "");
    }

    for (const el of Array.from(document.querySelectorAll("[data-clipboard-text], [data-copy], [data-url], [data-link]"))) {
      raw.push(el.getAttribute("data-clipboard-text") || "");
      raw.push(el.getAttribute("data-copy") || "");
      raw.push(el.getAttribute("data-url") || "");
      raw.push(el.getAttribute("data-link") || "");
      raw.push(el.textContent || "");
    }

    raw.push(document.body?.innerText || "");
    raw.push(document.body?.textContent || "");

    const text = raw.join("\n");

    const urls = [];

    for (const m of text.matchAll(/https?:\/\/[^\s"'<>]+/gi)) {
      urls.push(m[0]);
    }

    for (const m of text.matchAll(/www\.[^\s"'<>]+/gi)) {
      urls.push("https://" + m[0]);
    }

    return Array.from(new Set(urls.map(u => u.replace(/[),.;\]]+$/g, "")))).filter(url => {
      const u = url.toLowerCase();

      return (
        u.includes("checkout-ds24.com/redir") ||
        u.includes(`#aff=${affArg}`) ||
        u.includes(`?aff=${affArg}`) ||
        u.includes(`&aff=${affArg}`) ||
        u.includes(`affiliate=${affArg}`) ||
        u.includes(`aff=${affArg}`) ||
        u.includes(encodeURIComponent(`#aff=${affArg}`))
      );
    });
  }, aff);

  let fromClipboard = [];

  try {
    const clip = await page.evaluate(async () => {
      if (!navigator.clipboard || !navigator.clipboard.readText) return "";
      return await navigator.clipboard.readText();
    });

    if (clip) {
      const urls = Array.from(String(clip).matchAll(/https?:\/\/[^\s"'<>]+/gi)).map(m => m[0]);
      fromClipboard = urls.filter(url => {
        const u = url.toLowerCase();
        return (
          u.includes("checkout-ds24.com/redir") ||
          u.includes(`#aff=${aff}`) ||
          u.includes(`?aff=${aff}`) ||
          u.includes(`&aff=${aff}`) ||
          u.includes(`aff=${aff}`)
        );
      });
    }
  } catch {}

  return Array.from(new Set([...fromDom, ...fromClipboard]));
}

async function savePromoteDebug(page, productId, reason) {
  try {
    fs.mkdirSync("exports", { recursive: true });

    const safe = String(productId || "unknown").replace(/[^a-z0-9_-]+/gi, "_");
    const base = `exports/digistore24_promote_debug_${safe}_${reason}`;

    const anchors = await page.evaluate(() =>
      Array.from(document.querySelectorAll("a")).map(a => ({
        text: (a.innerText || a.textContent || "").replace(/\s+/g, " ").trim(),
        href: a.href,
        rawHref: a.getAttribute("href")
      }))
    );

    const fields = await page.evaluate(() =>
      Array.from(document.querySelectorAll("input, textarea, button, [role='button'], [data-clipboard-text]")).map(el => ({
        tag: el.tagName,
        type: el.getAttribute("type"),
        text: (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim(),
        value: el.value || el.getAttribute("value") || "",
        placeholder: el.getAttribute("placeholder") || "",
        dataClipboardText: el.getAttribute("data-clipboard-text") || "",
        ariaLabel: el.getAttribute("aria-label") || ""
      }))
    );

    fs.writeFileSync(`${base}.html`, await page.content());
    fs.writeFileSync(`${base}_anchors.json`, JSON.stringify(anchors, null, 2));
    fs.writeFileSync(`${base}_fields.json`, JSON.stringify(fields, null, 2));
    await page.screenshot({ path: `${base}.png`, fullPage: true }).catch(() => {});

    console.log("Promote debug saved:");
    console.log(`  ${base}.html`);
    console.log(`  ${base}.png`);
    console.log(`  ${base}_anchors.json`);
    console.log(`  ${base}_fields.json`);
  } catch (err) {
    console.warn("Could not save promote debug:", err?.message || err);
  }
}


async function clickVisibleText(page, patterns, timeoutMs = 2500) {
  for (const pattern of patterns) {
    try {
      const locator = page.getByText(pattern, { exact: false }).first();
      await locator.click({ timeout: timeoutMs });
      return String(pattern);
    } catch {}
  }

  try {
    const clicked = await page.evaluate((patternStrings) => {
      const patterns = patternStrings.map(s => new RegExp(s, "i"));
      const candidates = Array.from(document.querySelectorAll("button, a, input[type='button'], input[type='submit'], [role='button']"));

      for (const el of candidates) {
        const text = `${el.innerText || ""} ${el.textContent || ""} ${el.value || ""} ${el.ariaLabel || ""}`.replace(/\s+/g, " ").trim();

        if (!text) continue;
        if (!patterns.some(re => re.test(text))) continue;

        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) continue;

        el.click();
        return text;
      }

      return "";
    }, patterns.map(p => p.source || String(p)));

    if (clicked) return clicked;
  } catch {}

  return "";
}

async function maybePromoteAndExtractLink(page, affiliateId) {
  const shouldPromote =
    hasFlag("--promote") ||
    process.env.DIGISTORE24_AUTO_PROMOTE === "true" ||
    process.env.DIGISTORE24_AUTO_PROMOTE === "1";

  const shouldConfirm =
    hasFlag("--confirm-promote") ||
    process.env.DIGISTORE24_CONFIRM_PROMOTE === "true" ||
    process.env.DIGISTORE24_CONFIRM_PROMOTE === "1";

  const result = {
    attempted: false,
    confirmed: false,
    affiliateLink: "",
    status: "not_attempted",
    clicked: []
  };

  let links = await extractPromolinksFromPage(page, affiliateId);
  if (links.length) {
    result.affiliateLink = links[0];
    result.status = "approved";
    return result;
  }

  if (!shouldPromote) {
    result.status = "promote_disabled";
    return result;
  }

  result.attempted = true;

  for (let step = 0; step < 5; step++) {
    links = await extractPromolinksFromPage(page, affiliateId);
    if (links.length) break;

    const clicked = await clickVisibleText(page, [
      /copy promolink/i,
      /copy link/i,
      /copy/i,
      /show promolink/i,
      /show link/i,
      /open promolink/i,
      /promolink/i,
      /promote now/i,
      /promote/i,
      /request promolink/i,
      /get promolink/i,
      /request affiliate link/i,
      /request partnership/i,
      /^confirm$/i,
      /confirm/i,
      /yes/i,
      /i agree/i,
      /accept/i,
      /request now/i,
      /request approval/i,
      /start promoting/i
    ], 1800);

    if (clicked) {
      result.clicked.push(clicked);
      if (/confirm|yes|agree|accept|request|start/i.test(clicked)) {
        result.confirmed = true;
      }
    }

    if (shouldConfirm) {
      try {
        await page.evaluate(() => {
          const boxes = Array.from(document.querySelectorAll("input[type='checkbox']"));
          for (const box of boxes) {
            const rect = box.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0 && !box.checked) box.click();
          }
        });
      } catch {}
    }

    await page.waitForTimeout(3000);
  }

  links = await extractPromolinksFromPage(page, affiliateId);

  if (links.length) {
    result.affiliateLink = links[0];
    result.status = "approved";
    return result;
  }

  const pageText = await page.locator("body").innerText({ timeout: 3000 }).catch(() => "");

  if (/manual|approve|approval|request sent|pending|review/i.test(pageText)) {
    result.status = result.confirmed ? "approval_requested" : "needs_manual_approval";
  } else if (result.clicked.length) {
    result.status = "promote_clicked_no_link_found";
  } else {
    result.status = "promote_button_not_found";
  }

  await savePromoteDebug(page, page.url().match(/detail\/(\d+)/)?.[1] || "unknown", result.status);

  return result;
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
  const [existingRows] = await conn.query(`
    SELECT id, affiliateLink
    FROM products
    WHERE platform='digistore24'
      AND platformProductId=?
    ORDER BY
      CASE WHEN affiliateLink IS NOT NULL AND affiliateLink != '' THEN 0 ELSE 1 END,
      id ASC
    LIMIT 1
  `, [product.platformProductId]);

  const existingId = existingRows?.[0]?.id || null;
  const existingAffiliateLink = existingRows?.[0]?.affiliateLink || "";

  if (!product.affiliateLink && existingAffiliateLink) {
    product.affiliateLink = existingAffiliateLink;
  }

  const scored = scoreProduct({
    ...product,
    platform: "digistore24",
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

  let result = { insertId: existingId || 0 };

  if (existingId) {
    await conn.query(`
      UPDATE products
      SET
        name=?,
        vendor=?,
        category=?,
        keywords=?,
        description=?,
        affiliateLink=?,
        hiddenGemScore=?,
        scoreComponents=?,
        dataFetchedAt=?,
        lastUpdatedAt=NOW()
      WHERE id=?
    `, [
      product.name,
      product.vendor,
      product.category,
      JSON.stringify(product.keywords),
      product.description,
      product.affiliateLink || "",
      scored.score,
      JSON.stringify(components),
      new Date(),
      existingId
    ]);
  } else {
    const [insertResult] = await conn.query(`
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
    result = insertResult;
  }

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

  const profileDir =
    process.env.DIGISTORE24_BROWSER_PROFILE ||
    `/home/unloved/.config/unloved-digistore24-${browserName}-profile`;

  fs.mkdirSync(profileDir, { recursive: true });

  console.log("Browser profile:", profileDir);
  console.log("This profile keeps cookies/session data so Digistore24 should stay logged in between runs.");

  const context = await browserType.launchPersistentContext(profileDir, {
    headless: false,
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true
  });

  let page =
    context.pages().find(p => /digistore24/i.test(p.url())) ||
    context.pages()[0] ||
    await context.newPage();
  await page.goto(startUrl, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});

  const autoMode = hasFlag("--auto");
  const waitSeconds = Number(arg("--wait-seconds", process.env.DIGISTORE24_REFRESH_WAIT_SECONDS || "600"));

  async function collectDetailLinksFromPage(candidatePage) {
    await candidatePage.waitForTimeout(1000);

    // Try a few auto-scrolls to lazy-load product cards.
    for (let i = 0; i < 8; i++) {
      await candidatePage.mouse.wheel(0, 1400).catch(() => {});
      await candidatePage.waitForTimeout(500);
    }

    const anchors = await candidatePage.evaluate(() =>
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

    return detailLinks;
  }

  let detailLinks = [];

  if (autoMode) {
    console.log("");
    console.log("Auto mode enabled.");
    console.log("Log in and navigate to a marketplace listing. APF will detect product detail links automatically.");
    console.log(`Waiting up to ${waitSeconds} seconds...`);

    const startedAt = Date.now();

    while (Date.now() - startedAt < waitSeconds * 1000) {
      const pages = context.pages();

      for (const candidate of pages) {
        const url = candidate.url();
        if (!/digistore24/i.test(url)) continue;

        const links = await collectDetailLinksFromPage(candidate).catch(() => []);
        if (links.length > 0) {
          page = candidate;
          detailLinks = links;
          break;
        }
      }

      if (detailLinks.length > 0) break;

      console.log("Waiting for Digistore24 marketplace product links...");
      await page.waitForTimeout(3000).catch(() => {});
    }

    if (detailLinks.length === 0) {
      console.log("Auto mode timed out without visible product detail links.");
    }
  } else {
    const rl = readline.createInterface({ input, output });
    await rl.question("After you are logged in and can see marketplace products, press Enter to collect...");
    rl.close();

    detailLinks = await collectDetailLinksFromPage(page);
  }

  console.log("");
  console.log(`Found ${detailLinks.length} visible Digistore24 detail link(s).`);

  if (detailLinks.length === 0) {
    await saveDebug(page, "no_detail_links_found");
    console.log("");
    console.log("No products imported.");
    console.log("This means Digistore24 is using different link markup than expected, or the page was not on a marketplace listing.");
    await context.close();
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

      const promoteResult = await maybePromoteAndExtractLink(detailPage, affiliateId);
      const refreshedDetail = await detailPage.evaluate(() => {
        const txt = el => (el?.innerText || el?.textContent || "").replace(/\s+/g, " ").trim();

        const anchors = Array.from(document.querySelectorAll("a")).map(a => ({
          text: txt(a),
          href: a.href
        }));

        return { anchors };
      }).catch(() => ({ anchors: [] }));

      const affiliateLink =
        promoteResult.affiliateLink ||
        extractAffiliateLinkFromAnchors(refreshedDetail.anchors || detail.anchors, affiliateId);

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
        affiliate: affiliateLink ? "approved" : (promoteResult.status || "needs_approval")
      });

      console.log(`Imported: ${product.name}`);
      console.log(`Score: ${saved.score}`);
      console.log(`Affiliate: ${affiliateLink ? "approved" : (promoteResult.status || "needs_approval")}`);
      if (promoteResult.clicked?.length) console.log(`Promote clicks: ${promoteResult.clicked.join(" -> ")}`);
      if (affiliateLink) console.log(`Promolink: ${affiliateLink}`);

      await detailPage.close().catch(() => {});
    }
  } finally {
    await conn.end();
    await context.close();
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
