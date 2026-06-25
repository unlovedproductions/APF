/**
 * Real-only Digistore24 integration placeholder.
 *
 * Digistore24 marketplace data is account/login based. This file intentionally
 * does NOT return fake products. The next real implementation should use either:
 * 1. Digistore24 API credentials and a documented endpoint available to the account, or
 * 2. A user-provided real export/import file from the Digistore24 affiliate marketplace.
 */

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

export async function fetchAndProcessDigistore24Products(
  apiKey?: string
): Promise<ProcessedProduct[]> {
  if (!apiKey || apiKey === "PUBLIC_FEED") {
    throw new Error(
      "Real Digistore24 marketplace ingestion requires real Digistore24 account/API access or a real marketplace export. Public no-key scraping is disabled so fake products are never inserted."
    );
  }

  throw new Error(
    "Digistore24 real API ingestion is not implemented yet. No fake products inserted. Next step: wire a documented Digistore24 API endpoint or CSV export importer."
  );
}
