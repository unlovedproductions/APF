/**
 * Firecrawl BYOK client for enrichment fallbacks (search + scrape).
 * Key only via FIRECRAWL_API_KEY. No npm dependency — raw fetch to REST v2.
 */

const FIRECRAWL_BASE = "https://api.firecrawl.dev/v2";

function apiKey() {
  return String(process.env.FIRECRAWL_API_KEY || "").trim();
}

export function isFirecrawlConfigured(env = process.env) {
  return Boolean(String(env.FIRECRAWL_API_KEY || "").trim());
}

function defaultMaxSearch() {
  return Math.max(0, Number(process.env.REVIEW_ENRICHMENT_FIRECRAWL_MAX_SEARCH_PER_JOB || "2"));
}

function defaultMaxScrape() {
  return Math.max(0, Number(process.env.REVIEW_ENRICHMENT_FIRECRAWL_MAX_SCRAPE_PER_JOB || "3"));
}

/** @type {{ searchUsed: number, scrapeUsed: number, maxSearch: number, maxScrape: number }} */
let budget = {
  searchUsed: 0,
  scrapeUsed: 0,
  maxSearch: defaultMaxSearch(),
  maxScrape: defaultMaxScrape(),
};

export function resetFirecrawlBudget(options = {}) {
  budget = {
    searchUsed: 0,
    scrapeUsed: 0,
    maxSearch: Math.max(0, Number(options.maxSearch ?? defaultMaxSearch())),
    maxScrape: Math.max(0, Number(options.maxScrape ?? defaultMaxScrape())),
  };
  return getFirecrawlBudget();
}

export function getFirecrawlBudget() {
  return { ...budget };
}

export function canFirecrawlSearch() {
  return isFirecrawlConfigured() && budget.searchUsed < budget.maxSearch;
}

export function canFirecrawlScrape() {
  return isFirecrawlConfigured() && budget.scrapeUsed < budget.maxScrape;
}

function cleanText(value, limit = 8000) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
}

/**
 * Normalize Firecrawl search payloads (array or { web: [] }) into enrichment source rows.
 */
export function mapFirecrawlSearchResults(payload, options = {}) {
  const limit = Math.max(1, Number(options.limit || 10));
  const root = payload?.data ?? payload;
  const rows = Array.isArray(root)
    ? root
    : Array.isArray(root?.web)
      ? root.web
      : [];

  const out = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const url = String(row.url || row.metadata?.sourceURL || "").trim();
    if (!url) continue;
    let source_name = "firecrawl";
    try {
      source_name = new URL(url).hostname.replace(/^www\./, "");
    } catch {
      // keep firecrawl
    }
    out.push({
      source_type: "web",
      source_name,
      title: cleanText(row.title || row.metadata?.title || "", 500),
      url,
      snippet: cleanText(row.description || row.snippet || row.metadata?.description || "", 2000),
      raw_json: { ...row, provider: "firecrawl" },
    });
    if (out.length >= limit) break;
  }
  return out;
}

export function extractFirecrawlMarkdown(payload, textLimit = 8000) {
  const data = payload?.data ?? payload;
  const markdown = data?.markdown
    ?? (Array.isArray(data) ? data[0]?.markdown : "")
    ?? "";
  return cleanText(markdown, textLimit);
}

async function firecrawlRequest(path, body) {
  const key = apiKey();
  if (!key) throw new Error("FIRECRAWL_API_KEY missing");

  const res = await fetch(`${FIRECRAWL_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (res.status === 429 || res.status === 402) {
    const msg = cleanText(json?.error || json?.message || text || `HTTP ${res.status}`, 300);
    const err = new Error(`Firecrawl quota/rate-limit: ${msg}`);
    err.code = "FIRECRAWL_RATE_LIMIT";
    err.status = res.status;
    throw err;
  }

  if (!res.ok) {
    throw new Error(`Firecrawl ${path} failed ${res.status}: ${cleanText(text, 300)}`);
  }

  return json;
}

/**
 * SERP-only search (no scrapeOptions) — cheapest discovery fallback.
 * @returns {Promise<Array>} enrichment source rows
 */
export async function firecrawlSearch(query, options = {}) {
  if (!canFirecrawlSearch()) {
    return [];
  }
  budget.searchUsed += 1;
  const limit = Math.max(1, Number(options.limit || 10));
  const json = await firecrawlRequest("/search", {
    query: String(query || "").trim(),
    limit,
  });
  return mapFirecrawlSearchResults(json, { limit });
}

/**
 * Single-URL scrape → truncated markdown as content_text.
 * @returns {Promise<{ content_text: string, raw?: object }>}
 */
export async function firecrawlScrape(url, options = {}) {
  if (!canFirecrawlScrape()) {
    return { content_text: "" };
  }
  budget.scrapeUsed += 1;
  const textLimit = Math.max(80, Number(options.textLimit || 8000));
  const json = await firecrawlRequest("/scrape", {
    url: String(url || "").trim(),
    formats: ["markdown"],
    onlyMainContent: true,
  });
  const content_text = extractFirecrawlMarkdown(json, textLimit);
  return { content_text, raw: json };
}
