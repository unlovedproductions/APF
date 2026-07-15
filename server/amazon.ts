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

export type AmazonCreatorsConfig = {
  partnerTag: string;
  clientId: string;
  clientSecret: string;
  credentialVersion?: string;
  marketplace?: string;
};

const DEFAULT_KEYWORDS = [
  "home organization",
  "fitness equipment",
  "kitchen tools",
  "beauty accessories",
  "pet supplies",
  "office essentials",
];

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

function toKeywords(...parts: string[]): string[] {
  const tokens = parts
    .join(" ")
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map(token => token.trim())
    .filter(token => token.length >= 3);
  return Array.from(new Set(tokens)).slice(0, 14);
}

function getNested<T>(obj: unknown, path: Array<string | number>, fallback: T): T {
  let current: any = obj;
  for (const segment of path) {
    if (current == null) return fallback;
    current = current[segment as any];
  }
  return (current ?? fallback) as T;
}

function resolveCreatorsAuthConfig(version: string): {
  version: string;
  tokenEndpoint: string;
  tokenMode: "v2" | "v3";
  scope: string;
} {
  if (version.startsWith("2.")) {
    const endpoint =
      version === "2.2" ? "https://creatorsapi.auth.eu-south-2.amazoncognito.com/oauth2/token" :
      version === "2.3" ? "https://creatorsapi.auth.us-west-2.amazoncognito.com/oauth2/token" :
      "https://creatorsapi.auth.us-east-1.amazoncognito.com/oauth2/token";
    return {
      version,
      tokenEndpoint: endpoint,
      tokenMode: "v2",
      scope: "creatorsapi/default",
    };
  }

  const endpoint =
    version === "3.2" ? "https://api.amazon.co.uk/auth/o2/token" :
    version === "3.3" ? "https://api.amazon.co.jp/auth/o2/token" :
    "https://api.amazon.com/auth/o2/token";

  return {
    version,
    tokenEndpoint: endpoint,
    tokenMode: "v3",
    scope: "creatorsapi::default",
  };
}

async function getCreatorsAccessToken(config: AmazonCreatorsConfig): Promise<{ token: string; version: string }> {
  const version = config.credentialVersion || "3.1";
  const authConfig = resolveCreatorsAuthConfig(version);

  let response: Response;
  if (authConfig.tokenMode === "v2") {
    const params = new URLSearchParams({
      grant_type: "client_credentials",
      scope: authConfig.scope,
    });

    response = await fetch(authConfig.tokenEndpoint, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
  } else {
    response = await fetch(authConfig.tokenEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        grant_type: "client_credentials",
        client_id: config.clientId,
        client_secret: config.clientSecret,
        scope: authConfig.scope,
      }),
    });
  }

  const payload = (await response.json().catch(() => ({}))) as { access_token?: string; error?: string };
  if (!response.ok || !payload.access_token) {
    throw new Error(
      `Amazon Creators token exchange failed (${response.status}): ${payload.error || JSON.stringify(payload).slice(0, 300)}`
    );
  }

  return {
    token: payload.access_token,
    version,
  };
}

