import fs from "node:fs";
import path from "node:path";

const RATE_LIMIT_RE =
  /captcha|too many|rate.?limit|429|blocked|forbidden|access.?denied|suspended/i;

const REVIEW_TIERS = new Set(["review", "scam_advisor", "video"]);

/** @param {unknown} unresponsive */
export function isSearchRateLimitSignal(unresponsive = []) {
  if (!Array.isArray(unresponsive) || unresponsive.length === 0) return false;
  for (const entry of unresponsive) {
    const text = Array.isArray(entry)
      ? entry.map((part) => String(part ?? "")).join(" ")
      : String(entry ?? "");
    if (RATE_LIMIT_RE.test(text)) return true;
  }
  return false;
}

/**
 * Open the search circuit only on rate-limit/CAPTCHA signatures when there are no hits.
 * Soft misses (0 hits, generic timeouts) must not kill the rest of the job.
 */
export function shouldOpenSearchCircuit({ results = [], unresponsive = [] } = {}) {
  if ((results?.length || 0) > 0) return false;
  return isSearchRateLimitSignal(unresponsive);
}

/**
 * Count a rate-limit strike only when the job never got a healthy soft miss
 * from a fallback engine. Primary Brave CAPTCHA + Bing 0-hit niche site:
 * queries must not burn the catalog circuit.
 */
export function shouldCountSearchRateLimitStrike({
  sawPrimaryRateLimit = false,
  healthySoftMiss = false,
  results = [],
  unresponsive = [],
} = {}) {
  if (healthySoftMiss) return false;
  if ((results?.length || 0) > 0) return false;
  return Boolean(sawPrimaryRateLimit) || shouldOpenSearchCircuit({ results, unresponsive });
}

export function buildSearxngSearchUrl(baseUrl, query, engines = "brave") {
  const url = new URL("/search", baseUrl);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("language", "en");
  url.searchParams.set("safesearch", "1");
  const eng = String(engines || "").trim();
  if (eng) url.searchParams.set("engines", eng);
  return url;
}

/**
 * Ordered engine attempts: primary first, then comma-separated fallbacks (deduped).
 * Used when the pinned engine is rate-limited so one Brave CAPTCHA does not end the job.
 */
export function listSearchEngineAttempts(primary = "brave", fallbacks = "bing,duckduckgo") {
  const out = [];
  const push = (value) => {
    const eng = String(value || "").trim();
    if (eng && !out.includes(eng)) out.push(eng);
  };
  for (const part of String(primary || "").split(",")) push(part);
  for (const part of String(fallbacks || "").split(",")) push(part);
  if (out.length === 0) out.push("brave");
  return out;
}

/**
 * HTTP status that should count as a search rate-limit signal (before JSON parse).
 */
export function isSearchHttpRateLimitStatus(status) {
  const code = Number(status);
  return code === 429 || code === 403;
}


export function countReviewTierHosts(sources = [], classifyHost, options = {}) {
  const excludeDirectProbes = Boolean(options.excludeDirectProbes);
  const hosts = new Set();
  for (const source of sources) {
    if (excludeDirectProbes && source?.raw_json?.direct_probe) continue;
    let host = "";
    try {
      host = new URL(String(source?.url || "")).hostname.replace(/^www\./, "").toLowerCase();
    } catch {
      continue;
    }
    if (!host || !classifyHost) continue;
    const tier = classifyHost(host)?.tier;
    if (REVIEW_TIERS.has(tier)) hosts.add(host);
  }
  return hosts.size;
}

export function hasEnoughReviewEvidence(sources = [], classifyHost, minHosts = 3, options = {}) {
  return countReviewTierHosts(sources, classifyHost, options) >= Math.max(1, Number(minHosts) || 3);
}

export function defaultSearchCooldownPath(cwd = process.cwd()) {
  return path.join(cwd, ".data", "enrichment-search-cooldown.json");
}

export function readSearchCooldown(filePath, now = Date.now()) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const untilMs = Number(raw?.untilMs || 0);
    if (!untilMs || untilMs <= now) return null;
    return {
      untilMs,
      reason: String(raw?.reason || "rate_limited"),
    };
  } catch {
    return null;
  }
}

export function writeSearchCooldown(
  filePath,
  { untilMs, reason = "rate_limited" } = {},
  now = Date.now(),
) {
  const until = Number(untilMs) || now + 20 * 60 * 1000;
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    filePath,
    `${JSON.stringify({ untilMs: until, reason: String(reason || "rate_limited"), writtenAt: now }, null, 2)}\n`,
    "utf8",
  );
  return { untilMs: until, reason: String(reason || "rate_limited") };
}

export function isSearchCooldownActive(state, now = Date.now()) {
  return Boolean(state && Number(state.untilMs) > now);
}
