#!/usr/bin/env node
import fs from "node:fs";
import http from "node:http";
import crypto from "node:crypto";
import path from "node:path";
import mysql from "mysql2/promise";
import { firefox } from "playwright";
import { scoreProduct, SCORING_VERSION } from "./marketplace-scoring.mjs";
import { extractDigistore24Detail, resolveProductName, resolveExportProductName, isMarketplaceBrandName, resolveProductCategory } from "./digistore24-detail-extractor.mjs";
import { queueReview, upsertAffiliateLink } from "./apf-db-helpers.mjs";
import {
  classifySourceType,
  discoverLinksFromDom,
  extractBuyerFacingBlocks,
  isMarketplaceHost,
  pageEvaluateExtractScript,
  upsertVendorMaterial,
  ensureVendorMaterialsTable,
  cleanText,
} from "./digistore24-vendor-materials.mjs";
import {
  clearStaleFirefoxProfileLock,
  ensurePlaywrightBrowsersPath,
  getDigistore24FirefoxProfileDir,
} from "./digistore24-firefox-profile.mjs";

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
ensurePlaywrightBrowsersPath();

const PORT = Number(process.env.DIGISTORE24_DAEMON_PORT || "3219");
const PROFILE_DIR = getDigistore24FirefoxProfileDir();
const START_URL =
  "https://www.digistore24-app.com/app/en/affiliate/account/marketplace/all";
const MARKETPLACE_DETAIL_SELECTOR = 'a[href*="/detail/"]';
const DIGISTORE_USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0";

let context;
let mainPage;
let browserReadyLogged = false;
let collectBusy = false;

async function waitForMarketplaceDetailLinks(page, timeoutMs = 5000) {
  try {
    await page.waitForSelector(MARKETPLACE_DETAIL_SELECTOR, {
      timeout: timeoutMs,
      state: "attached",
    });
    return true;
  } catch {
    return false;
  }
}

async function waitForPageSettle(page, timeoutMs = 3000) {
  await page.waitForLoadState("domcontentloaded", { timeout: timeoutMs }).catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: timeoutMs }).catch(() => {});
}

async function waitForPromolinkOrSettle(page, affiliateId, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const links = await extractPromolinksFromPage(page, affiliateId);
    if (links.length) return true;
    await waitForPageSettle(page, 1500);
  }
  return false;
}

async function assertDigistoreSession(page) {
  const url = page.url();
  let pathname = url;
  try {
    pathname = new URL(url).pathname;
  } catch {
    // keep raw url fallback for malformed URLs
  }
  // Match real login/signin paths only — do not treat query params like auth_testpay as expired.
  if (/\/(?:login|signin|auth)(?:\/|$)/i.test(pathname)) {
    throw new Error("Digistore24 session expired — run: pnpm run digistore24:login");
  }

  const links = await visibleDetailLinks(page);
  if (links.length) return { ok: true, linkCount: links.length };

  const ready = await waitForMarketplaceDetailLinks(page, 8000);
  if (!ready) {
    throw new Error(
      "Digistore24 marketplace not ready — complete login in Firefox or run: pnpm run digistore24:session:check"
    );
  }

  return { ok: true, linkCount: (await visibleDetailLinks(page)).length };
}

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

function digistoreMarketplaceDetailUrl(platformProductId) {
  const id = clean(platformProductId);
  if (!/^\d+$/.test(id)) return "";
  return `https://www.digistore24-app.com/app/en/affiliate/account/marketplace/all/detail/${id}`;
}

/**
 * When --promote recovery is on, reopen known Digistore detail pages that still
 * have generated links even if they are not on the current marketplace listing.
 */
function appendPromoteRecoveryCandidates(candidates = [], needsPromote = new Set(), limit = 10) {
  const out = Array.isArray(candidates) ? [...candidates] : [];
  const have = new Set(out.map((c) => clean(c?.platformProductId)));
  const max = Math.max(1, Number(limit) || 10);

  for (const platformProductId of needsPromote) {
    if (out.length >= max) break;
    const id = clean(platformProductId);
    if (!id || have.has(id)) continue;
    const href = digistoreMarketplaceDetailUrl(id);
    if (!href) continue;
    out.push({
      href,
      text: `Digistore24 Product ${id}`,
      platformProductId: id,
      promoteRecovery: true,
    });
    have.add(id);
  }

  return out;
}

