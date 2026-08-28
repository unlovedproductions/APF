import { extractBuyerFacingBlocks } from "./digistore24-vendor-materials.mjs";

function clean(value, limit = 10000) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
}

export function isMarketplaceBrandName(value) {
  const text = clean(value, 255);
  if (/^(digistore24?|marketplace)$/i.test(text)) return true;
  // Placeholder minted when detail title was missing
  if (/^digistore24\s+product\s+\d+/i.test(text)) return true;
  return false;
}

const MARKETPLACE_CATEGORY_RE =
  /^(digistore24?(\s+marketplace)?|marketplace|digistore)$/i;
const TITLE_NICHE_RE =
  /\s+-\s+(health|fitness|business|software|dating|education|gambling|gaming|home|garden|finance|nutra|beauty|spirituality|travel|self[- ]?help|make\s*money|weight\s*loss)\s*$/i;
const NAME_SUFFIX_CATEGORIES = [
  [/\bsupplements?\b/i, "Health"],
  [/\bnitric\s+oxide\b|\bmale\s+enhancement\b/i, "Health"],
  [/\bbook\b|\(printed\)/i, "Books"],
  [/\bdownloads?\b/i, "Downloads"],
  [/\bcourse\b|member\s*area|video\s+courses?/i, "Courses"],
  [/\bgarden\b|homestead|backyard/i, "Home & Garden"],
  [/\bsewing\b|serger\b/i, "Courses"],
];
const NICHE_LABEL_MAP = {
  health: "Health",
  fitness: "Fitness",
  business: "Business",
  software: "Software",
  dating: "Dating",
  education: "Education",
  gambling: "Gambling",
  gaming: "Gaming",
  home: "Home",
  garden: "Home & Garden",
  finance: "Finance",
  nutra: "Health",
  beauty: "Beauty",
  spirituality: "Spirituality",
  travel: "Travel",
  "self-help": "Self-Help",
  "self help": "Self-Help",
  "make money": "Business",
  "weight loss": "Health",
};

export function isMarketplaceCategoryPlaceholder(value) {
  const text = clean(value, 255);
  if (!text) return true;
  return MARKETPLACE_CATEGORY_RE.test(text);
}

function normalizeNicheLabel(raw) {
  const key = clean(raw, 64).toLowerCase();
  if (!key) return "";
  if (NICHE_LABEL_MAP[key]) return NICHE_LABEL_MAP[key];
  return key.replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 64);
}

export function inferProductCategory(...texts) {
  for (const text of texts) {
    const source = clean(text, 500);
    if (!source || isMarketplaceCategoryPlaceholder(source)) continue;
    const nicheMatch = source.match(TITLE_NICHE_RE);
    if (nicheMatch) return normalizeNicheLabel(nicheMatch[1]);
  }
  for (const text of texts) {
    const source = clean(text, 500);
    if (!source) continue;
    for (const [re, category] of NAME_SUFFIX_CATEGORIES) {
      if (re.test(source)) return category;
    }
  }
  return "";
}

/**
 * Prefer a real marketplace Category/Niche label, then title/name/material hints.
 * Never returns Digistore24 / Marketplace placeholders.
 */
export function resolveProductCategory({
  category = "",
  name = "",
  title = "",
  vendorMaterials = [],
} = {}) {
  const parsed = clean(category, 255);
  if (parsed && !isMarketplaceCategoryPlaceholder(parsed)) {
    return normalizeNicheLabel(parsed) || parsed;
  }
  const materialTitles = (Array.isArray(vendorMaterials) ? vendorMaterials : [])
    .map((m) => clean(m?.title, 255))
    .filter(Boolean);
  return inferProductCategory(name, title, ...materialTitles);
}

export function resolveProductName(extractedTitle, listingText, platformProductId) {
  for (const candidate of [extractedTitle, listingText]) {
    const value = clean(candidate, 255);
    if (value && !isMarketplaceBrandName(value)) return value;
  }
  return `Digistore24 Product ${platformProductId || "unknown"}`;
}

