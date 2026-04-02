/**
 * Digistore24 API client and product fetching logic
 * Since Digistore24 API marketplace endpoint may be limited, we implement
 * marketplace scraping as a fallback approach to discover products
 */

import * as cheerio from "cheerio";

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

interface DigestoreProduct {
  id: string;
  name: string;
  vendor: string;
  category: string;
  description: string;
  price: string;
  rating: number;
  reviews: number;
  sales: number;
  url: string;
  createdAt: Date;
}

/**
 * Calculate Hidden Gem Score for Digistore24 products
 * Uses similar logic to WarriorPlus but adapted for available metrics
 */
function calculateHiddenGemScore(product: DigestoreProduct): {
  score: number;
  components: {
    recency: number;
    growth: number;
    competition: number;
    quality: number;
  };
} {
  const now = new Date();
  const ageInDays = (now.getTime() - product.createdAt.getTime()) / (1000 * 60 * 60 * 24);

  // Recency Score (0-30): Newer products score higher
  // Products less than 30 days old get higher scores
  const recencyScore = Math.max(0, Math.min(30, 30 - ageInDays * 0.5));

  // Growth Score (0-30): Based on sales volume and rating
  // Higher sales and ratings indicate momentum
  const growthScore = Math.min(30, (product.sales / 100) * 15 + (product.rating / 5) * 15);

  // Competition Score (0-25): Lower review count = less competition
  // Products with fewer reviews are less saturated
  const competitionScore = Math.max(0, Math.min(25, 25 - product.reviews * 0.1));

  // Quality Score (0-15): Based on rating
  // Higher ratings indicate quality
  const qualityScore = (product.rating / 5) * 15;

  const totalScore = recencyScore + growthScore + competitionScore + qualityScore;

  return {
    score: Math.round(totalScore * 10) / 10,
    components: {
      recency: Math.round(recencyScore * 10) / 10,
      growth: Math.round(growthScore * 10) / 10,
      competition: Math.round(competitionScore * 10) / 10,
      quality: Math.round(qualityScore * 10) / 10,
    },
  };
}

/**
 * Fetch products from Digistore24 marketplace
 * Scrapes marketplace pages since API marketplace access may be limited
 */
export async function fetchDigistore24Products(): Promise<ProcessedProduct[]> {
  const products: ProcessedProduct[] = [];
  const categories = [
    "affiliate-marketing",
    "software",
    "business",
    "marketing",
    "education",
    "finance",
  ];

  for (const category of categories) {
    try {
      const url = `https://www.digistore24.com/en/marketplace/index?category=${category}`;

      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });

      if (!response.ok) {
        console.warn(
          `[Digistore24] Failed to fetch category ${category}: ${response.status}`
        );
        continue;
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      // Parse product listings from marketplace
      // Note: This selector may need adjustment based on actual HTML structure
      $(".product-item, .marketplace-product, [data-product-id]").each(
        (_: number, element: any) => {
          try {
            const $el = $(element);

            // Extract product data from HTML
            const id = $el.attr("data-product-id") || $el.find("[data-id]").attr("data-id") || "";
            const name = $el.find(".product-name, .title, h3").text().trim();
            const vendor = $el.find(".vendor, .author, .seller").text().trim();
            const description = $el.find(".description, .summary, p").text().trim();
            const priceStr = $el.find(".price, .amount").text().trim();
            const ratingStr = $el.find(".rating, [data-rating]").text().trim();
            const reviewsStr = $el.find(".reviews, .review-count").text().trim();
            const salesStr = $el.find(".sales, [data-sales]").text().trim();
            const productUrl = $el.find("a").attr("href") || "";

            if (!id || !name) {
              return; // Skip if missing critical fields
            }

            // Parse numeric values
            const rating = parseFloat(ratingStr) || 4.0;
            const reviews = parseInt(reviewsStr) || 0;
            const sales = parseInt(salesStr) || 0;

            // Create product object
            const product: DigestoreProduct = {
              id,
              name,
              vendor: vendor || "Unknown Vendor",
              category,
              description: description.substring(0, 500), // Limit description length
              price: priceStr || "N/A",
              rating: Math.min(5, Math.max(0, rating)),
              reviews,
              sales,
              url: productUrl,
              createdAt: new Date(), // Marketplace doesn't show creation date, use current
            };

            // Calculate hidden gem score
            const { score, components } = calculateHiddenGemScore(product);

            // Add to processed products
            products.push({
              platformProductId: id,
              name: product.name,
              vendor: product.vendor,
              category: product.category,
              keywords: extractKeywords(product.name + " " + product.description),
              description: product.description,
              saleCount: product.sales,
              aggregateSales: product.price,
              refundCount: 0, // Not available from marketplace
              affiliateLink: product.url,
              platformCreatedAt: product.createdAt,
              hiddenGemScore: score,
              scoreComponents: components,
            });
          } catch (error) {
            console.warn("[Digistore24] Error parsing product element:", error);
            // Continue to next product
          }
        }
      );
    } catch (error) {
      console.error(`[Digistore24] Error fetching category ${category}:`, error);
      // Continue to next category
    }
  }

  return products;
}

/**
 * Extract keywords from text
 */
function extractKeywords(text: string): string[] {
  // Simple keyword extraction: split by common separators and filter
  const words = text
    .toLowerCase()
    .split(/[\s,\-_()[\]{}]+/)
    .filter((w) => w.length > 3 && !isCommonWord(w))
    .slice(0, 10);

    return Array.from(new Set(words)); // Remove duplicates
}

/**
 * Check if word is too common to be a keyword
 */
function isCommonWord(word: string): boolean {
  const common = [
    "the",
    "and",
    "for",
    "with",
    "from",
    "this",
    "that",
    "your",
    "will",
    "have",
    "more",
    "about",
    "learn",
    "course",
    "system",
    "method",
  ];
  return common.includes(word);
}

/**
 * Process and normalize Digistore24 products for storage
 */
export async function fetchAndProcessDigistore24Products(): Promise<
  ProcessedProduct[]
> {
  try {
    const rawProducts = await fetchDigistore24Products();

    // Filter out duplicates and invalid products
    const seen = new Set<string>();
    const processed = rawProducts.filter((product) => {
      if (seen.has(product.platformProductId)) {
        return false;
      }
      seen.add(product.platformProductId);
      return (
        product.name &&
        product.vendor &&
        product.platformProductId &&
        product.hiddenGemScore > 0
      );
    }) as ProcessedProduct[];

    console.log(
      `[Digistore24] Processed ${processed.length} products from marketplace`
    );
    return processed;
  } catch (error) {
    console.error("[Digistore24] Error processing products:", error);
    throw error;
  }
}
