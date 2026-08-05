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
  const category = parseFieldByLabel(bodySource.length ? bodySource : body, ["category", "niche", "topic"])
    || "Digistore24 Marketplace";
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