const JUNK_VENDOR_TITLE_RE = /^(compliance guidelines|banners|faq|privacy policy|terms|legal notice|homepage|dashboard|settings|reports)$/i;
const COMMISSION_PROMOTING_RE = /^earn\s+\d+%?\s*commission\s+promoting\s+(.+?)(?:\s+-\s+\w+)?$/i;
const AFFILIATE_PRICE_MARKERS = [
  "epc",
  "commission",
  "conversion rate",
  "affiliates are seeing",
  "avg payout",
  "per sale",
  "/sale",
];

export function sanitizeExportProductName(name) {
  let text = clean(name, 255);
  if (!text) return "";

  text = text.replace(/^earn\s+\d+%?\s*commission\s+promoting\s+/i, "");
  text = text.replace(/\s*-\s*(health|fitness|digistore\d*|clickbank|marketplace|supplements?)\s*$/i, "");
  text = text.replace(/\s*\(?\d+%\s+commission\)?/gi, "");
  text = text.replace(/\s*affiliate\s+offer/gi, "");
  text = text.replace(/\s{2,}/g, " ").trim().replace(/^[- :|]+|[- :|]+$/g, "");

  if (!text) {
    const fallback = clean(name, 255).split(" - ")[0].split(" | ")[0];
    return fallback.slice(0, 120);
  }
  return text.slice(0, 120);
}

export function isJunkVendorMaterialTitle(value) {
  const text = clean(value, 255);
  if (!text) return true;
  if (isMarketplaceBrandName(text)) return true;
  if (JUNK_VENDOR_TITLE_RE.test(text)) return true;
  if (/compliance guidelines/i.test(text)) return true;
  if (/^banners$/i.test(text)) return true;
  if (/page not found/i.test(text)) return true;
  if (/^coda\b/i.test(text) && /not found/i.test(text)) return true;
  return false;
}

function candidateFromVendorTitle(title) {
  const raw = clean(title, 255);
  if (!raw) return "";
  const commissionMatch = raw.match(COMMISSION_PROMOTING_RE);
  if (commissionMatch) {
    return sanitizeExportProductName(commissionMatch[1]);
  }
  if (isJunkVendorMaterialTitle(raw)) return "";
  return sanitizeExportProductName(raw);
}

const SOURCE_TYPE_PRIORITY = {
  offer_page: 0,
  order_page: 1,
  sales_page: 2,
};

export function resolveExportProductName(product, vendorMaterials = []) {
  const platformProductId = clean(
    product?.platformProductId || product?.platform_product_id || "",
    64,
  );
  const stored = sanitizeExportProductName(product?.name || "");
  if (stored && !isMarketplaceBrandName(stored)) {
    return stored;
  }

  const materials = Array.isArray(vendorMaterials) ? [...vendorMaterials] : [];

  for (const material of materials) {
    const raw = clean(material?.title, 255);
    const commissionMatch = raw.match(COMMISSION_PROMOTING_RE);
    if (!commissionMatch) continue;
    const candidate = sanitizeExportProductName(commissionMatch[1]);
    if (candidate && !isMarketplaceBrandName(candidate)) {
      return candidate;
    }
  }

  materials.sort((a, b) => {
    const aPri = SOURCE_TYPE_PRIORITY[clean(a?.source_type || "").toLowerCase()] ?? 9;
    const bPri = SOURCE_TYPE_PRIORITY[clean(b?.source_type || "").toLowerCase()] ?? 9;
    return aPri - bPri;
  });

  for (const material of materials) {
    const candidate = candidateFromVendorTitle(material?.title);
    if (candidate && !isMarketplaceBrandName(candidate)) {
      return candidate;
    }
  }

  return `Digistore24 Product ${platformProductId || "unknown"}`;
}

