#!/usr/bin/env node
import fs from "node:fs";
import http from "node:http";
import crypto from "node:crypto";
import mysql from "mysql2/promise";
import { firefox } from "playwright";
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

loadEnv();

const PORT = Number(process.env.DIGISTORE24_DAEMON_PORT || "3219");
const PROFILE_DIR =
  process.env.DIGISTORE24_BROWSER_PROFILE ||
  "/home/unloved/.config/unloved-digistore24-daemon-firefox-profile";
const START_URL =
  "https://www.digistore24-app.com/app/en/affiliate/account/marketplace/all";

let context;
let mainPage;

function clean(v) {
  return String(v ?? "").replace(/\s+/g, " ").trim();
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

async function ensureBrowser() {
  let contextUsable = false;

  try {
    contextUsable = Boolean(context && context.pages);
    if (contextUsable) context.pages();
  } catch {
    contextUsable = false;
  }

  if (!contextUsable) {
    fs.mkdirSync(PROFILE_DIR, { recursive: true });

    console.log("Starting long-lived Digistore24 Firefox daemon.");
    console.log("Profile:", PROFILE_DIR);
    console.log("Port:", PORT);
    console.log("");

    context = await firefox.launchPersistentContext(PROFILE_DIR, {
      headless: false,
      viewport: { width: 1440, height: 1000 },
      acceptDownloads: true,
    });
  }

  const pages = context.pages().filter(p => !p.isClosed());

  mainPage =
    pages.find(p => /digistore24/i.test(p.url())) ||
    pages[0] ||
    await context.newPage();

  if (mainPage.isClosed()) {
    mainPage = await context.newPage();
  }

  if (!/digistore24/i.test(mainPage.url())) {
    await mainPage.goto(START_URL, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  }

  console.log("Digistore24 daemon browser ready.");
  console.log("If login/2FA is required, complete it in the opened Firefox window.");
  console.log("");

  return context;
}

async function collectDetailLinks(page) {
  await page.waitForTimeout(1000);

  for (let i = 0; i < 8; i++) {
    await page.mouse.wheel(0, 1400).catch(() => {});
    await page.waitForTimeout(450);
  }

  const anchors = await page.evaluate(() =>
    Array.from(document.querySelectorAll("a")).map(a => ({
      text: (a.innerText || a.textContent || "").replace(/\s+/g, " ").trim(),
      href: a.href,
    }))
  );

  const out = [];
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

    out.push({ href: normalized, text: clean(a.text) });
  }

  return out;
}


async function visibleDetailLinks(page) {
  const anchors = await page.evaluate(() =>
    Array.from(document.querySelectorAll("a")).map(a => ({
      text: (a.innerText || a.textContent || "").replace(/\s+/g, " ").trim(),
      href: a.href,
    }))
  ).catch(() => []);

  const out = [];
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

    out.push({ href: normalized, text: clean(a.text) });
  }

  return out;
}

async function waitForDetailLinks(page, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastLog = 0;

  console.log(`Waiting up to ${Math.round(timeoutMs / 1000)} seconds for Digistore24 marketplace product links.`);
  console.log("If login/2FA is required, complete it in the opened Firefox window.");
  console.log("No terminal input is needed.");

  while (Date.now() < deadline) {
    const links = await visibleDetailLinks(page);

    if (links.length) {
      console.log(`Marketplace links detected: ${links.length}`);
      return await collectDetailLinks(page);
    }

    const now = Date.now();
    if (now - lastLog > 15000) {
      lastLog = now;
      console.log(`Still waiting for marketplace links. Current page: ${page.url()}`);
    }

    await page.waitForTimeout(2000);
  }

  return [];
}

