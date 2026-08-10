import crypto from "node:crypto";
import { ensureTableExists } from "./apf-db-helpers.mjs";
import { isAffiliateMetaSignal } from "./enrichment-source-trust.mjs";

const MARKETPLACE_HOSTS = new Set([
  "digistore24.com",
  "digistore24-app.com",
  "checkout-ds24.com",
  "www.digistore24.com",
  "www.digistore24-app.com",
  "www.checkout-ds24.com",
]);

const AFFILIATE_HOST_HINTS = [
  "clickbank",
  "jvzoo",
  "warriorplus",
  "affiliate",
  "hop.",
  "promo.",
];

export function cleanText(value, limit = 12000) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
}

export function hostnameFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

export function isMarketplaceHost(host) {
  const h = String(host || "").toLowerCase().replace(/^www\./, "");
  return MARKETPLACE_HOSTS.has(h)
    || MARKETPLACE_HOSTS.has(`www.${h}`)
    || h.endsWith(".digistore24.com")
    || h.endsWith(".digistore24-app.com")
    || h.endsWith(".checkout-ds24.com");
}

export function isMarketplaceVendorName(name) {
  const n = String(name || "").trim().toLowerCase();
  return !n || n === "digistore" || n === "digistore24" || n.includes("digistore24");
}

/** Prefer real product creator; never Digistore marketplace. Fallback: first non-marketplace materials domain. */
export function resolveCreatorVendor(productVendor, materials = []) {
  const fromProduct = String(productVendor || "").trim();
  if (!isMarketplaceVendorName(fromProduct)) return fromProduct;
  for (const m of materials || []) {
    const host = String(m.domain || hostnameFromUrl(m.source_url) || "")
      .toLowerCase()
      .replace(/^www\./, "");
    if (host && !isMarketplaceHost(host)) return host;
  }
  return "";
}

export function isAffiliateInfrastructureHost(host) {
  const h = String(host || "").toLowerCase();
  return AFFILIATE_HOST_HINTS.some(x => h.includes(x));
}

export function classifySourceType(url, pageText = "") {
  const u = String(url || "").toLowerCase();
  const text = String(pageText || "").toLowerCase();

  if (u.includes("checkout-ds24.com") || /order|checkout|cart|buy now/i.test(text)) return "order_page";
  if (/vsl|video sales|watch this/i.test(u + " " + text)) return "vsl";
  if (/webinar|replay|register/i.test(u + " " + text)) return "webinar";
  if (/faq|questions/i.test(u + " " + text)) return "faq";
  if (/bonus|bonuses/i.test(u + " " + text)) return "bonus";
  if (/testimonial|reviews?|success stories/i.test(u + " " + text)) return "testimonial";
  if (/swipe|email copy|promo email/i.test(u + " " + text)) return "email_swipe";
  if (isMarketplaceHost(hostnameFromUrl(url))) return "offer_page";
  return "sales_page";
}

const DASHBOARD_CHROME_RE =
  /dashboard\s+marketplace|skip to (?:main )?content|digistore24 promote|\bepc\b|\d+%\s*commission|affiliates? are seeing|compliance guidelines|page not found|^coda\b/i;
const SKIP_LEDGER_SOURCE_TYPES = new Set(["offer_page", "email_swipe"]);
const JUNK_MATERIAL_TITLE_RE =
  /compliance guidelines|page not found|^coda\b|\bbanners\b|privacy policy|terms of service|legal notice/i;
const INGREDIENT_RE =
  /\b(niacinamide|nad\+?|coq-?10|pqq|l-?citrulline|d-?ribose|itadori|resveratrol|pterostilbene|berberine|astragalus|seed(?:s)?|herb(?:s)?|vitamin\s+[a-ek]\b|magnesium|zinc|mitochondr)/i;
const GENERIC_CLAIM_RE =
  /positioned as a .+ product|verify (?:current )?(?:price|details|claims|the (?:current )?offer)|viewers should verify|vendor copy presents|solution in (?:this |the )?(?:category|product category)|some marketing claims should be verified/i;

function isChromeLine(line) {
  return !line || DASHBOARD_CHROME_RE.test(line) || isAffiliateMetaSignal(line);
}

