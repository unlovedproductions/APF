/**
 * ShareASale API integration for affiliates.
 * Uses signed requests and pipe-delimited responses.
 */

import crypto from "crypto";

const SHAREASALE_API_BASES = [
  "https://api.shareasale.com/x.cfm",
  "https://shareasale.com/x.cfm",
] as const;

const SHAREASALE_API_VERSION = "2.8";

type ScoreComponents = {
  recency: number;
  growth: number;
  competition: number;
  quality: number;
};

type PipeRow = Record<string, string>;

export interface ShareASaleMerchant {
  merchantId: string;
  name: string;
  category: string;
  avgSale: number;
  avgCommission: number;
  epc: number; // Earnings per click
  reversalRate: number; // 0..1
  joined: string; // ISO date string
  powerRank: number;
}

export interface ShareASaleProduct {
  productId: string;
  merchantId: string;
  merchantName: string;
  name: string;
  category: string;
  price: number;
  commissionRate: number; // 0..1
  epc: number;
  addedAt: string; // ISO date string
  keywords: string[];
}

interface ProcessedProduct {
  platformProductId: string;
  name: string;
  vendor: string;
  category: string;
  keywords: string[];
  saleCount: number;
  aggregateSales: string;
  refundCount: number;
  platformCreatedAt: Date;
  hiddenGemScore: number;
  scoreComponents: ScoreComponents;
}

