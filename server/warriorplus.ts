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
 * Fetch offers from WarriorPlus API
 */
export async function fetchWarriorPlusOffers(apiKey: string, limit: number = 100): Promise<WarriorPlusOffer[]> {
  const allOffers: WarriorPlusOffer[] = [];
  let startingAfter: string | undefined;
  let hasMore = true;

  while (hasMore) {
    try {
      const url = new URL(`${WARRIORPLUS_API_BASE}/offers`);
      url.searchParams.set("limit", Math.min(limit, 100).toString());
      if (startingAfter) {
        url.searchParams.set("starting_after", startingAfter);
      }

      const response = await fetch(url.toString(), {
        headers: {
          apiKey,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`WarriorPlus API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.success || !data.data) {
        throw new Error("Invalid WarriorPlus API response");
      }

      allOffers.push(...data.data);

      // Check if there are more results
      hasMore = data.has_more === "true" || data.has_more === true;
      if (hasMore && data.data.length > 0) {
        startingAfter = data.data[data.data.length - 1].id;
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
    const processed = processOffers(offers);
    return processed;
  } catch (error) {
    console.error("[WarriorPlus] Error fetching and processing offers:", error);
    throw error;
  }
}
