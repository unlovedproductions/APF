/**
 * Oxylabs Web Scraper API — last-resort SERP fallback for enrichment.
 * Credentials via OXYLABS_USERNAME + OXYLABS_PASSWORD only (BYOK).
 * Uses google_search + parse (no render) so we stay under non-rendered job limits.
 *
 * Trial limits (document in .env.example): 2000 results, 10 jobs/s, 3 rendered/s.
 */

const OXYLABS_REALTIME = "https://realtime.oxylabs.io/v1/queries";

/** Min gap between Oxylabs jobs (10 jobs/s → ≥100ms; use 110ms cushion). */
const DEFAULT_MIN_GAP_MS = 110;

function cleanText(value, limit = 8000) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
}

export function isOxylabsConfigured(env = process.env) {
  return Boolean(
    String(env.OXYLABS_USERNAME || "").trim()
    && String(env.OXYLABS_PASSWORD || "").trim(),
  );
}

function defaultMaxSearch() {
  return Math.max(0, Number(process.env.REVIEW_ENRICHMENT_OXYLABS_MAX_SEARCH_PER_JOB || "2"));
}

function defaultMinGapMs() {
  return Math.max(100, Number(process.env.REVIEW_ENRICHMENT_OXYLABS_MIN_GAP_MS || String(DEFAULT_MIN_GAP_MS)));
}

function defaultGeo() {
  return String(process.env.OXYLABS_GEO_LOCATION || "United States").trim() || "United States";
}

/** @type {{ searchUsed: number, maxSearch: number, minGapMs: number, lastAt: number }} */
let budget = {
  searchUsed: 0,
  maxSearch: defaultMaxSearch(),
  minGapMs: defaultMinGapMs(),
  lastAt: 0,
};

export function resetOxylabsBudget(options = {}) {
  budget = {
    searchUsed: 0,
    maxSearch: Math.max(0, Number(options.maxSearch ?? defaultMaxSearch())),
    minGapMs: Math.max(100, Number(options.minGapMs ?? defaultMinGapMs())),
    lastAt: 0,
  };
  return getOxylabsBudget();
}

export function getOxylabsBudget() {
  return {
    searchUsed: budget.searchUsed,
    maxSearch: budget.maxSearch,
    minGapMs: budget.minGapMs,
    lastAt: budget.lastAt,
  };
}

export function canOxylabsSearch() {
  return isOxylabsConfigured() && budget.searchUsed < budget.maxSearch;
}

/**
 * Pull organic rows from Oxylabs google_search parse payloads.
 * Shape: results[].content.results.organic[] with url/title/desc.
 */
export function mapOxylabsSearchResults(payload, options = {}) {
  const limit = Math.max(1, Number(options.limit || 10));
  const out = [];
  const jobs = Array.isArray(payload?.results) ? payload.results : [];

  for (const job of jobs) {
    const organic = job?.content?.results?.organic;
    const rows = Array.isArray(organic)
      ? organic
      : Array.isArray(job?.content?.organic)
        ? job.content.organic
        : Array.isArray(payload?.organic)
          ? payload.organic
          : [];

    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const url = String(row.url || "").trim();
      if (!url) continue;
      let source_name = "oxylabs";
      try {
        source_name = new URL(url).hostname.replace(/^www\./, "");
      } catch {
        // keep oxylabs
      }
      out.push({
        source_type: "web",
        source_name,
        title: cleanText(row.title || "", 500),
        url,
        snippet: cleanText(row.desc || row.description || row.snippet || "", 2000),
        raw_json: { ...row, provider: "oxylabs" },
      });
      if (out.length >= limit) return out;
    }
  }

  // Flat demo/docs shape: { results: [{ title, url, snippet }] }
  if (out.length === 0 && Array.isArray(payload?.results)) {
    for (const row of payload.results) {
      if (!row || typeof row !== "object" || row.content) continue;
      const url = String(row.url || "").trim();
      if (!url) continue;
      let source_name = "oxylabs";
      try {
        source_name = new URL(url).hostname.replace(/^www\./, "");
      } catch {
        // keep
      }
      out.push({
        source_type: "web",
        source_name,
        title: cleanText(row.title || "", 500),
        url,
        snippet: cleanText(row.snippet || row.desc || "", 2000),
        raw_json: { ...row, provider: "oxylabs" },
      });
      if (out.length >= limit) break;
    }
  }

  return out;
}

async function throttleOxylabsGap() {
  const elapsed = Date.now() - budget.lastAt;
  if (budget.lastAt && elapsed < budget.minGapMs) {
    await new Promise((r) => setTimeout(r, budget.minGapMs - elapsed));
  }
}

/**
 * google_search SERP (parse only — no render).
 * @returns {Promise<Array>} enrichment source rows
 */
export async function oxylabsSearch(query, options = {}) {
  if (!canOxylabsSearch()) return [];

  const username = String(process.env.OXYLABS_USERNAME || "").trim();
  const password = String(process.env.OXYLABS_PASSWORD || "").trim();
  if (!username || !password) return [];

  budget.searchUsed += 1;
  await throttleOxylabsGap();
  budget.lastAt = Date.now();

  const limit = Math.max(1, Number(options.limit || 10));
  const body = {
    source: "google_search",
    query: String(query || "").trim(),
    geo_location: String(options.geoLocation || defaultGeo()),
    parse: true,
  };

  const res = await fetch(OXYLABS_REALTIME, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`,
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

  if (res.status === 429) {
    const msg = cleanText(json?.message || text || "HTTP 429", 300);
    const err = new Error(`Oxylabs rate-limit: ${msg}`);
    err.code = "OXYLABS_RATE_LIMIT";
    err.status = 429;
    throw err;
  }

  if (!res.ok) {
    throw new Error(`Oxylabs search failed ${res.status}: ${cleanText(text, 300)}`);
  }

  return mapOxylabsSearchResults(json, { limit });
}
