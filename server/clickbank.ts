/**
 * Real ClickBank product ingestion.
 *
 * Uses ClickBank's official public Top Products page.
 * No fake/fallback products are inserted.
 */

import * as cheerio from "cheerio";

const CLICKBANK_TOP_PRODUCTS_URL =
  "https://www.clickbank.com/blog/clickbank-top-offers/";

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
  scoreComponents: {
    recency: number;
    growth: number;
    competition: number;
    quality: number;
  };
}

function cleanText(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(value: string, max: number): string {
  const cleaned = cleanText(value || "");
  return cleaned.length > max ? cleaned.slice(0, max - 1).trim() : cleaned;
}

function slug(value: string): string {
  return cleanText(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function money(value: string): number | null {
  const match = value.match(/\$?\s*([0-9]+(?:\.[0-9]+)?)/);
  return match ? Number(match[1]) : null;
}

function percent(value: string): number | null {
  const match = value.match(/([0-9]+(?:\.[0-9]+)?)\s*%/);
  return match ? Number(match[1]) : null;
}

function normalizeLabels(text: string): string {
  return cleanText(text)
    .replace(/Nickname\s*:/gi, " | Nickname: ")
    .replace(/Category\s*:/gi, " | Category: ")
    .replace(/Offering CPA\s*:/gi, " | Offering CPA: ")
    .replace(/EPC\s*:/gi, " | EPC: ")
    .replace(/APV\s*:/gi, " | APV: ")
    .replace(/Hop Conversion Rate\s*:/gi, " | Hop Conversion Rate: ")
    .replace(/Affiliate Tools Page\s*:/gi, " | Affiliate Tools Page: ")
    .replace(/Seller Contact\s*:/gi, " | Seller Contact: ");
}

function getField(text: string, label: string): string {
  const labels = [
    "Nickname",
    "Category",
    "Offering CPA",
    "EPC",
    "APV",
    "Hop Conversion Rate",
    "Affiliate Tools Page",
    "Seller Contact",
  ];

  const otherLabels = labels
    .filter((x) => x !== label)
    .map((x) => `\\|\\s*${x}\\s*:`)
    .join("|");

  const regex = new RegExp(
    `\\|\\s*${label}\\s*:\\s*(.*?)(?=${otherLabels}|$)`,
    "i"
  );

  return cleanText(text.match(regex)?.[1] || "");
}

function extractKeywords(text: string): string[] {
  const stop = new Set([
    "with", "from", "your", "this", "that", "have", "more", "about",
    "offer", "product", "clickbank", "affiliate", "marketplace", "page",
    "seller", "contact", "category", "nickname",
  ]);

  return Array.from(
    new Set(
      cleanText(text)
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length > 3)
        .filter((w) => !stop.has(w))
        .slice(0, 12)
    )
  );
}

function calculateScore(
  rank: number,
  epc: number | null,
  apv: number | null,
  hopConversion: number | null = null
) {
  // Real-data-only ClickBank hidden gem approximation.
  //
  // Available public fields:
  // - rank from ClickBank Top Products page
  // - EPC: earnings per click
  // - APV: average payment value
  // - hop conversion rate
  //
  // Hidden gem idea:
  // - Not only "best seller"; we reward offers below the most saturated top slots.
  // - Strong EPC/APV/conversion improves the score.
  // - Lower rank number is popular, but too-low rank can mean high competition.

  let competition = 0;
  if (rank <= 5) competition = 8;
  else if (rank <= 15) competition = 14;
  else if (rank <= 35) competition = 25;
  else competition = 20;

  let growth = 0;
  if (epc !== null && epc >= 3) growth = 30;
  else if (epc !== null && epc >= 2) growth = 24;
  else if (epc !== null && epc >= 1) growth = 18;
  else if (epc !== null && epc >= 0.5) growth = 12;
  else growth = 6;

  let quality = 0;
  if (apv !== null && apv >= 150) quality = 20;
  else if (apv !== null && apv >= 100) quality = 16;
  else if (apv !== null && apv >= 50) quality = 12;
  else if (apv !== null && apv >= 20) quality = 8;
  else quality = 4;

  let conversion = 0;
  if (hopConversion !== null && hopConversion >= 5) conversion = 25;
  else if (hopConversion !== null && hopConversion >= 3) conversion = 20;
  else if (hopConversion !== null && hopConversion >= 1.5) conversion = 14;
  else if (hopConversion !== null && hopConversion >= 0.75) conversion = 8;
  else conversion = 4;

  const recency = 20;
  const total = recency + growth + competition + quality + conversion;

  return {
    score: Math.max(0, Math.min(100, total)),
    components: {
      recency,
      growth,
      competition,
      quality: quality + conversion,
    },
  };
}

export async function fetchAndProcessClickBankProducts(): Promise<ProcessedProduct[]> {
  console.log(`[ClickBank] Fetching real products from ${CLICKBANK_TOP_PRODUCTS_URL}`);

  const response = await fetch(CLICKBANK_TOP_PRODUCTS_URL, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
    },
  });

  if (!response.ok) {
    throw new Error(
      `ClickBank official products page failed: ${response.status} ${response.statusText}`
    );
  }

  const html = await response.text();
  const $ = cheerio.load(html);
  const products: ProcessedProduct[] = [];

  $("h2").each((_, heading) => {
    const $heading = $(heading);
    const headingText = cleanText($heading.text());

    const rankMatch = headingText.match(/^([0-9]+)[).]\s*(.+)$/);
    if (!rankMatch) return;

    const rank = Number(rankMatch[1]);
    const name = truncate(rankMatch[2], 255);
    if (!name || name.length < 3) return;

    const blockParts: string[] = [];
    let next = $heading.next();

    for (let i = 0; i < 16 && next.length; i++) {
      if (/^h2$/i.test(next.prop("tagName") || "")) break;
      blockParts.push(cleanText(next.text()));
      next = next.next();
    }

    const normalizedBlock = normalizeLabels(blockParts.join(" "));

    const nickname = truncate(getField(normalizedBlock, "Nickname") || slug(name), 120);
    const category = truncate(getField(normalizedBlock, "Category") || "ClickBank Top Products", 120);

    const epc = money(getField(normalizedBlock, "EPC"));
    const apv = money(getField(normalizedBlock, "APV"));
    const hopConversion = percent(getField(normalizedBlock, "Hop Conversion Rate"));

    const affiliateToolsPage = getField(normalizedBlock, "Affiliate Tools Page");
    const affiliateLink = affiliateToolsPage.startsWith("http")
      ? truncate(affiliateToolsPage, 500)
      : CLICKBANK_TOP_PRODUCTS_URL;

    const description = truncate(
      normalizedBlock
        .replace(/\|\s*Nickname\s*:.*?(?=\||$)/i, "")
        .replace(/\|\s*Category\s*:.*?(?=\||$)/i, "")
        .replace(/\|\s*Offering CPA\s*:.*?(?=\||$)/i, "")
        .replace(/\|\s*EPC\s*:.*?(?=\||$)/i, "")
        .replace(/\|\s*APV\s*:.*?(?=\||$)/i, "")
        .replace(/\|\s*Hop Conversion Rate\s*:.*?(?=\||$)/i, "")
        .replace(/\|\s*Affiliate Tools Page\s*:.*?(?=\||$)/i, "")
        .replace(/\|\s*Seller Contact\s*:.*?(?=\||$)/i, ""),
      1200
    ) || `Real ClickBank product listed on ClickBank's official Top Products page.`;

    const scoring = calculateScore(rank, epc, apv, hopConversion);

    products.push({
      platformProductId: truncate(`clickbank-${slug(nickname)}-${slug(name)}`, 190),
      name,
      vendor: nickname,
      category,
      keywords: extractKeywords(`${name} ${category} ${description}`),
      description,
      saleCount: 0,
      aggregateSales: apv ? apv.toFixed(2) : "0.00",
      refundCount: 0,
      commissionRate: hopConversion ?? undefined,
      commissionType: "clickbank-top-products",
      affiliateLink,
      platformCreatedAt: new Date(),
      hiddenGemScore: scoring.score,
      scoreComponents: scoring.components,
    });
  });

  const unique = new Map<string, ProcessedProduct>();
  for (const product of products) {
    unique.set(product.platformProductId, product);
  }

  const realProducts = Array.from(unique.values()).slice(0, 50);

  if (realProducts.length === 0) {
    throw new Error(
      "No real ClickBank products were parsed from the official ClickBank Top Products page. No fake data inserted."
    );
  }

  console.log(`[ClickBank] Parsed ${realProducts.length} real ClickBank products`);
  console.log("[ClickBank] First parsed product:", {
    name: realProducts[0]?.name,
    vendor: realProducts[0]?.vendor,
    category: realProducts[0]?.category,
    affiliateLink: realProducts[0]?.affiliateLink,
  });

  return realProducts;
}
