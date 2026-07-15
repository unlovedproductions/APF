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
  commissionRate?: number;
  commissionType?: string;
  affiliateLink: string;
  platformCreatedAt: Date;
  hiddenGemScore: number;
  scoreComponents: ScoreComponents;
}

type ImpactCatalog = {
  id: string;
  name: string;
};

function parseNumber(value: unknown): number {
  const cleaned = String(value ?? "")
    .replace(/[$,%]/g, "")
    .replace(/,/g, "")
    .trim();
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseDate(value: unknown): Date {
  const parsed = new Date(String(value ?? ""));
  if (!Number.isNaN(parsed.getTime())) return parsed;
  return new Date();
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toKeywords(...parts: string[]): string[] {
  const tokens = parts
    .join(" ")
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map(token => token.trim())
    .filter(token => token.length >= 3);
  return Array.from(new Set(tokens)).slice(0, 14);
}

function getField<T>(item: Record<string, unknown>, aliases: string[], fallback: T): T {
  for (const alias of aliases) {
    if (item[alias] !== undefined && item[alias] !== null && item[alias] !== "") {
      return item[alias] as T;
    }
  }
  return fallback;
}

async function impactRequest(
  accountSid: string,
  authToken: string,
  path: string,
  params: Record<string, string | number> = {}
): Promise<Record<string, unknown>> {
  const url = new URL(`https://api.impact.com${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
      "User-Agent": "APF/1.0",
    },
  });

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(`Impact API failed (${response.status} ${response.statusText}): ${JSON.stringify(payload).slice(0, 400)}`);
  }
  return payload;
}

function extractArray(payload: Record<string, unknown>, keys: string[]): Array<Record<string, unknown>> {
  for (const key of keys) {
    const value = payload[key];
    if (Array.isArray(value)) {
      return value.filter(item => typeof item === "object" && item !== null) as Array<Record<string, unknown>>;
    }
  }
  return [];
}

async function listImpactCatalogs(accountSid: string, authToken: string): Promise<ImpactCatalog[]> {
  const payload = await impactRequest(accountSid, authToken, `/MediaPartners/${accountSid}/Catalogs`, {
    PageSize: 200,
    Page: 1,
  });
  const rows = extractArray(payload, ["Catalogs", "catalogs", "resultList", "Items"]);
  return rows
    .map(row => ({
      id: String(getField(row, ["Id", "CatalogId", "id", "catalogId"], "")).trim(),
      name: String(getField(row, ["Name", "CatalogName", "name"], "Impact Catalog")).trim(),
    }))
    .filter(catalog => Boolean(catalog.id));
}

async function listCatalogItems(
  accountSid: string,
  authToken: string,
  catalogId: string,
  maxItems: number
): Promise<Array<Record<string, unknown>>> {
  const pageSize = 1000;
  const items: Array<Record<string, unknown>> = [];
  let page = 1;

  while (items.length < maxItems && page <= 20) {
    const payload = await impactRequest(
      accountSid,
      authToken,
      `/MediaPartners/${accountSid}/Catalogs/${encodeURIComponent(catalogId)}/Items`,
      { PageSize: pageSize, Page: page }
    );

    const chunk = extractArray(payload, ["CatalogItems", "Items", "resultList", "items"]);
    if (chunk.length === 0) break;
    items.push(...chunk);
    if (chunk.length < pageSize) break;
    page += 1;
  }

  return items.slice(0, maxItems);
}

function scoreImpactProducts(signals: Array<{
  platformProductId: string;
  name: string;
  vendor: string;
  category: string;
  keywords: string[];
  description: string;
  affiliateLink: string;
  price: number;
  createdAt: Date;
}>): ProcessedProduct[] {
  const categoryCounts = new Map<string, number>();
  for (const signal of signals) {
    categoryCounts.set(signal.category, (categoryCounts.get(signal.category) || 0) + 1);
  }

  return signals.map(signal => {
    const ageDays = (Date.now() - signal.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    const recency =
      ageDays <= 2 ? 30 :
      ageDays <= 14 ? 24 :
      ageDays <= 45 ? 16 : 8;

    const growth =
      signal.price >= 20 && signal.price <= 400 ? 20 :
      signal.price > 400 ? 14 : 10;

    const categorySize = categoryCounts.get(signal.category) || 1;
    const competition =
      categorySize <= 20 ? 25 :
      categorySize <= 80 ? 16 :
      categorySize <= 180 ? 10 : 5;

    const qualitySignals =
      (signal.affiliateLink ? 1 : 0) +
      (signal.description.length > 80 ? 1 : 0) +
      (signal.price > 0 ? 1 : 0);
    const quality = qualitySignals === 3 ? 15 : qualitySignals === 2 ? 10 : qualitySignals === 1 ? 6 : 2;

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
      commissionType: "impact-catalog-items",
      affiliateLink: signal.affiliateLink,
      platformCreatedAt: signal.createdAt,
      hiddenGemScore,
      scoreComponents,
    };
  });
}

export async function fetchAndProcessImpactCatalogItems(
  accountSid: string,
  authToken: string,
  options?: { maxCatalogs?: number; maxItemsPerCatalog?: number; maxProducts?: number }
): Promise<ProcessedProduct[]> {
  const maxCatalogs = clamp(options?.maxCatalogs ?? 6, 1, 30);
  const maxItemsPerCatalog = clamp(options?.maxItemsPerCatalog ?? 800, 50, 5000);
  const maxProducts = clamp(options?.maxProducts ?? 4000, 200, 10000);

  const catalogs = (await listImpactCatalogs(accountSid, authToken)).slice(0, maxCatalogs);
  if (catalogs.length === 0) {
    throw new Error("No Impact catalogs found for this account.");
  }

  const signals: Array<{
    platformProductId: string;
    name: string;
    vendor: string;
    category: string;
    keywords: string[];
    description: string;
    affiliateLink: string;
    price: number;
    createdAt: Date;
  }> = [];
  const seen = new Set<string>();

  for (const catalog of catalogs) {
    const items = await listCatalogItems(accountSid, authToken, catalog.id, maxItemsPerCatalog);
    for (const item of items) {
      const id = String(getField(item, ["CatalogItemId", "Id", "id", "Sku", "SKU"], "")).trim();
      const name = String(getField(item, ["Name", "Title", "name"], "")).trim();
      if (!id || !name) continue;

      const platformProductId = `impact:${catalog.id}:${id}`;
      if (seen.has(platformProductId)) continue;
      seen.add(platformProductId);

      const vendor = String(
        getField(item, ["AdvertiserName", "Brand", "Manufacturer", "ManufacturerName"], catalog.name)
      ).trim();
      const rawCategory = getField<unknown>(item, ["Category", "PrimaryCategory", "Labels"], "Retail");
      const category = Array.isArray(rawCategory)
        ? rawCategory.map(entry => String(entry)).join(" / ")
        : String(rawCategory).trim();
      const description = String(getField(item, ["Description", "Bullets", "description"], "")).trim();
      const affiliateLink = String(getField(item, ["Url", "MobileUrl", "ClickUrl", "url"], "")).trim();
      const price = parseNumber(getField(item, ["CurrentPrice", "Price", "SalePrice", "price"], "0"));
      const createdAt = parseDate(getField(item, ["LastUpdated", "DateAdded", "UpdatedDate", "updatedAt"], new Date().toISOString()));

      signals.push({
        platformProductId,
        name,
        vendor,
        category: category || "Retail",
        keywords: toKeywords(name, vendor, category || "Retail", description),
        description,
        affiliateLink,
        price,
        createdAt,
      });
      if (signals.length >= maxProducts) break;
    }
    if (signals.length >= maxProducts) break;
  }

  if (signals.length === 0) {
    throw new Error("Impact catalog item fetch returned zero products. Verify API token and catalog permissions.");
  }

  return scoreImpactProducts(signals);
}