async function clickVisibleText(page, patterns, timeoutMs = 1500) {
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

async function extractPromolinksFromPage(page, affiliateId) {
  const aff = clean(affiliateId).toLowerCase();

  return await page.evaluate((affArg) => {
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

    const urls = [];
    const text = raw.join("\n");

    for (const m of text.matchAll(/https?:\/\/[^\s"'<>]+/gi)) urls.push(m[0]);
    for (const m of text.matchAll(/www\.[^\s"'<>]+/gi)) urls.push("https://" + m[0]);

    return Array.from(new Set(urls.map(u => u.replace(/[),.;\]]+$/g, "")))).filter(url => {
      const u = url.toLowerCase();
      return (
        u.includes("checkout-ds24.com/redir") ||
        u.includes(`#aff=${affArg}`) ||
        u.includes(`?aff=${affArg}`) ||
        u.includes(`&aff=${affArg}`) ||
        u.includes(`aff=${affArg}`)
      );
    });
  }, aff);
}

async function promoteAndExtract(page, affiliateId, shouldPromote, shouldConfirm) {
  const result = {
    attempted: false,
    confirmed: false,
    affiliateLink: "",
    status: "not_attempted",
    clicked: [],
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
      /promolink/i,
      /promote now/i,
      /promote/i,
      /request promolink/i,
      /get promolink/i,
      /request affiliate link/i,
      /^confirm$/i,
      /confirm/i,
      /yes/i,
      /i agree/i,
      /accept/i,
      /request now/i,
      /start promoting/i,
    ]);

    if (clicked) {
      result.clicked.push(clicked);
      if (/confirm|yes|agree|accept|request|start/i.test(clicked)) result.confirmed = true;
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

    await page.waitForTimeout(2500);
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

  return result;
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
    link_status: product.affiliateLink ? "approved" : "needs_approval",
  });

  const scoreComponents = {
    ...scored.components,
    _meta: {
      scoring_version: SCORING_VERSION,
      marketplace: scored.marketplace,
      strategy: scored.strategy,
      collector: "digistore24_browser_daemon",
      affiliate_ready: Boolean(product.affiliateLink),
      detail_url: product.detailUrl,
    },
  };

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
        dataFetchedAt=NOW(),
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
      JSON.stringify(scoreComponents),
      existingId,
    ]);

    return { productId: existingId, score: scored.score };
  }

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
    VALUES (?, 'digistore24', ?, ?, ?, ?, ?, ?, 0, 0, 0, NULL, 'digistore24', ?, ?, ?, NOW(), NOW())
  `, [
    product.userId,
    product.platformProductId,
    product.name,
    product.vendor,
    product.category,
    JSON.stringify(product.keywords),
    product.description,
    product.affiliateLink || "",
    scored.score,
    JSON.stringify(scoreComponents),
  ]);

  return { productId: result.insertId, score: scored.score };
}

async function collectProducts(options) {
  await ensureBrowser();

  const pages = context.pages();
  mainPage = pages.find(p => /digistore24/i.test(p.url())) || mainPage || pages[0];

  if (!mainPage) throw new Error("No Digistore24 browser page found.");

  const detailLinks = await waitForDetailLinks(
    mainPage,
    options.loginWaitMs || 10 * 60 * 1000
  );

  if (!detailLinks.length) {
    return {
      success: false,
      needsLoginOrMarketplace: true,
      message: "Timed out waiting for Digistore24 marketplace product links. Complete login/2FA in the opened Firefox window and make sure the marketplace page is visible, then retry Refresh Data.",
      pageUrl: mainPage.url(),
      imported: [],
    };
  }

  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  const imported = [];

  try {
    for (const item of detailLinks.slice(0, options.limit)) {
      const detailUrl = item.href;
      const platformProductId = productIdFromUrl(detailUrl) || `url-${hashId(detailUrl)}`;

      const detailPage = await context.newPage();
      await detailPage.goto(detailUrl, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
      await detailPage.waitForTimeout(1500);

      const detail = await detailPage.evaluate(() => {
        const txt = el => (el?.innerText || el?.textContent || "").replace(/\s+/g, " ").trim();

        const title =
          txt(document.querySelector("h1")) ||
          txt(document.querySelector("h2")) ||
          document.title.replace(/\s+/g, " ").trim();

        const body = txt(document.body).slice(0, 6000);

        return { title, body };
      });

      const promote = await promoteAndExtract(
        detailPage,
        options.affiliateId,
        options.promote,
        options.confirm
      );

      const product = {
        userId: options.userId,
        platformProductId,
        name: clean(detail.title || item.text || `Digistore24 Product ${platformProductId}`).slice(0, 255),
        vendor: "digistore24",
        category: "Digistore24 Marketplace",
        keywords: [
          "digistore24",
          ...clean(detail.title).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).slice(0, 12),
        ],
        description: clean(detail.body || `Digistore24 marketplace product ${platformProductId}`).slice(0, 3000),
        affiliateLink: promote.affiliateLink || "",
        detailUrl,
      };

      const saved = await upsertProduct(conn, product);

      imported.push({
        id: saved.productId,
        platformProductId,
        name: product.name,
        score: saved.score,
        affiliate: product.affiliateLink ? "approved" : promote.status,
        affiliateLink: product.affiliateLink,
        clicked: promote.clicked,
      });

      await detailPage.close().catch(() => {});
    }
  } finally {
    await conn.end();
  }

  return {
    success: true,
    importedCount: imported.length,
    imported,
  };
}

function sendJson(res, code, data) {
  res.writeHead(code, { "content-type": "application/json" });
  res.end(JSON.stringify(data, null, 2));
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);

    if (url.pathname === "/health") {
      await ensureBrowser();
      return sendJson(res, 200, {
        ok: true,
        pageUrl: mainPage?.url() || "",
        profile: PROFILE_DIR,
      });
    }

    if (url.pathname === "/open") {
      await ensureBrowser();
      await mainPage.goto(START_URL, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
      return sendJson(res, 200, { ok: true, pageUrl: mainPage.url() });
    }

    if (url.pathname === "/shutdown") {
      sendJson(res, 200, { ok: true, message: "Digistore24 daemon shutting down" });

      server.close(() => {});

      setTimeout(async () => {
        try {
          await context?.close();
        } catch {}

        process.exit(0);
      }, 500);

      return;
    }

    if (url.pathname === "/collect") {
      const result = await collectProducts({
        limit: Math.max(1, Math.min(200, Number(url.searchParams.get("limit") || "10"))),
        loginWaitMs: Math.max(
          30,
          Math.min(
            1800,
            Number(url.searchParams.get("wait") || process.env.DIGISTORE24_LOGIN_WAIT_SECONDS || "600")
          )
        ) * 1000,
        promote: url.searchParams.get("promote") === "1",
        confirm: url.searchParams.get("confirm") === "1",
        affiliateId: process.env.DIGISTORE24_ID || "UnlovedProducts",
        userId: Number(process.env.APF_USER_ID || "1"),
      });

      return sendJson(res, result.success ? 200 : 409, result);
    }

    return sendJson(res, 404, { error: "not_found" });
  } catch (err) {
    return sendJson(res, 500, {
      error: err?.message || String(err),
      stack: err?.stack || "",
    });
  }
});

await ensureBrowser();

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Digistore24 browser daemon listening on http://127.0.0.1:${PORT}`);
  console.log("");
  console.log("Keep this terminal and browser open.");
});
