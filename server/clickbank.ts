/**
 * ClickBank Marketplace Integration (via XML/RSS Feed)
 * ClickBank doesn't provide a direct marketplace search API for affiliates,
 * so we use the public marketplace feed or scraping-based approaches.
 */

import { XMLParser } from "fast-xml-parser";

const CLICKBANK_FEED_URL = "https://www.clickbank.com/marketplace/feed.xml"; // Example public feed

interface ClickBankProduct {
  id: string;
  title: string;
  description: string;
  category: string;
  gravity: number;
  avgEarnings: number;
  initialEarnings: number;
  rebillAmount: number;
  commission: number;
  createdAt: Date;
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
 * Fetch and parse ClickBank Marketplace XML Feed
 */
export async function fetchClickBankProducts(): Promise<ClickBankProduct[]> {
  try {
    const response = await fetch(CLICKBANK_FEED_URL);
    if (!response.ok) {
      throw new Error(`ClickBank Feed error: ${response.status} ${response.statusText}`);
    }

    const xmlData = await response.text();
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
    });
    const result = parser.parse(xmlData);

    // ClickBank XML structure can vary, this is a generalized parser
    const items = result.rss?.channel?.item || result.feed?.entry || [];
    
    return items.map((item: any) => ({
      id: item.guid || item.id || Math.random().toString(36).substring(7),
      title: item.title || "Unknown Product",
      description: item.description || item.summary || "",
      category: item.category || "General",
      gravity: parseFloat(item.gravity || "0"),
      avgEarnings: parseFloat(item.avgEarnings || "0"),
      initialEarnings: parseFloat(item.initialEarnings || "0"),
      rebillAmount: parseFloat(item.rebillAmount || "0"),
      commission: parseFloat(item.commission || "0"),
      createdAt: new Date(item.pubDate || item.updated || new Date()),
    }));
  } catch (error) {
    console.error("[ClickBank] Error fetching feed:", error);
    // Return mock data if feed fails for testing
    return [];
  }
}

/**
 * Calculate Hidden Gem Score for ClickBank
 * Gravity is a key metric for ClickBank (sales velocity/competition)
 */
export function calculateClickBankScore(product: ClickBankProduct): { score: number; components: any } {
  const now = new Date();
  const ageInDays = (now.getTime() - product.createdAt.getTime()) / (1000 * 60 * 60 * 24);

  // Component 1: Recency (0-30 points)
  let recencyScore = 0;
  if (ageInDays <= 7) recencyScore = 30;
  else if (ageInDays <= 30) recencyScore = 20;
  else if (ageInDays <= 90) recencyScore = 10;

  // Component 2: Growth/Potential (0-30 points)
  // Gravity > 0 but < 50 is often the "sweet spot" for hidden gems
  let growthScore = 0;
  if (product.gravity > 0 && product.gravity <= 20) growthScore = 30;
  else if (product.gravity > 20 && product.gravity <= 50) growthScore = 20;
  else if (product.gravity > 50) growthScore = 5; // Too competitive

  // Component 3: Competition (0-25 points)
  // High gravity = high competition
  let competitionScore = 0;
  if (product.gravity < 5) competitionScore = 25;
  else if (product.gravity < 20) competitionScore = 15;
  else if (product.gravity < 100) competitionScore = 5;

  // Component 4: Quality/Value (0-15 points)
  // Higher avg earnings usually indicate better funnel/quality
  let qualityScore = 0;
  if (product.avgEarnings > 100) qualityScore = 15;
  else if (product.avgEarnings > 50) qualityScore = 10;
  else qualityScore = 5;

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
 * Process ClickBank products into standardized format
 */
export async function fetchAndProcessClickBankProducts(): Promise<ProcessedProduct[]> {
  const products = await fetchClickBankProducts();
  
  return products.map((product) => {
    const { score, components } = calculateClickBankScore(product);
    
    return {
      platformProductId: product.id,
      name: product.title,
      vendor: "ClickBank Vendor",
      category: product.category,
      keywords: product.description.split(" ").filter(w => w.length > 4).slice(0, 10),
      saleCount: Math.floor(product.gravity * 10), // Estimated
      aggregateSales: `$${(product.avgEarnings * product.gravity).toFixed(2)}`,
      refundCount: 0, // Not available in public feed
      platformCreatedAt: product.createdAt,
      hiddenGemScore: score,
      scoreComponents: components,
    };
  });
}
