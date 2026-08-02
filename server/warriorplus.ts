/**
 * WarriorPlus API client and Hidden Gem scoring logic
 */

const WARRIORPLUS_API_BASE = "https://warriorplus.com/api/v2";

interface WarriorPlusOffer {
  id: string;
  name: string;
  created: string;
  start_date?: string;
  end_date?: string;
  status: string;
  sale_cnt?: number;
  aggregate_sales?: string;
  refund_cnt?: number;
  offer_meta?: {
    keywords?: string[];
    marketing_keywords?: string[];
  };
}

interface WarriorPlusProduct {
  id: string;
  name: string;
  created: string;
  sale_type: string;
  support_email?: string;
  support_url?: string;
  refund_cnt?: number;
  gross_amt?: string;
  product_meta?: {
    keywords?: string[];
    marketing_keywords?: string[];
  };
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
  scoreComponents: {
    recency: number;
    growth: number;
    competition: number;
    quality: number;
  };
}

/**
 * Fetch offers from WarriorPlus API.
 *
 * Official V2 auth accepts apiKey as query, header, or Bearer token.
 * /offers only returns offers owned by the authenticated *vendor* account —
 * there is no affiliate marketplace discovery endpoint in V2.
 */
export async function fetchWarriorPlusOffers(apiKey: string, limit: number = 100): Promise<WarriorPlusOffer[]> {
  const trimmedKey = String(apiKey || "").trim();
  if (!trimmedKey || trimmedKey === "PUBLIC_FEED") {
    throw new Error("WarriorPlus API key is missing. Save a key from https://warriorplus.com/account/api");
  }

  const allOffers: WarriorPlusOffer[] = [];
  let startingAfter: string | undefined;
  let hasMore = true;
  let pages = 0;

  while (hasMore) {
    pages += 1;
    if (pages > 50) {
      throw new Error("WarriorPlus pagination exceeded 50 pages; aborting to avoid an infinite loop.");
    }

    try {
      const url = new URL(`${WARRIORPLUS_API_BASE}/offers`);
      url.searchParams.set("limit", Math.min(limit, 100).toString());
      // Official docs accept apiKey as query and/or header.
      url.searchParams.set("apiKey", trimmedKey);
      if (startingAfter) {
        url.searchParams.set("starting_after", startingAfter);
      }

      const response = await fetch(url.toString(), {
        headers: {
          apiKey: trimmedKey,
          Authorization: `Bearer ${trimmedKey}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });

      const bodyText = await response.text();
      let data: any = null;
      try {
        data = bodyText ? JSON.parse(bodyText) : null;
      } catch {
        data = null;
      }

      if (response.status === 401) {
        throw new Error(
          "WarriorPlus rejected the API key (401). Generate a new key at https://warriorplus.com/account/api and save it again in APF."
        );
      }

      if (response.status === 402) {
        throw new Error(
          "WarriorPlus authenticated the key, but returned no vendor offers (402). The V2 /offers endpoint only lists offers you own as a vendor — it is not an affiliate marketplace feed."
        );
      }

      if (!response.ok) {
        const detail = typeof data?.message === "string"
          ? data.message
          : typeof data?.error === "string"
            ? data.error
            : bodyText.slice(0, 200);
        throw new Error(`WarriorPlus API error: ${response.status} ${response.statusText}${detail ? ` — ${detail}` : ""}`);
      }

      if (!data || data.success === false || data.success === 0 || !Array.isArray(data.data)) {
        throw new Error("Invalid WarriorPlus API response");
      }

      allOffers.push(...data.data);

      // Official contract: top-level has_more is the string "true"/"false".
      hasMore = data.has_more === "true" || data.has_more === true;
      if (hasMore && data.data.length > 0) {
        startingAfter = data.data[data.data.length - 1].id;
      } else {
        hasMore = false;
      }
    } catch (error) {
      console.error("[WarriorPlus] Error fetching offers:", error);
      throw error;
    }
  }

  return allOffers;
}

/**
 * Calculate Hidden Gem Score based on multiple factors
 */
export function calculateHiddenGemScore(
  product: WarriorPlusOffer,
  allProducts: WarriorPlusOffer[]
): { score: number; components: any } {
  const now = new Date();
  const createdDate = new Date(product.created);
  const ageInDays = (now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24);

  // Component 1: Recency (0-30 points)
  // Newer products score higher, but not too new (avoid spam)
  let recencyScore = 0;
  if (ageInDays <= 1) {
    recencyScore = 25; // Launched today
  } else if (ageInDays <= 7) {
    recencyScore = 20; // Last week
  } else if (ageInDays <= 14) {
    recencyScore = 15; // Last 2 weeks
  } else if (ageInDays <= 30) {
    recencyScore = 10; // Last month
  }

  // Component 2: Sales Growth (0-30 points)
  // Products with moderate sales growth but not saturated
  const saleCount = product.sale_cnt || 0;
  let growthScore = 0;
  if (saleCount >= 1 && saleCount <= 50) {
    growthScore = 25; // Sweet spot: early traction
  } else if (saleCount > 50 && saleCount <= 200) {
    growthScore = 15; // Growing but not viral
  } else if (saleCount > 200) {
    growthScore = 5; // Already popular/saturated
  } else {
    growthScore = 10; // No sales yet but recent
  }

  // Component 3: Low Competition (0-25 points)
  // Products with lower sales relative to age are less competitive
  const salesPerDay = ageInDays > 0 ? saleCount / ageInDays : saleCount;
  let competitionScore = 0;
  if (salesPerDay < 1) {
    competitionScore = 25; // Very low velocity
  } else if (salesPerDay < 5) {
    competitionScore = 20; // Low velocity
  } else if (salesPerDay < 10) {
    competitionScore = 15; // Moderate velocity
  } else if (salesPerDay < 20) {
    competitionScore = 10; // High velocity
  } else {
    competitionScore = 0; // Very high velocity (saturated)
  }

  // Component 4: Quality (0-15 points)
  // Low refund rate indicates quality
  const refundCount = product.refund_cnt || 0;
  let qualityScore = 0;
  if (saleCount > 0) {
    const refundRate = refundCount / saleCount;
    if (refundRate <= 0.05) {
      qualityScore = 15; // <5% refund rate
    } else if (refundRate <= 0.1) {
      qualityScore = 10; // <10% refund rate
    } else if (refundRate <= 0.2) {
      qualityScore = 5; // <20% refund rate
    }
  } else {
    qualityScore = 8; // No data yet, neutral score
  }

  const totalScore = recencyScore + growthScore + competitionScore + qualityScore;

  return {
    score: totalScore,
    components: {
      recency: recencyScore,
      growth: growthScore,
      competition: competitionScore,
      quality: qualityScore,
    },
  };
}

/**
 * Extract category from keywords or offer metadata
 */
function extractCategory(offer: WarriorPlusOffer): string {
  const keywords = [
    ...(offer.offer_meta?.keywords || []),
    ...(offer.offer_meta?.marketing_keywords || []),
  ];

  const categoryKeywords: Record<string, string[]> = {
    "Affiliate Marketing": ["affiliate", "affiliate marketing", "jv", "partnership"],
    "AI Tools": ["ai", "artificial intelligence", "chatgpt", "automation", "machine learning"],
    "Software": ["software", "saas", "tool", "application", "plugin"],
    "E-commerce": ["ecommerce", "shopify", "dropshipping", "store", "amazon"],
    "Content Creation": ["content", "writing", "copywriting", "video", "youtube"],
    "SEO": ["seo", "search engine", "ranking", "traffic", "backlinks"],
    "Email Marketing": ["email", "email marketing", "list building", "newsletter"],
    "Social Media": ["social media", "facebook", "instagram", "tiktok", "twitter"],
    "Paid Ads": ["ads", "advertising", "google ads", "facebook ads", "ppc"],
    "Personal Development": ["personal development", "coaching", "mindset", "self-help"],
    "Business": ["business", "entrepreneurship", "startup", "marketing"],
    "Finance": ["finance", "investing", "crypto", "stocks", "forex"],
  };

  for (const [category, categoryKeywords_list] of Object.entries(categoryKeywords)) {
    for (const keyword of categoryKeywords_list) {
      if (keywords.some(k => k.toLowerCase().includes(keyword.toLowerCase()))) {
        return category;
      }
    }
  }

  return "Other";
}

/**
 * Process WarriorPlus offers into standardized product format
 */
export function processOffers(offers: WarriorPlusOffer[]): ProcessedProduct[] {
  return offers.map((offer) => {
    const { score, components } = calculateHiddenGemScore(offer, offers);

    return {
      platformProductId: offer.id,
      name: offer.name,
      vendor: "WarriorPlus Vendor", // WarriorPlus API doesn't expose vendor name in offers
      category: extractCategory(offer),
      keywords: [
        ...(offer.offer_meta?.keywords || []),
        ...(offer.offer_meta?.marketing_keywords || []),
      ],
      saleCount: offer.sale_cnt || 0,
      aggregateSales: offer.aggregate_sales || "0",
      refundCount: offer.refund_cnt || 0,
      platformCreatedAt: new Date(offer.created),
      hiddenGemScore: score,
      scoreComponents: components,
    };
  });
}

/**
 * Fetch and process all WarriorPlus offers
 */
export async function fetchAndProcessWarriorPlusOffers(apiKey: string): Promise<ProcessedProduct[]> {
  try {
    const offers = await fetchWarriorPlusOffers(apiKey);
    if (offers.length === 0) {
      throw new Error(
        "WarriorPlus API key works, but returned 0 vendor offers. V2 /offers only returns offers owned by your vendor account — not marketplace products for affiliates. Use Digistore24/ClickBank/CJ/Awin for affiliate product discovery, or refresh from a WarriorPlus vendor account that has live offers."
      );
    }
    const processed = processOffers(offers);
    return processed;
  } catch (error) {
    console.error("[WarriorPlus] Error fetching and processing offers:", error);
    throw error;
  }
}
