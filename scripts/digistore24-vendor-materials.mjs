import crypto from "node:crypto";

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
  const h = String(host || "").toLowerCase();
  return MARKETPLACE_HOSTS.has(h) || h.endsWith(".digistore24.com") || h.endsWith(".digistore24-app.com");
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

export function extractBuyerFacingBlocks(text) {
  const body = cleanText(text, 20000);
  const lines = body.split(/(?<=[.!?])\s+/).map(l => cleanText(l, 500)).filter(Boolean);

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
  await conn.query(`
    CREATE TABLE IF NOT EXISTS product_vendor_materials (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      product_id BIGINT NOT NULL,
      source_url TEXT NOT NULL,
      source_url_hash VARCHAR(64) NOT NULL,
      source_type VARCHAR(64) NOT NULL,
      domain VARCHAR(255) NULL,
      title TEXT NULL,
      content_text TEXT NULL,
      structured_blocks JSON NULL,
      is_vendor_hosted TINYINT(1) NOT NULL DEFAULT 1,
      fetch_status VARCHAR(32) NOT NULL DEFAULT 'ok',
      discovered_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_vendor_material_product_url (product_id, source_url_hash),
      INDEX idx_vendor_materials_product (product_id),
      INDEX idx_vendor_materials_type (source_type)
    )
  `);
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
