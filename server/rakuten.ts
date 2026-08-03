import { XMLParser } from "fast-xml-parser";

type ScoreComponents = {
  recency: number;
  growth: number;
  competition: number;
  quality: number;
};

interface ProcessedProduct {
  platformProductId: string;
  name: string;
  vendor: string;
  category: string;
  keywords: string[];
  description: string;
  saleCount: number;
  aggregateSales: string;
  refundCount: number;
  commissionType?: string;
  affiliateLink: string;
  platformCreatedAt: Date;
  hiddenGemScore: number;
  scoreComponents: ScoreComponents;
}

export type RakutenCredentials = {
  clientId: string;
  clientSecret: string;
  siteId: string;
};

export type RakutenProductSignal = {
  platformProductId: string;
  name: string;
  vendor: string;
  category: string;
  keywords: string[];
  description: string;
  affiliateLink: string;
  price: number;
  createdOn: Date | null;
};

// OpenAPI servers list api.linksynergy.com (legacy LinkShare). api.rakutenmarketing.com often fails DNS.
const TOKEN_URL = "https://api.linksynergy.com/token";
const PRODUCT_SEARCH_URL = "https://api.linksynergy.com/productsearch/1.0";

const DEFAULT_KEYWORDS = [
  "laptop",
  "headphones",
  "kitchen",
  "fitness",
  "home organization",
  "pet supplies",
  "beauty",
  "office chair",
];

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
  isArray: (name) => name === "item",
});

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function parseNumber(value: unknown): number {
  const cleaned = String(value ?? "")
    .replace(/[$,%]/g, "")
    .replace(/,/g, "")
    .trim();
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function textOf(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if ("#text" in obj) return textOf(obj["#text"]);
    if ("_" in obj) return textOf(obj["_"]);
  }
  return "";
}

function toKeywords(...parts: string[]): string[] {
  const tokens = parts
    .join(" ")
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
  return Array.from(new Set(tokens)).slice(0, 14);
}

function parseCreatedOn(raw: string): Date | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // e.g. 2014-07-22/16:17:47
  const normalized = trimmed.includes("/")
    ? trimmed.replace("/", "T")
    : trimmed;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function extractPrice(node: unknown): number {
  if (node == null) return 0;
  if (typeof node === "string" || typeof node === "number") return parseNumber(node);
  if (typeof node === "object") {
    const obj = node as Record<string, unknown>;
    return parseNumber(obj["#text"] ?? obj["_"] ?? obj);
  }
  return 0;
}

export function parseRakutenCredentials(raw: string): RakutenCredentials {
  const trimmed = String(raw ?? "").trim();
  const parts = trimmed.split(":");
  if (parts.length < 3) {
    throw new Error("Rakuten credentials must be in format clientId:clientSecret:siteId");
  }
  const clientId = parts[0]?.trim() ?? "";
  const siteId = parts[parts.length - 1]?.trim() ?? "";
  const clientSecret = parts.slice(1, -1).join(":").trim();
  if (!clientId || !clientSecret || !siteId) {
    throw new Error("Rakuten credentials must be in format clientId:clientSecret:siteId");
  }
  return { clientId, clientSecret, siteId };
}