export function sanitizeBuyerPrice(value, cartValue) {
  const text = clean(value, 200);
  const lowered = text.toLowerCase();
  const looksAffiliate = AFFILIATE_PRICE_MARKERS.some((marker) => lowered.includes(marker));
  const sentenceCount = (text.match(/[.!?]/g) || []).length;
  const looksMarketing = text.length > 40 || sentenceCount > 0;

  const isShortBuyerPrice = /^(free|varies|see official offer page|\$?\d{1,6}(?:[.,]\d{1,2})?(?:\s*(?:usd|eur|gbp))?)$/i.test(text)
    || /^from\s+\$?\d{1,6}(?:[.,]\d{1,2})?$/i.test(text)
    || /^\$?\d{1,6}(?:[.,]\d{1,2})?\s*[-–]\s*\$?\d{1,6}(?:[.,]\d{1,2})?$/i.test(text);

  if (text && isShortBuyerPrice && !looksAffiliate) {
    if (/^\$?\d/.test(text) && !text.startsWith("$") && /^\d/.test(text)) {
      const num = Number(text.replace(",", "."));
      if (Number.isFinite(num)) return `$${num.toFixed(2)}`;
    }
    return text;
  }

  if (text && !looksAffiliate && !looksMarketing && text.length <= 40) {
    return text;
  }

  const cart = Number(cartValue);
  if (Number.isFinite(cart) && cart > 0) {
    return `$${cart.toFixed(2)}`;
  }

  return "See official offer page";
}