export function extractBuyerFacingBlocks(text) {
  const body = cleanText(text, 20000);
  const lines = body
    .split(/(?<=[.!?])\s+/)
    .map(l => cleanText(l, 500))
    .filter(Boolean)
    .filter((line) => !isChromeLine(line));

  const pick = (patterns, limit = 8) =>
    lines.filter(line => patterns.some(re => re.test(line))).slice(0, limit);

  const headlines = pick([/^(discover|introducing|finally|the #1|new|how to|get|unlock|transform)/i], 3);
  const benefits = pick([/benefit|help you|you will|you'll|get access|includes|deliver|works by|designed to/i], 8);
  const problems = pick([/struggle|problem|tired of|without|if you|suffer|frustrated|can't/i], 6);
  const objections = pick([/guarantee|refund|money back|risk.?free|no questions|secure|privacy/i], 5);
  const testimonials = pick([/said|testimonial|review|stars|verified|customer/i], 6);
  const pricing = pick([/\$|price|only|per month|one.?time|subscription|trial|payment/i], 4);
  const faq = pick([/\?$/], 6);

  return {
    headline: headlines[0] || lines[0] || "",
    subheadline: headlines[1] || lines[1] || "",
    core_promise: benefits[0] || problems[0] || "",
    benefits,
    problems,
    objections,
    testimonials,
    pricing,
    faq,
  };
}

function materialUrl(material) {
  return cleanText(material?.source_url || material?.url || material?.sourceUrl || "", 2000);
}

function materialType(material) {
  return cleanText(material?.source_type || material?.sourceType || "", 64).toLowerCase();
}

function isJunkLedgerMaterial(material) {
  const type = materialType(material);
  if (SKIP_LEDGER_SOURCE_TYPES.has(type)) return true;
  if (JUNK_MATERIAL_TITLE_RE.test(String(material?.title || ""))) return true;
  return false;
}

function splitClaimLines(text) {
  return String(text || "")
    .split(/\n+|(?<=[.!?])\s+/)
    .map((line) => cleanText(line, 280))
    .filter((line) => line.length >= 12 && line.length <= 280 && !isChromeLine(line));
}

function classifyClaimLine(line) {
  if (/\$\s*\d{1,4}(?:\.\d{2})?/.test(line) && /bottle|pack|price|only|usd|kit/i.test(line)) {
    return "price";
  }
  if (/guarantee|money[- ]back|refund|risk-?free|\b\d{2}[- ]day\b/i.test(line)) return "guarantee";
  if (INGREDIENT_RE.test(line)) return "ingredient";
  if (
    /(said|testimonial|stars?|verified (?:buyer|customer)|[“"])/i.test(line)
    && /\b(i|my|we|love|works|helped)\b/i.test(line)
  ) {
    return "testimonial";
  }
  if (
    /help you|you'll|designed to|supports?|boosts?|includes?|works by|unlock|energy|grow your|kit includes|seeds|mitochondr|nitric/i.test(line)
  ) {
    return "vendor_claim";
  }
  return "";
}

function quoteSpan(haystack, line) {
  const hay = String(haystack || "");
  const needle = String(line || "").slice(0, 40);
  const idx = hay.toLowerCase().indexOf(needle.toLowerCase());
  if (idx < 0) return cleanText(line, 180);
  return cleanText(hay.slice(Math.max(0, idx - 20), idx + 140), 180);
}

function claimDedupeKey(text) {
  return cleanText(text, 240).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 80);
}

export function isGenericCommonClaim(text) {
  const value = cleanText(text, 500);
  if (!value) return true;
  return GENERIC_CLAIM_RE.test(value);
}

export function claimTextsForBrief(ledger = []) {
  return (Array.isArray(ledger) ? ledger : [])
    .filter((row) => ["vendor_claim", "ingredient", "guarantee", "price"].includes(row?.kind))
    .map((row) => cleanText(row.text, 240))
    .filter(Boolean)
    .slice(0, 8);
}

export function seedCommonClaimsFromLedger(claims = [], ledger = []) {
  const seeded = claimTextsForBrief(ledger);
  const existing = (Array.isArray(claims) ? claims : [])
    .map((item) => cleanText(item, 240))
    .filter(Boolean);
  const nonGeneric = existing.filter((item) => !isGenericCommonClaim(item));
  if (seeded.length && nonGeneric.length === 0) return seeded;
  return nonGeneric.length ? nonGeneric : seeded;
}

/**
 * Deterministic cited claims from vendor order/sales pages + independent review bodies.
 * Skips Digistore offer/compliance chrome. Empty ledger is valid.
 */
export function extractClaimLedger(vendorMaterials = [], reviewSources = [], options = {}) {
  const cap = Number(options.cap) > 0 ? Number(options.cap) : 12;
  const seen = new Set();
  const rows = [];

  const add = (row) => {
    const text = cleanText(row?.text, 240);
    const sourceUrl = cleanText(row?.source_url, 2000);
    if (!text || !sourceUrl || isChromeLine(text)) return;
    const key = claimDedupeKey(text);
    if (!key || seen.has(key)) return;
    seen.add(key);
    rows.push({
      text,
      kind: row.kind,
      source_url: sourceUrl,
      source_type: cleanText(row.source_type, 64),
      quote: cleanText(row.quote || text, 180),
    });
  };

  const materials = [...(vendorMaterials || [])]
    .filter((material) => material && !isJunkLedgerMaterial(material))
    .sort((a, b) => {
      const pri = { order_page: 0, sales_page: 1, testimonial: 2, faq: 3 };
      return (pri[materialType(a)] ?? 9) - (pri[materialType(b)] ?? 9);
    });

  for (const material of materials) {
    const type = materialType(material);
    if (!["order_page", "sales_page", "testimonial", "faq"].includes(type)) continue;
    const url = materialUrl(material);
    if (!url || isMarketplaceHost(hostnameFromUrl(url))) continue;

    const structured = material.structured_blocks || material.structuredBlocks || {};
    const body = String(material.content_text || material.contentText || material.excerpt || "");
    const haystack = [
      body,
      ...(structured.benefits || []),
      ...(structured.pricing || []),
      ...(structured.objections || []),
      structured.headline || "",
      structured.core_promise || "",
    ].filter(Boolean).join("\n");

    for (const line of structured.pricing || []) {
      if (/\$/.test(line) || classifyClaimLine(line) === "price") {
        add({ text: line, kind: "price", source_url: url, source_type: type, quote: line });
      }
    }
    for (const line of structured.objections || []) {
      if (/guarantee|refund|money/i.test(line)) {
        add({ text: line, kind: "guarantee", source_url: url, source_type: type, quote: line });
      }
    }
    for (const line of structured.benefits || []) {
      const kind = classifyClaimLine(line) || "vendor_claim";
      if (kind === "testimonial") continue;
      add({ text: line, kind, source_url: url, source_type: type, quote: quoteSpan(haystack, line) });
    }
    for (const line of structured.testimonials || []) {
      add({ text: line, kind: "testimonial", source_url: url, source_type: type, quote: line });
    }
    if (structured.core_promise) {
      add({
        text: structured.core_promise,
        kind: classifyClaimLine(structured.core_promise) || "vendor_claim",
        source_url: url,
        source_type: type,
        quote: structured.core_promise,
      });
    }
    for (const line of splitClaimLines(body)) {
      const kind = classifyClaimLine(line);
      if (!kind) continue;
      add({ text: line, kind, source_url: url, source_type: type, quote: quoteSpan(haystack, line) });
    }
  }

  for (const source of reviewSources || []) {
    const raw = source?.raw_json && typeof source.raw_json === "object" ? source.raw_json : {};
    const content = String(raw.content_text || "").trim();
    if (content.length < 80) continue;
    const url = cleanText(source.url, 2000);
    if (!url || /scamadviser|scam-detector|bbb\.org/i.test(url)) continue;
    if (isMarketplaceHost(hostnameFromUrl(url))) continue;
    const sentences = splitClaimLines(content).filter((line) => (
      /\b(i|we|works|didn't|does not|shipping|refund|quality|taste|results|packaging)\b/i.test(line)
      && !/\bon\s+(trustpilot|sitejabber|scamadviser)\b/i.test(line)
    ));
    for (const line of sentences.slice(0, 2)) {
      add({
        text: line,
        kind: "independent_review",
        source_url: url,
        source_type: source.source_type || "review",
        quote: line,
      });
    }
  }

  return rows.slice(0, cap);
}

export function resolveExportClaimLedger(storedLedger, vendorMaterials = [], reviewSources = []) {
  const stored = (Array.isArray(storedLedger) ? storedLedger : [])
    .filter((row) => row?.text && row?.source_url);
  if (stored.length) return stored.slice(0, 12);
  return extractClaimLedger(vendorMaterials, reviewSources);
}

export function discoverLinksFromDom(links, baseUrl, affiliateLink = "") {
  const discovered = new Map();
  const baseHost = hostnameFromUrl(baseUrl);
  const salesHost = hostnameFromUrl(affiliateLink);

  const add = (href, hint = "") => {
    if (!href) return;
    let absolute = href;
    try {
      absolute = new URL(href, baseUrl).toString();
    } catch {
      return;
    }
    const host = hostnameFromUrl(absolute);
    if (!host || discovered.has(absolute)) return;
    if (isMarketplaceHost(host) && absolute === baseUrl) return;
    discovered.set(absolute, { url: absolute, host, hint });
  };

  for (const href of links || []) add(href);
  if (affiliateLink) add(affiliateLink, "affiliate_link");

  const prioritized = Array.from(discovered.values())
    .filter(item => !isAffiliateInfrastructureHost(item.host) || item.host === salesHost)
    .sort((a, b) => {
      const score = (item) => {
        let s = 0;
        if (item.url === affiliateLink) s += 100;
        if (item.host && item.host === salesHost && salesHost) s += 80;
        if (!isMarketplaceHost(item.host)) s += 40;
        if (/checkout|order|buy|sales|offer|product|vsl|webinar|faq|bonus/i.test(item.url)) s += 20;
        return s;
      };
      return score(b) - score(a);
    });

  return prioritized.slice(0, 12);
}

export function pageEvaluateExtractScript() {
  return () => {
    const txt = el => (el?.innerText || el?.textContent || "").replace(/\s+/g, " ").trim();
    const title = txt(document.querySelector("h1")) || document.title.replace(/\s+/g, " ").trim();
    const body = txt(document.body).slice(0, 12000);
    const links = Array.from(document.querySelectorAll("a[href]"))
      .map(a => a.href)
      .filter(Boolean);
    return { title, body, links };
  };
}

export function hashSourceUrl(url) {
  return crypto.createHash("sha256").update(String(url || "")).digest("hex");
}

export async function upsertVendorMaterial(conn, {
  productId,
  sourceUrl,
  sourceType,
  title = "",
  contentText = "",
  structuredBlocks = null,
  isVendorHosted = true,
  fetchStatus = "ok",
}) {
  if (!productId || !sourceUrl) return;

  const domain = hostnameFromUrl(sourceUrl);
  const sourceUrlHash = hashSourceUrl(sourceUrl);
  await conn.query(`
    INSERT INTO product_vendor_materials (
      product_id, source_url, source_url_hash, source_type, domain, title, content_text,
      structured_blocks, is_vendor_hosted, fetch_status
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), ?, ?)
    ON DUPLICATE KEY UPDATE
      source_url=VALUES(source_url),
      source_type=VALUES(source_type),
      domain=VALUES(domain),
      title=VALUES(title),
      content_text=VALUES(content_text),
      structured_blocks=VALUES(structured_blocks),
      is_vendor_hosted=VALUES(is_vendor_hosted),
      fetch_status=VALUES(fetch_status),
      updated_at=NOW()
  `, [
    productId,
    sourceUrl,
    sourceUrlHash,
    sourceType,
    domain,
    cleanText(title, 1000),
    cleanText(contentText, 12000),
    JSON.stringify(structuredBlocks || {}),
    isVendorHosted ? 1 : 0,
    fetchStatus,
  ]);
}

export async function ensureVendorMaterialsTable(conn) {
  await ensureTableExists(conn, "product_vendor_materials");
}

export async function loadVendorMaterials(conn, productId) {
  const [rows] = await conn.query(`
    SELECT source_url, source_type, domain, title, content_text, structured_blocks,
           is_vendor_hosted, fetch_status
    FROM product_vendor_materials
    WHERE product_id=?
    ORDER BY
      CASE source_type
        WHEN 'sales_page' THEN 0
        WHEN 'order_page' THEN 1
        WHEN 'offer_page' THEN 2
        WHEN 'vsl' THEN 3
        WHEN 'faq' THEN 4
        WHEN 'bonus' THEN 5
        WHEN 'testimonial' THEN 6
        ELSE 7
      END,
      updated_at DESC
  `, [productId]);
  return rows.map(r => ({
    ...r,
    structured_blocks: typeof r.structured_blocks === "string"
      ? JSON.parse(r.structured_blocks || "{}")
      : (r.structured_blocks || {}),
  }));
}
