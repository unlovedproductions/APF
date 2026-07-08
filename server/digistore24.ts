/**
 * Digistore24 marketplace ingestion.
 *
 * Production path is NOT this module. Refresh uses the Firefox browser daemon:
 * - scripts/digistore24-browser-daemon.mjs
 * - scripts/digistore24-daemon-client.mjs
 * - server/apfWorkflows.ts → runDigistore24RefreshWorkflow()
 *
 * Optional DIGISTORE24_API_KEY scripts (probe/importer) are exploratory only.
 * This file stays as a hard no-fake-data guard if anything still calls the old
 * in-process "API fetch" shape.
 */

export const DIGISTORE24_INGESTION_MODE = "firefox_daemon" as const;

export const DIGISTORE24_DAEMON_HINT =
  "Use Digistore24 Refresh in the UI (runDigistore24RefreshWorkflow) or: pnpm digistore24:daemon + pnpm digistore24:daemon:collect. Set DIGISTORE24_ID to your affiliate nickname and complete Firefox login if asked.";

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

/**
 * @deprecated In-process Digistore API fetch is not implemented.
 * Call runDigistore24RefreshWorkflow() instead.
 */
export async function fetchAndProcessDigistore24Products(
  apiKey?: string
): Promise<ProcessedProduct[]> {
  if (!apiKey || apiKey === "PUBLIC_FEED") {
    throw new Error(
      `Digistore24 does not support public no-key scraping. ${DIGISTORE24_DAEMON_HINT}`
    );
  }

  throw new Error(
    `Digistore24 in-process API ingestion is not implemented. Production path is the Firefox daemon (${DIGISTORE24_INGESTION_MODE}). ${DIGISTORE24_DAEMON_HINT}`
  );
}