export function parseProductSearchXml(xml: string): RakutenProductSignal[] {
  let parsed: unknown;
  try {
    parsed = xmlParser.parse(xml);
  } catch (error) {
    throw new Error(
      `Rakuten Product Search XML parse failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const root =
    (parsed as Record<string, unknown>)?.result ??
    (parsed as Record<string, unknown>)?.Result ??
    parsed;
  const rootObj = (root ?? {}) as Record<string, unknown>;
  const itemsRaw = rootObj.item ?? rootObj.Item ?? [];
  const items = Array.isArray(itemsRaw) ? itemsRaw : itemsRaw ? [itemsRaw] : [];

  const signals: RakutenProductSignal[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const mid = textOf(row.mid);
    const sku = textOf(row.sku);
    const name = textOf(row.productname);
    if (!mid || !sku || !name) continue;

    const categoryNode = (row.category ?? {}) as Record<string, unknown>;
    const primary = textOf(categoryNode.primary);
    const secondary = textOf(categoryNode.secondary);
    const category = primary || secondary || "Retail";

    const descriptionNode = (row.description ?? {}) as Record<string, unknown>;
    const shortDesc = textOf(descriptionNode.short);
    const longDesc = textOf(descriptionNode.long);
    const description = (longDesc || shortDesc).slice(0, 1200);

    const salePrice = extractPrice(row.saleprice);
    const listPrice = extractPrice(row.price);
    const price = salePrice > 0 ? salePrice : listPrice;

    const keywordField = textOf(row.keywords);
    const vendor = textOf(row.merchantname) || `MID ${mid}`;
    const affiliateLink = textOf(row.linkurl);
    const createdOn = parseCreatedOn(textOf(row.createdon));

    signals.push({
      platformProductId: `rakuten:${mid}:${sku}`,
      name,
      vendor,
      category,
      keywords: toKeywords(name, vendor, category, keywordField.replace(/~/g, " ")),
      description,
      affiliateLink,
      price,
      createdOn,
    });
  }

  return signals;
}

export function scoreRakutenProducts(signals: RakutenProductSignal[]): ProcessedProduct[] {
  return signals.map((signal) => {
    let recency = 8;
    if (signal.createdOn) {
      const ageDays = (Date.now() - signal.createdOn.getTime()) / (24 * 60 * 60 * 1000);
      recency =
        ageDays <= 30 ? 22 :
        ageDays <= 90 ? 16 :
        ageDays <= 365 ? 10 : 6;
    }

    const growth =
      signal.price >= 80 ? 22 :
      signal.price >= 30 ? 18 :
      signal.price > 0 ? 12 : 6;

    const competition =
      signal.keywords.length >= 8 ? 18 :
      signal.keywords.length >= 4 ? 14 : 8;

    const qualitySignals =
      (signal.affiliateLink ? 1 : 0) +
      (signal.description.length > 60 ? 1 : 0) +
      (signal.price > 0 ? 1 : 0) +
      (signal.category && signal.category !== "Retail" ? 1 : 0);
    const quality =
      qualitySignals >= 4 ? 15 :
      qualitySignals === 3 ? 10 :
      qualitySignals === 2 ? 6 : 2;

    const scoreComponents: ScoreComponents = { recency, growth, competition, quality };
    const hiddenGemScore = clamp(recency + growth + competition + quality, 0, 100);

    return {
      platformProductId: signal.platformProductId,
      name: signal.name,
      vendor: signal.vendor,
      category: signal.category,
      keywords: signal.keywords,
      description: signal.description,
      saleCount: 0,
      aggregateSales: signal.price > 0 ? signal.price.toFixed(2) : "0",
      refundCount: 0,
      commissionType: "rakuten-product-search-1.0",
      affiliateLink: signal.affiliateLink,
      platformCreatedAt: signal.createdOn ?? new Date(),
      hiddenGemScore,
      scoreComponents,
    };
  });
}

async function getRakutenAccessToken(creds: RakutenCredentials): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    scope: creds.siteId,
  });

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const payload = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!response.ok || !payload.access_token) {
    const detail = payload.error_description || payload.error || JSON.stringify(payload).slice(0, 300);
    throw new Error(`Rakuten token exchange failed (${response.status}): ${detail}`);
  }

  return payload.access_token;
}

async function searchRakutenProducts(
  token: string,
  keyword: string,
  options?: { max?: number; page?: number; mid?: string }
): Promise<string> {
  const params = new URLSearchParams({
    keyword,
    max: String(clamp(options?.max ?? 50, 1, 1000)),
    pagenumber: String(clamp(options?.page ?? 1, 1, 5000)),
    // Legacy XML endpoints require the OAuth access token as `token` query param.
    // Kong still expects Authorization: Bearer as well.
    token,
  });
  if (options?.mid) params.set("mid", options.mid);

  const response = await fetch(`${PRODUCT_SEARCH_URL}?${params.toString()}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/xml",
    },
  });

  const xml = await response.text();
  if (!response.ok) {
    throw new Error(
      `Rakuten Product Search failed (${response.status}): ${xml.slice(0, 350)}`
    );
  }

  const errorMatch = xml.match(/<ErrorText>([^<]+)<\/ErrorText>/i);
  if (errorMatch?.[1]) {
    throw new Error(
      `Rakuten Product Search rejected the token/request: ${errorMatch[1]}. Confirm the Developer Portal app + SID, finish publisher profile onboarding, and ensure Product Search is enabled for the account.`
    );
  }

  return xml;
}

export async function fetchAndProcessRakutenProducts(
  clientId: string,
  clientSecret: string,
  siteId: string,
  options?: { maxProducts?: number; keywords?: string[]; mid?: string }
): Promise<ProcessedProduct[]> {
  const creds = parseRakutenCredentials(`${clientId}:${clientSecret}:${siteId}`);
  const maxProducts = clamp(options?.maxProducts ?? 120, 20, 500);
  const keywords = (options?.keywords?.length ? options.keywords : DEFAULT_KEYWORDS)
    .map((keyword) => keyword.trim())
    .filter(Boolean);

  const token = await getRakutenAccessToken(creds);
  const seen = new Set<string>();
  const signals: RakutenProductSignal[] = [];

  for (const keyword of keywords) {
    for (let page = 1; page <= 2; page++) {
      const xml = await searchRakutenProducts(token, keyword, {
        max: 50,
        page,
        mid: options?.mid,
      });
      const pageSignals = parseProductSearchXml(xml);
      for (const signal of pageSignals) {
        if (seen.has(signal.platformProductId)) continue;
        seen.add(signal.platformProductId);
        signals.push(signal);
        if (signals.length >= maxProducts) break;
      }
      if (signals.length >= maxProducts || pageSignals.length === 0) break;
    }
    if (signals.length >= maxProducts) break;
  }

  if (signals.length === 0) {
    throw new Error(
      "Rakuten Product Search returned no products. Join/approve advertisers in the publisher dashboard, verify clientId:clientSecret:siteId, then retry."
    );
  }

  return scoreRakutenProducts(signals);
}
