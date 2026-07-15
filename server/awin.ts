import zlib from "node:zlib";

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

type AwinFeed = {
  merchantId: string;
  merchantName: string;
  updatedAt: Date;
  downloadUrl: string;
};

function parseNumber(value: unknown): number {
  const cleaned = String(value ?? "")
    .replace(/[$,%]/g, "")
    .replace(/,/g, "")
    .trim();
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function parseDate(value: unknown): Date {
  const parsed = new Date(String(value ?? ""));
  if (!Number.isNaN(parsed.getTime())) return parsed;
  return new Date();
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

function parseDelimited(text: string, delimiter = ","): Array<Record<string, string>> {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map(line => line.trimEnd())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const parseLine = (line: string): string[] => {
    const out: string[] = [];
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
      if (char === delimiter && !inQuotes) {
        out.push(current);
        current = "";
        continue;
      }
      current += char;
    }
    out.push(current);
    return out.map(value => value.trim());
  };

  const headers = parseLine(lines[0]).map(header => header.replace(/^"+|"+$/g, "").trim().toLowerCase());
  const rows: Array<Record<string, string>> = [];

  for (let idx = 1; idx < lines.length; idx += 1) {
    const values = parseLine(lines[idx]);
    const row: Record<string, string> = {};
    for (let h = 0; h < headers.length; h += 1) {
      row[headers[h]] = (values[h] || "").replace(/^"+|"+$/g, "").trim();
    }
    rows.push(row);
  }

  return rows;
}

function pickField(row: Record<string, string>, aliases: string[], fallback = ""): string {
  for (const alias of aliases) {
    const key = alias.toLowerCase();
    if (row[key] !== undefined && row[key] !== "") return row[key];
  }
  return fallback;
}

function normalizeFeedUrl(rawUrl: string): string {
  if (!rawUrl) return "";
  if (rawUrl.startsWith("http://")) return `https://${rawUrl.slice("http://".length)}`;
  if (rawUrl.startsWith("https://")) return rawUrl;
  return "";
}

function decodeFeedBuffer(buffer: Buffer): string {
  if (buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) {
    return zlib.gunzipSync(buffer).toString("utf8");
  }
  return buffer.toString("utf8");
}

async function listAwinFeeds(productFeedApiKey: string): Promise<AwinFeed[]> {
  const url = `https://productdata.awin.com/datafeed/list/apikey/${encodeURIComponent(productFeedApiKey)}`;
  const response = await fetch(url, {
    headers: {
      Accept: "text/csv,text/plain,*/*",
      "User-Agent": "APF/1.0",
    },
  });
  if (!response.ok) {
    throw new Error(`Awin feed list failed (${response.status} ${response.statusText})`);
  }

  const csv = await response.text();
  const rows = parseDelimited(csv, ",");
  const feeds: AwinFeed[] = [];

  for (const row of rows) {
    const merchantId = pickField(row, ["merchant id", "merchant_id", "mid", "merchantid"]);
    if (!merchantId) continue;
    const merchantName = pickField(row, ["merchant name", "merchant_name", "merchant"]);
    const updatedAt = parseDate(
      pickField(row, ["last update", "last_updated", "updated", "lastmodified", "updated_at"], new Date().toISOString())
    );
    const downloadUrl = normalizeFeedUrl(
      pickField(row, ["feed url", "download url", "download_url", "url", "csv url", "datafeed url"])
    );

    if (!downloadUrl) continue;
    feeds.push({
      merchantId,
      merchantName: merchantName || `Awin Merchant ${merchantId}`,
      updatedAt,
      downloadUrl,
    });
  }

  return feeds;
}

function fallbackFeedDownloadUrl(productFeedApiKey: string, merchantId: string): string {
  const columns = [
    "aw_product_id",
    "product_name",
    "description",
    "merchant_name",
    "merchant_category",
    "search_price",
    "aw_deep_link",
    "merchant_deep_link",
    "image_url",
    "brand_name",
    "keywords",
    "last_updated",
  ].join(",");

  return [
    "https://productdata.awin.com/datafeed/download",
    `apikey/${encodeURIComponent(productFeedApiKey)}`,
    `mid/${encodeURIComponent(merchantId)}`,
    "format/csv",
    "compression/gzip",
    `columns/${encodeURIComponent(columns)}`,
    "",
  ].join("/");
}

async function fetchFeedRows(downloadUrl: string): Promise<Array<Record<string, string>>> {
  const response = await fetch(downloadUrl, {
    headers: {
      Accept: "*/*",
      "User-Agent": "APF/1.0",
    },
  });
  if (!response.ok) {
    throw new Error(`Awin feed download failed (${response.status} ${response.statusText})`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const text = decodeFeedBuffer(Buffer.from(arrayBuffer));
  return parseDelimited(text, ",");
}

function scoreAwinProducts(signals: Array<{
  platformProductId: string;
  name: string;
  vendor: string;
  category: string;
  keywords: string[];
  description: string;
  affiliateLink: string;
  price: number;
  commissionRate: number;
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
      signal.commissionRate >= 20 ? 28 :
      signal.commissionRate >= 10 ? 22 :
      signal.price >= 25 && signal.price <= 250 ? 14 : 8;

    const categoryVolume = categoryCounts.get(signal.category) || 1;
    const competition =
      categoryVolume <= 20 ? 24 :
      categoryVolume <= 60 ? 16 :
      categoryVolume <= 120 ? 10 : 5;

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
      commissionRate: signal.commissionRate > 0 ? signal.commissionRate : undefined,
      commissionType: "awin-product-feed",
      affiliateLink: signal.affiliateLink,
      platformCreatedAt: signal.createdAt,
      hiddenGemScore,
      scoreComponents,
    };
  });
}

export async function fetchAndProcessAwinProducts(
  publisherId: string,
  productFeedApiKey: string,
  options?: { maxFeeds?: number; maxRowsPerFeed?: number; maxProducts?: number }
): Promise<ProcessedProduct[]> {
  const maxFeeds = clamp(options?.maxFeeds ?? 8, 1, 20);
  const maxRowsPerFeed = clamp(options?.maxRowsPerFeed ?? 250, 50, 2000);
  const maxProducts = clamp(options?.maxProducts ?? 2000, 200, 6000);

  let feeds = await listAwinFeeds(productFeedApiKey);
  if (feeds.length === 0) {
    throw new Error("No Awin product feeds available for this API key.");
  }

  feeds = feeds
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, maxFeeds);

  const signals: Array<{
    platformProductId: string;
    name: string;
    vendor: string;
    category: string;
    keywords: string[];
    description: string;
    affiliateLink: string;
    price: number;
    commissionRate: number;
    createdAt: Date;
  }> = [];
  const seen = new Set<string>();

  for (const feed of feeds) {
    const downloadUrl = feed.downloadUrl || fallbackFeedDownloadUrl(productFeedApiKey, feed.merchantId);
    let rows: Array<Record<string, string>> = [];
    try {
      rows = await fetchFeedRows(downloadUrl);
    } catch (error) {
      if (feed.downloadUrl) {
        rows = await fetchFeedRows(fallbackFeedDownloadUrl(productFeedApiKey, feed.merchantId));
      } else {
        throw error;
      }
    }

    for (const row of rows.slice(0, maxRowsPerFeed)) {
      const productId = pickField(row, ["aw_product_id", "product_id", "id", "merchant_product_id", "sku"]);
      const name = pickField(row, ["product_name", "name", "title"]);
      if (!productId || !name) continue;

      const platformProductId = `awin:${feed.merchantId}:${productId}`;
      if (seen.has(platformProductId)) continue;
      seen.add(platformProductId);

      const vendor = pickField(row, ["merchant_name", "merchant", "advertiser_name"], feed.merchantName);
      const category = pickField(row, ["merchant_category", "category_name", "category"], "Retail");
      const description = pickField(row, ["description", "product_description"], "");
      const affiliateLink = pickField(row, ["aw_deep_link", "merchant_deep_link", "buy_url", "url"], "");
      const price = parseNumber(pickField(row, ["search_price", "store_price", "price"], "0"));
      const commissionRate = parseNumber(pickField(row, ["commission", "commission_rate", "commission_group"], "0"));
      const createdAt = parseDate(pickField(row, ["last_updated", "updated_at", "updated"], feed.updatedAt.toISOString()));
      const keywords = toKeywords(
        name,
        vendor,
        category,
        pickField(row, ["keywords", "brand_name", "specifications"], "")
      );

      signals.push({
        platformProductId,
        name,
        vendor,
        category,
        keywords,
        description,
        affiliateLink,
        price,
        commissionRate,
        createdAt,
      });
      if (signals.length >= maxProducts) break;
    }
    if (signals.length >= maxProducts) break;
  }

  if (signals.length === 0) {
    throw new Error(
      `Awin feed parsing returned zero products for publisher ${publisherId}. Verify feed permissions and product feed key.`
    );
  }

  return scoreAwinProducts(signals);
}