async function searchAmazonItems(
  token: string,
  version: string,
  marketplace: string,
  partnerTag: string,
  keyword: string
): Promise<Array<Record<string, unknown>>> {
  const authorization = version.startsWith("2.")
    ? `Bearer ${token}, Version ${version}`
    : `Bearer ${token}`;

  const response = await fetch("https://creatorsapi.amazon/catalog/v1/searchItems", {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json",
      "x-marketplace": marketplace,
      Accept: "application/json",
    },
    body: JSON.stringify({
      keywords: keyword,
      searchIndex: "All",
      itemCount: 10,
      resources: [
        "itemInfo.title",
        "itemInfo.byLineInfo",
        "itemInfo.features",
        "browseNodeInfo.browseNodes",
        "images.primary.large",
        "offersV2.listings.price",
        "customerReviews.starRating",
        "customerReviews.count",
      ],
      partnerTag,
      partnerType: "Associates",
      marketplace,
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(`Amazon Creators search failed (${response.status}): ${JSON.stringify(payload).slice(0, 350)}`);
  }

  const items =
    getNested<Array<Record<string, unknown>>>(payload, ["searchResult", "items"], []) ||
    getNested<Array<Record<string, unknown>>>(payload, ["itemsResult", "items"], []) ||
    [];

  return items;
}

function scoreAmazonProducts(signals: Array<{
  platformProductId: string;
  name: string;
  vendor: string;
  category: string;
  keywords: string[];
  description: string;
  affiliateLink: string;
  price: number;
  rating: number;
  reviewCount: number;
}>): ProcessedProduct[] {
  return signals.map(signal => {
    const recency = 10;
    const growth =
      signal.rating >= 4.4 ? 26 :
      signal.rating >= 4.0 ? 20 :
      signal.rating >= 3.5 ? 14 : 8;

    const competition =
      signal.reviewCount <= 80 ? 24 :
      signal.reviewCount <= 300 ? 18 :
      signal.reviewCount <= 1200 ? 10 : 4;

    const qualitySignals =
      (signal.affiliateLink ? 1 : 0) +
      (signal.description.length > 60 ? 1 : 0) +
      (signal.price > 0 ? 1 : 0) +
      (signal.rating > 0 ? 1 : 0);
    const quality = qualitySignals >= 4 ? 15 : qualitySignals === 3 ? 10 : qualitySignals === 2 ? 6 : 2;

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
      commissionType: "amazon-creators-catalog-v1",
      affiliateLink: signal.affiliateLink,
      platformCreatedAt: new Date(),
      hiddenGemScore,
      scoreComponents,
    };
  });
}

export async function fetchAndProcessAmazonCreatorsProducts(
  config: AmazonCreatorsConfig,
  options?: { maxProducts?: number; keywords?: string[] }
): Promise<ProcessedProduct[]> {
  const maxProducts = clamp(options?.maxProducts ?? 120, 20, 500);
  const keywords = (options?.keywords?.length ? options.keywords : DEFAULT_KEYWORDS)
    .map(keyword => keyword.trim())
    .filter(Boolean);
  const marketplace = config.marketplace || "www.amazon.com";

  const token = await getCreatorsAccessToken(config);
  const signals: Array<{
    platformProductId: string;
    name: string;
    vendor: string;
    category: string;
    keywords: string[];
    description: string;
    affiliateLink: string;
    price: number;
    rating: number;
    reviewCount: number;
  }> = [];
  const seen = new Set<string>();

  for (const keyword of keywords) {
    const items = await searchAmazonItems(token.token, token.version, marketplace, config.partnerTag, keyword);
    for (const item of items) {
      const asin = String(
        getNested(item, ["asin"], "") ||
        getNested(item, ["ASIN"], "")
      ).trim();
      const title = String(
        getNested(item, ["itemInfo", "title", "displayValue"], "") ||
        getNested(item, ["title", "displayValue"], "")
      ).trim();
      if (!asin || !title) continue;

      const platformProductId = `amazon:${asin}`;
      if (seen.has(platformProductId)) continue;
      seen.add(platformProductId);

      const vendor = String(
        getNested(item, ["itemInfo", "byLineInfo", "brand", "displayValue"], "") ||
        getNested(item, ["itemInfo", "byLineInfo", "manufacturer", "displayValue"], "") ||
        "Amazon Seller"
      ).trim();
      const category = String(
        getNested(item, ["browseNodeInfo", "browseNodes", 0, "displayName"], "Retail")
      ).trim();
      const featureLines = getNested<string[]>(item, ["itemInfo", "features", "displayValues"], []);
      const description = Array.isArray(featureLines) ? featureLines.join(" ").slice(0, 1200) : "";
      const affiliateLink = String(
        getNested(item, ["detailPageURL"], "") ||
        getNested(item, ["url"], "")
      ).trim();
      const price = parseNumber(
        getNested(item, ["offersV2", "listings", 0, "price", "amount"], 0)
      );
      const rating = parseNumber(
        getNested(item, ["customerReviews", "starRating", "value"], 0) ||
        getNested(item, ["customerReviews", "starRating", "displayValue"], 0)
      );
      const reviewCount = parseNumber(
        getNested(item, ["customerReviews", "count"], 0)
      );

      signals.push({
        platformProductId,
        name: title,
        vendor,
        category: category || "Retail",
        keywords: toKeywords(title, vendor, category, keyword),
        description,
        affiliateLink,
        price,
        rating,
        reviewCount,
      });
      if (signals.length >= maxProducts) break;
    }
    if (signals.length >= maxProducts) break;
  }

  if (signals.length === 0) {
    throw new Error(
      "Amazon Creators returned no products. Verify account eligibility, credential version, partner tag, and marketplace."
    );
  }

  return scoreAmazonProducts(signals);
}