function generateSignature(token: string, secretKey: string, action: string, date: string): string {
  const sigBase = `${token}:${date}:${action}:${secretKey}`;
  return crypto.createHash("sha256").update(sigBase).digest("hex").toUpperCase();
}

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function splitPipeLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === "\"") {
      if (inQuotes && line[i + 1] === "\"") {
        current += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "|" && !inQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}

function getField(row: PipeRow, aliases: string[]): string {
  for (const alias of aliases) {
    if (row[alias] !== undefined && row[alias] !== "") return row[alias];
    const normalized = normalizeHeader(alias);
    if (row[normalized] !== undefined && row[normalized] !== "") return row[normalized];
  }
  return "";
}

function parseNumber(value: string, fallback = 0): number {
  const cleaned = String(value || "")
    .replace(/[$,%]/g, "")
    .replace(/,/g, "")
    .trim();

  if (!cleaned) return fallback;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseRatio(value: string, fallback = 0): number {
  const parsed = parseNumber(value, fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed > 1 ? parsed / 100 : parsed;
}

function parseDateString(value: string): string {
  const trimmed = String(value || "").trim();
  const parsed = new Date(trimmed);
  if (trimmed && !Number.isNaN(parsed.getTime())) return parsed.toISOString();
  return new Date().toISOString();
}

function toKeywords(...parts: string[]): string[] {
  const merged = parts.filter(Boolean).join(" ");
  const tokens = merged
    .split(/[|,/;>\-]+|\s+/)
    .map(x => x.trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set(tokens));
}

function isApiErrorBody(body: string): boolean {
  const trimmed = body.trim();
  if (!trimmed) return true;

  const lowered = trimmed.toLowerCase();
  if (/<html/i.test(trimmed)) return true;

  const knownErrors = [
    "error",
    "invalid",
    "denied",
    "unauthorized",
    "forbidden",
    "whitelist",
    "api token",
    "api key",
  ];

  return knownErrors.some(token => lowered.includes(token)) && !trimmed.includes("|");
}

export function parsePipeTable(input: string): PipeRow[] {
  const body = String(input || "").replace(/^\uFEFF/, "");
  const lines = body
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return [];
  if (isApiErrorBody(body)) {
    throw new Error(`ShareASale API returned an error payload: ${lines[0]}`);
  }

  const headers = splitPipeLine(lines[0]).map(x => x.trim());
  if (headers.length < 2) {
    throw new Error(`ShareASale API response is not pipe-delimited. Header line: ${lines[0]}`);
  }

  const rows: PipeRow[] = [];

  for (let i = 1; i < lines.length; i += 1) {
    const values = splitPipeLine(lines[i]);
    if (values.length <= 1 && lines[i].includes("|") === false) continue;

    const row: PipeRow = {};
    for (let col = 0; col < headers.length; col += 1) {
      const header = headers[col] || `col_${col}`;
      const value = values[col] ?? "";
      row[header] = value;

      const normalized = normalizeHeader(header);
      if (normalized && row[normalized] === undefined) {
        row[normalized] = value;
      }
    }
    rows.push(row);
  }

  return rows;
}

async function callShareASaleAction(
  action: string,
  affiliateId: string,
  token: string,
  secretKey: string,
  params: Record<string, string> = {}
): Promise<string> {
  let lastError = "";

  for (const baseUrl of SHAREASALE_API_BASES) {
    try {
      const date = new Date().toUTCString();
      const signature = generateSignature(token, secretKey, action, date);
      const url = new URL(baseUrl);

      url.searchParams.set("action", action);
      url.searchParams.set("affiliateId", affiliateId);
      url.searchParams.set("token", token);
      url.searchParams.set("version", SHAREASALE_API_VERSION);
      url.searchParams.set("format", "pipe");

      for (const [key, value] of Object.entries(params)) {
        if (value !== "") url.searchParams.set(key, value);
      }

      const response = await fetch(url.toString(), {
        headers: {
          "x-ShareASale-Date": date,
          "x-ShareASale-Authentication": signature,
        },
      });

      const body = await response.text();

      if (!response.ok) {
        lastError = `${response.status} ${response.statusText}: ${body.slice(0, 180)}`;
        continue;
      }

      if (isApiErrorBody(body)) {
        lastError = body.slice(0, 180);
        continue;
      }

      return body;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  throw new Error(`ShareASale API "${action}" failed: ${lastError || "unknown error"}`);
}

export function mapMerchantRow(row: PipeRow): ShareASaleMerchant | null {
  const merchantId = getField(row, ["MerchantID", "merchant_id", "merchantid", "merchantId", "id"]);
  const name = getField(row, ["OrganizationName", "MerchantName", "organization", "name"]);

  if (!merchantId || !name) return null;

  return {
    merchantId,
    name,
    category: getField(row, ["Categories", "Category", "category"]) || "General",
    avgSale: parseNumber(getField(row, ["AvgSale", "avgsale", "average_sale", "averageSale"])),
    avgCommission: parseNumber(
      getField(row, ["AvgCommission", "avgcommission", "SaleCommission", "salecommission", "LeadCommission"])
    ),
    epc: parseNumber(getField(row, ["a30dayepc", "A30DayEPC", "EPC", "epc", "a7dayepc"])),
    reversalRate: parseRatio(getField(row, ["reversalrate", "ReversalRate", "voidrate", "refundrate"])),
    joined: parseDateString(getField(row, ["startdate", "joined", "dateadded", "created", "CreateDate"])),
    powerRank: parseNumber(getField(row, ["PowerRank", "powerrank"])),
  };
}

export function mapProductRow(row: PipeRow): ShareASaleProduct | null {
  const productId = getField(row, ["ProductID", "product_id", "productid", "sku", "id"]);
  const name = getField(row, ["ProductName", "product_name", "Name", "name"]);

  if (!productId || !name) return null;

  const merchantName = getField(row, ["OrganizationName", "MerchantName", "merchant_name"]);
  const category = getField(row, ["Category", "Categories", "category"]) || "General";

  return {
    productId,
    merchantId: getField(row, ["MerchantID", "merchant_id", "merchantid", "merchantId"]),
    merchantName,
    name,
    category,
    price: parseNumber(getField(row, ["Price", "price", "SalePrice", "sale_price", "amount", "retailprice"])),
    commissionRate: parseRatio(
      getField(row, ["Commission", "commission", "SaleCommission", "salecommission", "commissionrate"])
    ),
    epc: parseNumber(getField(row, ["a30dayepc", "A30DayEPC", "EPC", "epc", "a7dayepc"])),
    addedAt: parseDateString(getField(row, ["DateAdded", "dateadded", "created", "startdate"])),
    keywords: toKeywords(getField(row, ["Keywords", "keywords", "Tags", "tags"]), category),
  };
}

export async function fetchShareASaleMerchants(
  affiliateId: string,
  token: string,
  secretKey: string,
  limit = 50
): Promise<ShareASaleMerchant[]> {
  const safeLimit = String(Math.max(1, Math.min(limit, 200)));
  const body = await callShareASaleAction("merchantSearch", affiliateId, token, secretKey, {
    perPage: safeLimit,
  });

  return parsePipeTable(body)
    .map(mapMerchantRow)
    .filter((merchant): merchant is ShareASaleMerchant => merchant !== null);
}

export async function fetchShareASaleProducts(
  affiliateId: string,
  token: string,
  secretKey: string,
  limit = 200
): Promise<ShareASaleProduct[]> {
  const safeLimit = String(Math.max(1, Math.min(limit, 500)));
  const actions: Array<{ action: string; params: Record<string, string> }> = [
    { action: "getProducts", params: { perPage: safeLimit } },
    { action: "merchantSearchProduct", params: { perPage: safeLimit } },
  ];

  const collected = new Map<string, ShareASaleProduct>();
  let lastActionError: string | null = null;

  for (const entry of actions) {
    try {
      const body = await callShareASaleAction(entry.action, affiliateId, token, secretKey, entry.params);
      const rows = parsePipeTable(body);

      for (const row of rows) {
        const mapped = mapProductRow(row);
        if (!mapped) continue;
        if (!collected.has(mapped.productId)) {
          collected.set(mapped.productId, mapped);
        }
      }
    } catch (error) {
      lastActionError = error instanceof Error ? error.message : String(error);
    }
  }

  if (collected.size === 0 && lastActionError) {
    throw new Error(`ShareASale product actions failed: ${lastActionError}`);
  }

  return Array.from(collected.values());
}

export function calculateShareASaleScore(merchant: ShareASaleMerchant): { score: number; components: ScoreComponents } {
  const now = new Date();
  const joinedDate = new Date(merchant.joined);
  const ageInDays = Number.isNaN(joinedDate.getTime())
    ? 0
    : (now.getTime() - joinedDate.getTime()) / (1000 * 60 * 60 * 24);

  let recencyScore = 0;
  if (ageInDays <= 30) recencyScore = 30;
  else if (ageInDays <= 90) recencyScore = 20;
  else if (ageInDays <= 365) recencyScore = 10;

  let growthScore = 0;
  if (merchant.epc > 10 && merchant.epc <= 50) growthScore = 30;
  else if (merchant.epc > 50 && merchant.epc <= 150) growthScore = 20;
  else if (merchant.epc > 150) growthScore = 5;

  let competitionScore = 0;
  if (merchant.epc < 10) competitionScore = 25;
  else if (merchant.epc < 50) competitionScore = 15;
  else competitionScore = 5;

  let qualityScore = 0;
  if (merchant.reversalRate <= 0.01) qualityScore = 15;
  else if (merchant.reversalRate <= 0.05) qualityScore = 10;
  else if (merchant.reversalRate <= 0.1) qualityScore = 5;

  const components: ScoreComponents = {
    recency: recencyScore,
    growth: growthScore,
    competition: competitionScore,
    quality: qualityScore,
  };

  return {
    score: components.recency + components.growth + components.competition + components.quality,
    components,
  };
}

export function processMerchants(merchants: ShareASaleMerchant[]): ProcessedProduct[] {
  return merchants.map((merchant) => {
    const { score, components } = calculateShareASaleScore(merchant);

    return {
      platformProductId: `merchant:${merchant.merchantId}`,
      name: merchant.name,
      vendor: merchant.name,
      category: merchant.category || "General",
      keywords: toKeywords(merchant.category),
      saleCount: 0,
      aggregateSales: merchant.avgSale > 0 ? merchant.avgSale.toFixed(2) : "0",
      refundCount: 0,
      platformCreatedAt: new Date(merchant.joined),
      hiddenGemScore: score,
      scoreComponents: components,
    };
  });
}

export function processProducts(products: ShareASaleProduct[]): ProcessedProduct[] {
  return products.map((product) => {
    const syntheticMerchant: ShareASaleMerchant = {
      merchantId: product.merchantId || `merchant-from-product-${product.productId}`,
      name: product.merchantName || "ShareASale Merchant",
      category: product.category,
      avgSale: product.price,
      avgCommission: product.commissionRate * product.price,
      epc: product.epc,
      reversalRate: 0,
      joined: product.addedAt,
      powerRank: 0,
    };
    const { score, components } = calculateShareASaleScore(syntheticMerchant);

    return {
      platformProductId: `product:${product.productId}`,
      name: product.name,
      vendor: product.merchantName || "ShareASale Merchant",
      category: product.category || "General",
      keywords: product.keywords.length > 0 ? product.keywords : toKeywords(product.category),
      saleCount: 0,
      aggregateSales: product.price > 0 ? product.price.toFixed(2) : "0",
      refundCount: 0,
      platformCreatedAt: new Date(product.addedAt),
      hiddenGemScore: score,
      scoreComponents: components,
    };
  });
}

export async function fetchAndProcessShareASale(
  affiliateId: string,
  token: string,
  secretKey: string
): Promise<ProcessedProduct[]> {
  const merchants = await fetchShareASaleMerchants(affiliateId, token, secretKey);
  const merchantProducts = processMerchants(merchants);

  let skuProducts: ProcessedProduct[] = [];
  try {
    const products = await fetchShareASaleProducts(affiliateId, token, secretKey);
    skuProducts = processProducts(products);
  } catch (error) {
    console.warn("[ShareASale] Product-level fetch failed, continuing with merchant data only:", error);
  }

  const deduped = new Map<string, ProcessedProduct>();
  for (const item of [...merchantProducts, ...skuProducts]) {
    deduped.set(item.platformProductId, item);
  }

  return Array.from(deduped.values());
}