async function browserContextAlive() {
  if (!context) return false;
  try {
    const browser = context.browser?.() || null;
    if (browser && typeof browser.isConnected === "function" && !browser.isConnected()) {
      return false;
    }
    // pages() can succeed on a half-dead context; ping a live page.
    const pages = context.pages().filter((p) => !p.isClosed());
    if (pages.length === 0) return Boolean(browser?.isConnected?.() ?? true);
    await pages[0].evaluate(() => true);
    return true;
  } catch {
    return false;
  }
}

async function ensureBrowser() {
  let contextUsable = await browserContextAlive();

  if (!contextUsable) {
    try { await context?.close(); } catch { /* ignore */ }
    context = null;
    mainPage = null;
    browserReadyLogged = false;

    fs.mkdirSync(PROFILE_DIR, { recursive: true });
    const lockCleanup = clearStaleFirefoxProfileLock(PROFILE_DIR);
    if (lockCleanup.cleared.length > 0) {
      console.log("Removed stale Firefox profile lock(s):", lockCleanup.cleared.join(", "));
    }

    console.log("Starting long-lived Digistore24 Firefox daemon.");
    console.log("Profile:", PROFILE_DIR);
    console.log("Port:", PORT);
    console.log("");

    context = await firefox.launchPersistentContext(PROFILE_DIR, {
      headless: false,
      viewport: { width: 1920, height: 1080 },
      userAgent: DIGISTORE_USER_AGENT,
      acceptDownloads: true,
    });

    await context.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
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

  if (!browserReadyLogged) {
    console.log("Digistore24 daemon browser ready.");
    console.log("If login/2FA is required, complete it in the opened Firefox window.");
    console.log("");
    browserReadyLogged = true;
  }

  return context;
}

async function clickNextMarketplacePage(page) {
  return await page.evaluate(() => {
    const visible = el => {
      const rect = el?.getBoundingClientRect?.();
      return Boolean(rect && rect.width > 0 && rect.height > 0);
    };

    const relNext = document.querySelector("a[rel='next'], button[rel='next']");
    if (relNext && visible(relNext)) {
      relNext.click();
      return true;
    }

    const nextPatterns = [
      /^next$/i,
      /next page/i,
      /next products/i,
      /weiter/i,
      /suivant/i,
      /siguiente/i,
      /proximo|próximo/i,
      /^>\s*$/i,
      /^>>\s*$/i,
    ];

    const candidates = Array.from(
      document.querySelectorAll("button, a, [role='button'], input[type='button'], input[type='submit']")
    );

    for (const el of candidates) {
      if (!visible(el)) continue;
      const text = `${el.innerText || ""} ${el.textContent || ""} ${el.value || ""} ${el.getAttribute?.("aria-label") || ""}`
        .replace(/\s+/g, " ")
        .trim();
      if (!text) continue;
      if (!nextPatterns.some(re => re.test(text))) continue;
      el.click();
      return true;
    }

    return false;
  }).catch(() => false);
}

async function collectDetailLinks(page, options = {}) {
  const targetCount = Math.max(1, Number(options.targetCount || 10));
  const maxScrollRounds = Math.max(1, Number(options.maxScrollRounds || 60));
  const noGrowthLimit = Math.max(1, Number(options.noGrowthLimit || 4));
  const shouldInclude = typeof options.shouldInclude === "function"
    ? options.shouldInclude
    : () => true;

  await waitForMarketplaceDetailLinks(page, 5000).catch(() => {});

  const seenLinks = new Set();
  const candidates = [];
  let skippedExistingCount = 0;
  let noGrowthRounds = 0;

  for (let round = 0; round < maxScrollRounds; round++) {
    await page.mouse.wheel(0, 1400).catch(() => {});
    await page.waitForFunction(
      () => document.querySelectorAll("a[href*='/detail/']").length > 0,
      { timeout: 800 }
    ).catch(() => {});

    const links = await visibleDetailLinks(page);
    let sawNewLink = false;

    for (const item of links) {
      const detailUrl = clean(item.href).split("#")[0];
      if (!detailUrl) continue;
      if (seenLinks.has(detailUrl)) continue;
      seenLinks.add(detailUrl);
      sawNewLink = true;

      const platformProductId = productIdFromUrl(detailUrl) || `url-${hashId(detailUrl)}`;
      if (shouldInclude(platformProductId, detailUrl, item.text)) {
        candidates.push({ href: detailUrl, text: clean(item.text), platformProductId });
        if (candidates.length >= targetCount) {
          return {
            candidates,
            skippedExistingCount,
            discoveredLinksCount: seenLinks.size,
          };
        }
      } else {
        skippedExistingCount += 1;
      }
    }

    if (sawNewLink) {
      noGrowthRounds = 0;
      continue;
    }

    noGrowthRounds += 1;
    if (noGrowthRounds < noGrowthLimit) continue;

    const movedToNextPage = await clickNextMarketplacePage(page);
    if (!movedToNextPage) break;

    noGrowthRounds = 0;
    await waitForMarketplaceDetailLinks(page, 10000);
  }

  return {
    candidates,
    skippedExistingCount,
    discoveredLinksCount: seenLinks.size,
  };
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

async function waitForDetailLinks(page, timeoutMs, options = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastLog = 0;

  console.log(`Waiting up to ${Math.round(timeoutMs / 1000)} seconds for Digistore24 marketplace product links.`);
  console.log("If login/2FA is required, complete it in the opened Firefox window.");
  console.log("No terminal input is needed.");

  while (Date.now() < deadline) {
    const links = await visibleDetailLinks(page);

    if (links.length) {
      console.log(`Marketplace links detected: ${links.length}`);
      const collected = await collectDetailLinks(page, options);
      console.log(
        `Marketplace detail links discovered: ${collected.discoveredLinksCount}. ` +
        `Candidates to open: ${collected.candidates.length}.`
      );
      return {
        ready: true,
        ...collected,
      };
    }

    const now = Date.now();
    if (now - lastLog > 15000) {
      lastLog = now;
      console.log(`Still waiting for marketplace links. Current page: ${page.url()}`);
    }

    await waitForMarketplaceDetailLinks(page, 2000).catch(() => {});
  }

  return {
    ready: false,
    candidates: [],
    skippedExistingCount: 0,
    discoveredLinksCount: 0,
  };
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

    await waitForPromolinkOrSettle(page, affiliateId, 2500);
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

async function captureVendorMaterials(conn, productId, detailPage, detailUrl, affiliateLink) {
  await ensureVendorMaterialsTable(conn);

  const offerRaw = await detailPage.evaluate(pageEvaluateExtractScript());
  const offerBlocks = extractBuyerFacingBlocks(offerRaw.body);
  await upsertVendorMaterial(conn, {
    productId,
    sourceUrl: detailUrl,
    sourceType: "offer_page",
    title: offerRaw.title,
    contentText: offerRaw.body,
    structuredBlocks: offerBlocks,
    isVendorHosted: false,
    fetchStatus: "ok",
  });

  const candidates = discoverLinksFromDom(offerRaw.links, detailUrl, affiliateLink);
  const visited = new Set([detailUrl]);
  let captured = 1;
  const maxPages = Number(process.env.DIGISTORE24_VENDOR_MATERIAL_MAX_PAGES || "6");

  for (const candidate of candidates) {
    if (captured >= maxPages) break;
    if (visited.has(candidate.url)) continue;
    visited.add(candidate.url);

    const hostIsMarketplace = isMarketplaceHost(candidate.host);
    if (hostIsMarketplace && candidate.url !== detailUrl) continue;

    let materialPage = detailPage;
    let closeAfter = false;

    if (candidate.url !== detailPage.url()) {
      materialPage = await context.newPage();
      closeAfter = true;
      await materialPage.goto(candidate.url, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
      await waitForPageSettle(materialPage, 5000);
    }

    const raw = await materialPage.evaluate(pageEvaluateExtractScript()).catch(() => ({ title: "", body: "", links: [] }));
    if (closeAfter) await materialPage.close().catch(() => {});

    if (!raw.body || raw.body.length < 80) continue;

    const sourceType = classifySourceType(candidate.url, raw.body);
    const blocks = extractBuyerFacingBlocks(raw.body);

    await upsertVendorMaterial(conn, {
      productId,
      sourceUrl: candidate.url,
      sourceType,
      title: raw.title,
      contentText: raw.body,
      structuredBlocks: blocks,
      isVendorHosted: !hostIsMarketplace,
      fetchStatus: raw.body ? "ok" : "empty",
    });
    captured += 1;
  }

  return captured;
}

async function upsertProduct(conn, product) {
  const [existingRows] = await conn.query(`
    SELECT id, affiliateLink, name
    FROM products
    WHERE userId=?
      AND platform='digistore24'
      AND platformProductId=?
    ORDER BY
      CASE WHEN affiliateLink IS NOT NULL AND affiliateLink != '' THEN 0 ELSE 1 END,
      id ASC
    LIMIT 1
  `, [product.userId, product.platformProductId]);

  const existingId = existingRows?.[0]?.id || null;
  const existingAffiliateLink = existingRows?.[0]?.affiliateLink || "";
  const existingName = clean(existingRows?.[0]?.name || "");

  if (!product.affiliateLink && existingAffiliateLink) {
    product.affiliateLink = existingAffiliateLink;
  }

  // Never clobber a real product name with Digistore24/marketplace placeholders.
  if (
    existingName
    && !isMarketplaceBrandName(existingName)
    && isMarketplaceBrandName(product.name)
  ) {
    product.name = existingName;
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
      ...product.detectedMeta,
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
        commissionRate=?,
        conversionRate=?,
        cartValue=?,
        platformCreatedAt=?,
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
      product.commissionRate,
      product.conversionRate,
      product.cartValue,
      product.platformCreatedAt ? new Date(product.platformCreatedAt) : null,
      product.affiliateLink || "",
      scored.score,
      JSON.stringify(scoreComponents),
      existingId,
    ]);

    if (product.affiliateLink) {
      await upsertAffiliateLink(conn, {
        productId: existingId,
        provider: "digistore24",
        affiliateNickname: process.env.DIGISTORE24_ID || "UnlovedProducts",
        vendorNickname: product.vendor || "",
        platformProductId: product.platformProductId,
        affiliateUrl: product.affiliateLink,
        campaignKey: "",
        status: "approved",
        notes: "Approved promolink from digistore24 browser daemon (--promote)",
      });
    }
    await queueReview(conn, existingId);

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
      conversionRate,
      cartValue,
      commissionType,
      affiliateLink,
      hiddenGemScore,
      scoreComponents,
      platformCreatedAt,
      dataFetchedAt
    )
    VALUES (?, 'digistore24', ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?, 'percentage', ?, ?, ?, ?, NOW())
  `, [
    product.userId,
    product.platformProductId,
    product.name,
    product.vendor,
    product.category,
    JSON.stringify(product.keywords),
    product.description,
    product.commissionRate,
    product.conversionRate,
    product.cartValue,
    product.affiliateLink || "",
    scored.score,
    JSON.stringify(scoreComponents),
    product.platformCreatedAt ? new Date(product.platformCreatedAt) : new Date(),
  ]);
  const productId = result.insertId;
  if (product.affiliateLink) {
    await upsertAffiliateLink(conn, {
      productId,
      provider: "digistore24",
      affiliateNickname: process.env.DIGISTORE24_ID || "UnlovedProducts",
      vendorNickname: product.vendor || "",
      platformProductId: product.platformProductId,
      affiliateUrl: product.affiliateLink,
      campaignKey: "",
      status: "approved",
      notes: "Approved promolink from digistore24 browser daemon (--promote)",
    });
  }
  await queueReview(conn, productId);

  return { productId, score: scored.score };
}

async function loadKnownProductState(conn, userId, allowPromoteRecovery) {
  const [rows] = await conn.query(`
    SELECT
      p.platformProductId,
      p.affiliateLink,
      MAX(CASE WHEN l.status = 'generated' THEN 1 ELSE 0 END) AS hasGeneratedLink
    FROM products p
    LEFT JOIN product_affiliate_links l
      ON l.product_id = p.id
      AND l.provider = 'digistore24'
    WHERE p.userId = ?
      AND p.platform = 'digistore24'
    GROUP BY p.id, p.platformProductId, p.affiliateLink
  `, [userId]);

  const knownIds = new Set();
  const needsPromote = new Set();

  for (const row of rows || []) {
    const platformProductId = clean(row?.platformProductId);
    if (!platformProductId) continue;

    knownIds.add(platformProductId);
    const hasAffiliateLink = Boolean(clean(row?.affiliateLink));
    const hasGeneratedLink = Boolean(row?.hasGeneratedLink);

    if (hasAffiliateLink && !hasGeneratedLink) {
      needsPromote.delete(platformProductId);
      continue;
    }

    if (allowPromoteRecovery && (!hasAffiliateLink || hasGeneratedLink)) {
      needsPromote.add(platformProductId);
    }
  }

  return { knownIds, needsPromote };
}

async function collectProducts(options) {
  if (!Number.isFinite(options.userId) || options.userId <= 0) {
    throw new Error("APF_USER_ID must be set to a valid logged-in user id.");
  }

  await ensureBrowser();

  const pages = context.pages();
  mainPage = pages.find(p => /digistore24/i.test(p.url())) || mainPage || pages[0];

  if (!mainPage) throw new Error("No Digistore24 browser page found.");

  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  const imported = [];
  let skippedExistingCount = 0;
  let openedCount = 0;

  try {
    try {
      const session = await assertDigistoreSession(mainPage);
      console.log(`Digistore24 session preflight ok (${session.linkCount} marketplace links visible).`);
    } catch (err) {
      return {
        success: false,
        needsLoginOrMarketplace: true,
        message: err.message,
        pageUrl: mainPage.url(),
        imported: [],
      };
    }

    const knownState = await loadKnownProductState(conn, options.userId, options.promote);

    // Promote recovery can reopen known detail URLs; don't burn the full login wait
    // when the listing page is already open and we only need to re-promote.
    const listingWaitMs = options.promote && knownState.needsPromote.size > 0
      ? Math.min(options.loginWaitMs || 60_000, 90_000)
      : (options.loginWaitMs || 10 * 60 * 1000);

    let detailLookup = await waitForDetailLinks(
      mainPage,
      listingWaitMs,
      {
        targetCount: options.limit,
        shouldInclude: (platformProductId) =>
          !knownState.knownIds.has(platformProductId) || knownState.needsPromote.has(platformProductId),
      }
    );

    if (options.promote && knownState.needsPromote.size > 0) {
      const before = (detailLookup.candidates || []).length;
      const merged = appendPromoteRecoveryCandidates(
        detailLookup.candidates || [],
        knownState.needsPromote,
        options.limit,
      );
      if (merged.length > before) {
        console.log(
          `Promote recovery: added ${merged.length - before} known detail URL(s) not on current listing ` +
          `(needsPromote=${knownState.needsPromote.size}).`,
        );
      }
      detailLookup = {
        ...detailLookup,
        ready: Boolean(detailLookup.ready) || merged.length > 0,
        candidates: merged,
      };
    }

    if (!detailLookup.ready) {
      return {
        success: false,
        needsLoginOrMarketplace: true,
        message: "Timed out waiting for Digistore24 marketplace product links. Complete login/2FA in the opened Firefox window and make sure the marketplace page is visible, then retry Refresh Data.",
        pageUrl: mainPage.url(),
        imported: [],
      };
    }

    skippedExistingCount = detailLookup.skippedExistingCount;

    for (const item of detailLookup.candidates.slice(0, options.limit)) {
      const detailUrl = item.href;
      const platformProductId = item.platformProductId || productIdFromUrl(detailUrl) || `url-${hashId(detailUrl)}`;

      if (knownState.knownIds.has(platformProductId) && !knownState.needsPromote.has(platformProductId)) {
        skippedExistingCount += 1;
        continue;
      }

      openedCount += 1;

      const detailPage = await context.newPage();
      await detailPage.goto(detailUrl, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
      await detailPage.waitForSelector("h1, h2, body", { timeout: 10000 }).catch(() => {});

      const rawDetail = await detailPage.evaluate(() => {
        const collapse = (el) => (el?.innerText || el?.textContent || "").replace(/\s+/g, " ").trim();
        const isBrand = (value) => /^(digistore24?|marketplace)$/i.test(String(value || "").trim());
        const candidates = [
          collapse(document.querySelector("h1")),
          collapse(document.querySelector("h2")),
          document.title.replace(/\s+/g, " ").trim(),
        ].filter((value) => value && !isBrand(value));
        const title = candidates[0] || "";
        // Preserve newlines so Vendor:/Category: label parsing works.
        const body = String(document.body?.innerText || "").slice(0, 10000);
        const descriptionSection =
          collapse(document.querySelector("[class*='description'], [id*='description'], .product-description")) ||
          body;
        return { title, body, descriptionSection };
      });
      const detail = extractDigistore24Detail(rawDetail);

      const promote = await promoteAndExtract(
        detailPage,
        options.affiliateId,
        options.promote,
        options.confirm
      );

      const productName = resolveProductName(detail.title, item.text, platformProductId);
      const product = {
        userId: options.userId,
        platformProductId,
        name: productName.slice(0, 255),
        vendor: detail.vendor || "",
        category: resolveProductCategory({ category: detail.category, name: productName, title: detail.title }),
        keywords: [
          "digistore24",
          ...clean(productName).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).slice(0, 10),
          ...clean(detail.category).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).slice(0, 4),
        ],
        description: clean(detail.description || rawDetail.body || `Digistore24 marketplace product ${platformProductId}`).slice(0, 3500),
        commissionRate: detail.commissionRate,
        conversionRate: detail.conversionRate,
        cartValue: detail.cartValue,
        platformCreatedAt: detail.platformCreatedAt,
        affiliateLink: promote.affiliateLink || "",
        detailUrl,
        detectedMeta: {
          ...detail.detectedMeta,
          detected_refund_rate: detail.refundRate ?? detail.detectedMeta?.detected_refund_rate ?? null,
        },
      };

      const saved = await upsertProduct(conn, product);
      const vendorMaterialCount = await captureVendorMaterials(
        conn,
        saved.productId,
        detailPage,
        detailUrl,
        product.affiliateLink
      );

      if (vendorMaterialCount > 0) {
        const [matRows] = await conn.query(
          `SELECT title, source_type FROM product_vendor_materials WHERE product_id=? ORDER BY id ASC`,
          [saved.productId],
        );
        const fromMaterials = resolveExportProductName(
          { name: product.name, platformProductId },
          matRows || [],
        );
        if (
          fromMaterials
          && !isMarketplaceBrandName(fromMaterials)
          && !/^Digistore24 Product\b/i.test(String(fromMaterials))
          && String(fromMaterials) !== String(product.name || "")
        ) {
          await conn.query(
            `UPDATE products SET name=?, lastUpdatedAt=NOW() WHERE id=? AND platform='digistore24'`,
            [String(fromMaterials).slice(0, 255), saved.productId],
          );
          product.name = String(fromMaterials).slice(0, 255);
        }
        const resolvedCategory = resolveProductCategory({
          category: product.category,
          name: product.name,
          title: detail.title,
          vendorMaterials: matRows || [],
        });
        if (resolvedCategory && resolvedCategory !== product.category) {
          await conn.query(
            `UPDATE products SET category=?, lastUpdatedAt=NOW() WHERE id=? AND platform='digistore24'`,
            [resolvedCategory.slice(0, 255), saved.productId],
          );
          product.category = resolvedCategory;
        }
      }

      imported.push({
        id: saved.productId,
        platformProductId,
        name: product.name,
        score: saved.score,
        affiliate: product.affiliateLink ? "approved" : promote.status,
        affiliateLink: product.affiliateLink,
        clicked: promote.clicked,
        vendorMaterials: vendorMaterialCount,
      });

      knownState.knownIds.add(platformProductId);
      if (product.affiliateLink) {
        knownState.needsPromote.delete(platformProductId);
      }

      await detailPage.close().catch(() => {});
    }
  } finally {
    await conn.end();
  }

  return {
    success: true,
    importedCount: imported.length,
    skippedExistingCount,
    openedCount,
    imported,
  };
}

function sendJson(res, code, data) {
  res.writeHead(code, { "content-type": "application/json" });
  res.end(JSON.stringify(data, null, 2));
}

async function sleep(ms) {
  await new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchDaemonHealth() {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/health`);
    const data = await res.json().catch(() => ({}));
    return { reachable: true, healthy: res.ok && data.ok === true, data };
  } catch {
    return { reachable: false, healthy: false, data: null };
  }
}