/** Parse a lone $N buyer price; empty when not a simple numeric price. */
export function parseBuyerPriceNumber(value) {
  const text = clean(value, 40);
  const m = text.match(/^\$?\s*(\d{1,6}(?:[.,]\d{1,2})?)\s*(?:usd|eur|gbp)?$/i);
  if (!m) return null;
  const n = Number(String(m[1]).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/**
 * Prefer cartValue / vendor pricing when brief price is a stale generic $ amount
 * that does not match known buyer price (Wave E $67 vs cart mismatch).
 */
export function reconcileBuyerPriceWithCart(value, cartValue, options = {}) {
  const sanitized = sanitizeBuyerPrice(value, cartValue);
  const briefN = parseBuyerPriceNumber(sanitized);
  const cart = Number(cartValue);
  const hasCart = Number.isFinite(cart) && cart > 0;

  let vendorN = null;
  if (Array.isArray(options.vendorMaterials) && options.vendorMaterials.length) {
    try {
      const extracted = extractBuyerPriceFromVendorMaterials(options.vendorMaterials);
      if (extracted?.cartValue != null) vendorN = Number(extracted.cartValue);
    } catch {
      vendorN = null;
    }
  }

  const withinTol = (a, b) => {
    const abs = Math.abs(a - b);
    const rel = abs / Math.max(a, b, 1);
    return abs <= 2 || rel <= 0.12;
  };

  if (briefN != null) {
    if (vendorN != null && Number.isFinite(vendorN) && withinTol(briefN, vendorN)) {
      return `$${briefN.toFixed(2)}`;
    }
    if (hasCart && withinTol(briefN, cart)) {
      return sanitized.startsWith("$") ? sanitized : `$${briefN.toFixed(2)}`;
    }
    if (hasCart && !withinTol(briefN, cart)) {
      return `$${cart.toFixed(2)}`;
    }
    if (vendorN != null && Number.isFinite(vendorN) && !withinTol(briefN, vendorN)) {
      return `$${vendorN.toFixed(2)}`;
    }
    return sanitized;
  }

  if (sanitized === "See official offer page" || sanitized === "Varies" || sanitized === "Free") {
    return sanitized;
  }
  return sanitized;
}

/** Pull a short buyer price from prose without cartValue fallback (competitor rows). */
export function extractShortBuyerPrice(text) {
  const hay = clean(text, 4000);
  if (!hay) return "";
  const matches = [...hay.matchAll(/\$\s*(\d{1,4}(?:\.\d{2})?)/g)];
  for (const match of matches) {
    const n = Number(match[1]);
    if (!Number.isFinite(n) || n < 5 || n > 5000) continue;
    const idx = match.index ?? 0;
    const window = hay.slice(Math.max(0, idx - 48), idx + 48).toLowerCase();
    const hasAffiliate = AFFILIATE_PRICE_MARKERS.some((marker) => window.includes(marker));
    if (hasAffiliate && !/\bprice\b/.test(window)) continue;
    const sanitized = sanitizeBuyerPrice(`$${n.toFixed(2)}`);
    if (/^\$\d/.test(sanitized)) return sanitized;
  }
  return "";
}

/**
 * Extract a buyer-facing price from vendor materials without inventing.
 * Prefer order/sales "only $X" / add-to-cart copy; then Digistore marketplace
 * "Price $X Commission" (product price, not bare EPC dollars).
 */
export function extractBuyerPriceFromVendorMaterials(materials = []) {
  const list = Array.isArray(materials) ? [...materials] : [];
  const typePri = { order_page: 0, sales_page: 1, offer_page: 2 };
  list.sort((a, b) => {
    const aPri = typePri[clean(a?.source_type || a?.sourceType || "").toLowerCase()] ?? 9;
    const bPri = typePri[clean(b?.source_type || b?.sourceType || "").toLowerCase()] ?? 9;
    return aPri - bPri;
  });

  const toResult = (n, source, reason) => {
    if (!Number.isFinite(n) || n < 5 || n > 5000) return null;
    return {
      display: `$${n.toFixed(2)}`,
      cartValue: n,
      source,
      reason,
    };
  };

  for (const material of list) {
    const source = clean(material?.source_type || material?.sourceType || "").toLowerCase();
    if (source === "offer_page" || source === "banners") continue;
    const text = clean(material?.content_text || material?.contentText || "", 20000);
    if (!text) continue;

    const only = text.match(
      /(?:temporarily\s+)?only\s+\$?\s*(\d{1,4}(?:\.\d{2})?)\s*(?:USD|usd)?/i,
    );
    if (only) {
      const n = Number(only[1]);
      // Ignore tiny "only $X" promo chips that are not full product prices.
      if (n >= 15) {
        const hit = toResult(n, source, "only_price");
        if (hit) return hit;
      }
    }

    const nearCart = text.match(
      /\$\s*(\d{1,4}(?:\.\d{2})?)\s*(?:USD|usd)?[^.]{0,40}(?:add to cart|buy now|order now|checkout)/i,
    ) || text.match(
      /(?:add to cart|buy now|order now|checkout)[^.]{0,40}\$\s*(\d{1,4}(?:\.\d{2})?)/i,
    );
    if (nearCart) {
      const hit = toResult(Number(nearCart[1]), source, "cart_cta_price");
      if (hit) return hit;
    }
  }

  for (const material of list) {
    const source = clean(material?.source_type || material?.sourceType || "").toLowerCase();
    if (source !== "offer_page") continue;
    const text = clean(material?.content_text || material?.contentText || "", 20000);
    // Digistore marketplace listing: "Price $50.99 Commission 75%" — product price, not EPC.
    const listing = text.match(/\bPrice\s+\$?\s*(\d{1,4}(?:\.\d{2})?)\s+Commission\b/i);
    if (listing) {
      const n = Number(listing[1]);
      // Marketplace product prices are rarely under $15; bare EPC often is.
      if (n >= 15) {
        const hit = toResult(n, source, "marketplace_price_commission");
        if (hit) return hit;
      }
    }
  }

  return null;
}

function parsePercent(text, hints = []) {
  const source = clean(text, 20000);
  for (const hint of hints) {
    const re = new RegExp(`${hint}[^\\d]{0,30}(\\d+(?:\\.\\d+)?)\\s*%`, "i");
    const match = source.match(re);
    if (match) return Number(match[1]);
  }
  const generic = source.match(/(\d+(?:\.\d+)?)\s*%\s*(?:commission|conversion)/i);
  return generic ? Number(generic[1]) : null;
}

function parseCurrency(text, hints = []) {
  const source = clean(text, 20000);
  for (const hint of hints) {
    const re = new RegExp(`${hint}[^\\d$€£]{0,30}[$€£]?\\s*(\\d{1,6}(?:[\\.,]\\d{1,2})?)`, "i");
    const match = source.match(re);
    if (match) return Number(match[1].replace(",", "."));
  }
  const generic = source.match(/[$€£]\s*(\d{1,6}(?:[\.,]\d{1,2})?)/);
  return generic ? Number(generic[1].replace(",", ".")) : null;
}

function parseDate(text, hints = []) {
  const source = clean(text, 20000);
  for (const hint of hints) {
    const re = new RegExp(`${hint}[^\\da-zA-Z]{0,20}([\\d]{1,2}[./-][\\d]{1,2}[./-][\\d]{2,4}|[A-Za-z]{3,10}\\s+\\d{1,2},?\\s+\\d{2,4})`, "i");
    const match = source.match(re);
    if (match) {
      const parsed = new Date(match[1]);
      if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
    }
  }
  return null;
}

function parseFieldByLabel(textOrLines, labels = []) {
  const source = Array.isArray(textOrLines)
    ? textOrLines.join("\n")
    : String(textOrLines ?? "");
  const lines = source.split(/\n+/).map((line) => clean(line, 500)).filter(Boolean);

  for (const line of lines) {
    for (const label of labels) {
      const re = new RegExp(`^${label}\\s*[:|-]?\\s*(.+)$`, "i");
      const match = line.match(re);
      if (match) return clean(match[1], 255);
    }
  }

  const flat = clean(source, 20000);
  for (const label of labels) {
    const re = new RegExp(
      `(?:^|\\s)${label}\\s*[:|-]\\s*([^|]+?)(?=\\s+(?:category|niche|topic|commission|price|vendor|seller|creator|affiliate)\\b|$)`,
      "i",
    );
    const match = flat.match(re);
    if (match) return clean(match[1], 255);
  }

  return "";
}

export function extractDigistore24Detail(raw) {
  const rawTitle = clean(raw.title, 255);
  const title = isMarketplaceBrandName(rawTitle) ? "" : rawTitle;
  // Keep newlines for label-at-line-start parse; also support collapsed bodies.
  const bodySource = String(raw.body ?? "");
  const body = clean(bodySource, 12000);
  const lines = bodySource.split(/\n+/).map((line) => clean(line, 500)).filter(Boolean);
  const importantSections = lines
    .filter((line) => /vendor|seller|creator|category|niche|topic|commission|price|cart value|conversion|refund|cancel|created|listed/i.test(line))
    .join(" | ");
  const description = clean((raw.descriptionSection || bodySource).slice(0, 3500), 3500);
  const parsedVendor = parseFieldByLabel(bodySource.length ? bodySource : body, [
    "vendor",
    "seller",
    "creator",
    "vendor name",
    "seller name",
  ]);
  const vendor = isMarketplaceBrandName(parsedVendor) ? "" : parsedVendor;
  const parsedCategory = parseFieldByLabel(bodySource.length ? bodySource : body, ["category", "niche", "topic"]);
  const category = resolveProductCategory({
    category: parsedCategory,
    name: title,
    title: rawTitle || title,
  });
  const commissionRate = parsePercent(`${importantSections} ${body}`, ["commission", "affiliate"]);
  const conversionRate = parsePercent(`${importantSections} ${body}`, ["conversion", "cart conversion"]);
  const refundRate = parsePercent(`${importantSections} ${body}`, [
    "refund",
    "refund rate",
    "cancellation",
    "cancellation rate",
    "cancel rate",
  ]);
  const cartValue = parseCurrency(`${importantSections} ${body}`, ["cart value", "price", "payout", "earnings", "epc"]);
  const platformCreatedAt = parseDate(`${importantSections} ${body}`, ["created", "listed", "published"]);
  const buyerBlocks = extractBuyerFacingBlocks(description || body);

  return {
    title,
    vendor,
    category,
    description,
    commissionRate,
    conversionRate,
    refundRate,
    cartValue,
    platformCreatedAt,
    buyerBlocks,
    detectedMeta: {
      detected_vendor: vendor || null,
      detected_category: category || null,
      detected_commission_rate: commissionRate,
      detected_conversion_rate: conversionRate,
      detected_refund_rate: refundRate,
      detected_cart_value: cartValue,
      detected_platform_created_at: platformCreatedAt,
      buyer_headline: buyerBlocks.headline || null,
      buyer_core_promise: buyerBlocks.core_promise || null,
    },
  };
}