async function shutdownDaemonOnPort() {
  try {
    await fetch(`http://127.0.0.1:${PORT}/shutdown`);
  } catch {}

  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const check = await fetchDaemonHealth();
    if (!check.reachable) return true;
    await sleep(500);
  }

  return false;
}

async function startDaemon() {
  const existing = await fetchDaemonHealth();

  if (existing.healthy) {
    console.log(`Digistore24 daemon already running on http://127.0.0.1:${PORT}`);
    if (existing.data?.pageUrl) console.log("Page:", existing.data.pageUrl);
    process.exit(0);
  }

  if (existing.reachable) {
    console.log(`Replacing unhealthy Digistore24 daemon on port ${PORT}...`);
    const stopped = await shutdownDaemonOnPort();
    if (!stopped) {
      console.error(`Could not stop existing daemon on port ${PORT}. Run: pnpm run digistore24:daemon:stop`);
      process.exit(1);
    }
  }

  await new Promise((resolve, reject) => {
    server.once("error", err => {
      if (err?.code === "EADDRINUSE") {
        reject(new Error(`Port ${PORT} is already in use. Run: pnpm run digistore24:daemon:stop`));
      } else {
        reject(err);
      }
    });
    server.listen(PORT, "127.0.0.1", resolve);
  });

  console.log(`Digistore24 browser daemon listening on http://127.0.0.1:${PORT}`);
  console.log("");
  console.log("Keep this terminal and browser open.");

  await ensureBrowser();
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);

    if (url.pathname === "/health") {
      const alive = await browserContextAlive();
      let pageUrl = "";
      try {
        pageUrl = alive && mainPage && !mainPage.isClosed() ? (mainPage.url() || "") : "";
      } catch {
        pageUrl = "";
      }
      return sendJson(res, 200, {
        ok: true,
        pageUrl,
        profile: PROFILE_DIR,
        browserReady: alive,
        collectBusy,
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
        context = null;
        mainPage = null;
        browserReadyLogged = false;
        process.exit(0);
      }, 500);

      return;
    }

    if (url.pathname === "/collect") {
      if (collectBusy) {
        return sendJson(res, 409, {
          success: false,
          error: "collect_busy",
          message: "A Digistore24 collect is already running. Retry when it finishes.",
        });
      }

      collectBusy = true;
      try {
        const requestUserId = Number(url.searchParams.get("userId") || process.env.APF_USER_ID || "0");
        const result = await collectProducts({
          limit: Math.max(1, Math.min(200, Number(url.searchParams.get("limit") || "10"))),
          loginWaitMs: Math.max(
            30,
            Math.min(
              1800,
              Number(
                url.searchParams.get("wait") ||
                process.env.DIGISTORE24_LOGIN_WAIT_SECONDS ||
                process.env.DIGISTORE24_REFRESH_WAIT_SECONDS ||
                "600"
              )
            )
          ) * 1000,
          promote: url.searchParams.get("promote") === "1",
          confirm: url.searchParams.get("confirm") === "1",
          affiliateId: process.env.DIGISTORE24_ID || "UnlovedProducts",
          userId: requestUserId,
        });

        return sendJson(res, result.success ? 200 : 409, result);
      } finally {
        collectBusy = false;
      }
    }

    return sendJson(res, 404, { error: "not_found" });
  } catch (err) {
    return sendJson(res, 500, {
      error: err?.message || String(err),
      stack: err?.stack || "",
    });
  }
});

await startDaemon();
