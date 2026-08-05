import dns from "node:dns/promises";
import { createRequire } from "node:module";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";
import { classifySourceHost } from "./enrichment-source-trust.mjs";
import {
  canFirecrawlScrape,
  firecrawlScrape,
  isFirecrawlConfigured,
} from "./enrichment-firecrawl.mjs";

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Load transitive undici (pnpm hoisted) without adding a package dependency. */
export function loadUndici() {
  const candidates = [
    "undici",
    path.join(__dirname, "../node_modules/undici"),
    path.join(__dirname, "../node_modules/.pnpm/node_modules/undici"),
  ];
  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch {
      // try next
    }
  }
  return null;
}

/**
 * DNS lookup override that returns only pre-validated addresses (true IP pin).
 * Host/SNI still come from the request URL hostname.
 */
export function createPinnedLookup(pinnedAddresses = []) {
  const records = (Array.isArray(pinnedAddresses) ? pinnedAddresses : [])
    .map((address) => {
      const ip = String(address || "").trim();
      const family = net.isIP(ip);
      return family ? { address: ip, family } : null;
    })
    .filter(Boolean);
  return function pinnedLookup(hostname, options, callback) {
    if (!records.length) {
      callback(new Error(`no pinned addresses for ${hostname}`));
      return;
    }
    if (options?.all) {
      callback(null, records.map((r) => ({ address: r.address, family: r.family })));
      return;
    }
    callback(null, records[0].address, records[0].family);
  };
}

const FETCHABLE_TIERS = new Set(["review", "scam_advisor", "retailer", "video"]);
const BINARY_CONTENT_RE = /(?:application\/pdf|image\/|audio\/|video\/|application\/zip|application\/octet-stream)/i;
const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata",
  "metadata.azure.com",
  "kubernetes.default",
  "kubernetes.default.svc",
]);
/** Azure Instance Metadata Service — not covered by RFC1918 checks alone. */
const BLOCKED_EXPLICIT_IPS = new Set(["168.63.129.16"]);

function cleanText(value, limit = 8000) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function hostnameFromUrl(value) {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** True when an IP must not be fetched (loopback, RFC1918, link-local, ULA, CGNAT, metadata). */
export function isBlockedFetchIp(ip) {
  const raw = String(ip || "").trim().toLowerCase();
  if (!raw || !net.isIP(raw)) return true;
  if (BLOCKED_EXPLICIT_IPS.has(raw)) return true;

  if (net.isIP(raw) === 4) {
    const [a, b, c] = raw.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a === 192 && b === 0 && c === 0) return true;
    if (a === 198 && (b === 18 || b === 19)) return true;
    return false;
  }

  if (raw === "::1" || raw === "::") return true;
  if (raw.startsWith("fc") || raw.startsWith("fd")) return true;
  if (raw.startsWith("fe80")) return true;
  if (raw.startsWith("::ffff:")) {
    const mapped = raw.slice("::ffff:".length);
    return isBlockedFetchIp(mapped);
  }
  return false;
}

export function isBlockedFetchHostname(hostname) {
  const host = String(hostname || "").toLowerCase().replace(/^\[|\]$/g, "");
  if (!host) return true;
  if (BLOCKED_HOSTNAMES.has(host)) return true;
  if (host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (host === "0.0.0.0") return true;
  return false;
}

/**
 * Reject non-http(s), credentials, blocked hosts, and private/link-local DNS answers.
 * Returns { url, addresses } so callers can re-check DNS immediately before connect (rebinding mitigation).
 */
export async function assertSafeFetchUrl(urlString) {
  let url;
  try {
    url = new URL(urlString);
  } catch {
    throw new Error("invalid URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`unsupported protocol: ${url.protocol}`);
  }
  if (url.username || url.password) {
    throw new Error("URL credentials not allowed");
  }

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (isBlockedFetchHostname(host)) {
    throw new Error(`blocked host: ${host}`);
  }

  if (net.isIP(host)) {
    if (isBlockedFetchIp(host)) throw new Error(`blocked IP: ${host}`);
    return { url, addresses: [host] };
  }

  const records = await dns.lookup(host, { all: true, verbatim: true });
  if (!records.length) throw new Error(`DNS failed for ${host}`);
  const addresses = [];
  for (const record of records) {
    if (isBlockedFetchIp(record.address)) {
      throw new Error(`blocked IP ${record.address} for ${host}`);
    }
    addresses.push(record.address);
  }
  return { url, addresses };
}

/** Second DNS pass immediately before connect; fails closed if answers diverge into a blocked IP. */
export async function assertDnsStable(hostname, priorAddresses = []) {
  const host = String(hostname || "").toLowerCase().replace(/^\[|\]$/g, "");
  if (!host || net.isIP(host)) return priorAddresses;
  const records = await dns.lookup(host, { all: true, verbatim: true });
  if (!records.length) throw new Error(`DNS failed for ${host}`);
  const addresses = [];
  for (const record of records) {
    if (isBlockedFetchIp(record.address)) {
      throw new Error(`blocked IP ${record.address} for ${host} (rebinding check)`);
    }
    addresses.push(record.address);
  }
  if (priorAddresses.length) {
    const prior = new Set(priorAddresses);
    const overlap = addresses.some((ip) => prior.has(ip));
    if (!overlap) {
      throw new Error(`DNS answers changed for ${host} (possible rebinding)`);
    }
  }
  return addresses;
}

export function isHighTrustFetchCandidate(source, vendorDomains = new Set()) {
  const host = hostnameFromUrl(source?.url);
  const tier = classifySourceHost(host).tier;
  return FETCHABLE_TIERS.has(tier) || vendorDomains.has(host);
}

function fetchTierRank(source, vendorDomains = new Set()) {
  const host = hostnameFromUrl(source?.url);
  const tier = classifySourceHost(host).tier;
  if (youtubeVideoId(source?.url)) return 0;
  if (tier === "review" || tier === "scam_advisor") return 1;
  if (tier === "video") return 2;
  if (tier === "retailer") return 3;
  if (vendorDomains.has(host)) return 4;
  return 5;
}

function isPermanentFetchError(message) {
  const msg = String(message || "").toLowerCase();
  // 403 often UA/WAF; retry with browser UA / Firecrawl. 404/410 are dead ends.
  return /http 404|http 410|unsupported content type|invalid url|blocked (host|ip)|unsupported protocol/.test(msg);
}

/**
 * Prefer review/scam/video URLs, skip permanent fetch failures, try extras until
 * we fill `limit` successful content_text captures (or exhaust candidates).
 */
export function selectPageFetchCandidates(sources = [], options = {}) {
  const vendorDomains = options.vendorDomains || new Set();
  const limit = Math.max(0, Number(options.limit ?? 6));
  const maxAttempts = Math.max(limit, Number(options.maxAttempts ?? limit * 3));

  const rankSort = (a, b) => {
    const tierDelta = fetchTierRank(a, vendorDomains) - fetchTierRank(b, vendorDomains);
    if (tierDelta !== 0) return tierDelta;
    const scoreA = Number(a.relevance_score || 0) + Number(a.trust_score || 0);
    const scoreB = Number(b.relevance_score || 0) + Number(b.trust_score || 0);
    return scoreB - scoreA;
  };

  const highTrust = sources
    .filter((source) => (
      isHighTrustFetchCandidate(source, vendorDomains)
      || Boolean(youtubeVideoId(source?.url))
    ))
    .filter((source) => !isPermanentFetchError(source?.raw_json?.fetch_error))
    .sort(rankSort);

  // When review/retailer URLs are scarce, still attempt top non-noise web hits.
  const seen = new Set(highTrust.map((s) => s.url));
  const fillers = sources
    .filter((source) => source?.url && !seen.has(source.url))
    .filter((source) => !isPermanentFetchError(source?.raw_json?.fetch_error))
    .filter((source) => {
      const host = hostnameFromUrl(source?.url);
      const tier = classifySourceHost(host).tier;
      return tier !== "affiliate_noise";
    })
    .sort(rankSort);

  const eligible = [...highTrust, ...fillers];

  return {
    candidates: eligible.slice(0, maxAttempts),
    successLimit: limit,
  };
}

/**
 * True when cached page text is long enough and younger than maxAgeMs.
 * Missing fetched_at → treat as stale so refresh jobs re-fetch.
 */
export function isContentCacheFresh(rawJson = {}, options = {}) {
  if (options.forceRefresh) return false;
  const text = cleanText(rawJson?.content_text, options.textLimit || 8000);
  if (text.length < 80) return false;
  const maxAgeMs = Number(
    options.maxAgeMs
    ?? (Number(options.maxAgeDays || 14) * 24 * 60 * 60 * 1000),
  );
  const fetchedAt = Date.parse(String(rawJson?.fetched_at || ""));
  if (!Number.isFinite(fetchedAt)) return false;
  return (Date.now() - fetchedAt) <= maxAgeMs;
}

export function extractMainText(html, limit = 8000) {
  const $ = cheerio.load(String(html || ""));
  $("script, style, noscript, svg, canvas, iframe, nav, footer, header, form, aside, .ads, .advertisement, [role='navigation'], [role='banner'], [role='contentinfo']").remove();

  const preferred = $(
    "[itemprop='reviewBody'], .review-content, .reviewText, .review-body, "
    + "[data-service-review-text-typography], main article, article, main, [role='main']",
  ).first();
  const content = preferred.length ? preferred : ($("main, article").first().length ? $("main, article").first() : $("body"));
  content.find("h1, h2, h3, h4, h5, h6, p, li, blockquote, section, div, br").append(" ");
  return cleanText(content.text(), limit);
}

export function youtubeVideoId(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host === "youtu.be") return url.pathname.split("/").filter(Boolean)[0] || "";
    if (host.endsWith("youtube.com")) {
      if (url.pathname === "/watch") return url.searchParams.get("v") || "";
      const match = url.pathname.match(/^\/(?:shorts|embed)\/([^/?#]+)/);
      return match?.[1] || "";
    }
  } catch {
    return "";
  }
  return "";
}

/** True for reddit.com / old.reddit.com hosts. */
export function isRedditUrl(value) {
  try {
    const host = new URL(String(value || "")).hostname.toLowerCase().replace(/^www\./, "");
    return host === "reddit.com" || host === "old.reddit.com" || host.endsWith(".reddit.com");
  } catch {
    return false;
  }
}

/**
 * Map a Reddit HTML URL to its public JSON endpoint (ToS-aware, no Pushshift).
 * Comment threads → …/.json; search → …/search.json?…
 */
export function redditJsonUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    if (!isRedditUrl(url.href)) return "";
    url.protocol = "https:";
    url.hostname = "old.reddit.com";
    const path = url.pathname.replace(/\/+$/, "") || "/";
    if (/\/comments\//i.test(path)) {
      if (!/\.json$/i.test(path)) url.pathname = `${path}.json`;
      return url.toString();
    }
    if (/\/search\/?$/i.test(path) || path === "/search") {
      url.pathname = "/search.json";
      return url.toString();
    }
    if (!/\.json$/i.test(path)) url.pathname = `${path}.json`;
    return url.toString();
  } catch {
    return "";
  }
}

function flattenRedditJsonText(payload, limit = 8000) {
  const chunks = [];
  const visit = (node, depth = 0) => {
    if (!node || chunks.join("\n").length >= limit || depth > 8) return;
    if (Array.isArray(node)) {
      for (const child of node) visit(child, depth + 1);
      return;
    }
    if (typeof node !== "object") return;
    const data = node.data && typeof node.data === "object" ? node.data : node;
    const title = cleanText(data.title || "", 500);
    const selftext = cleanText(data.selftext || data.body || "", 4000);
    if (title) chunks.push(title);
    if (selftext) chunks.push(selftext);
    if (data.children) visit(data.children, depth + 1);
    if (node.children) visit(node.children, depth + 1);
  };
  visit(payload);
  return cleanText(chunks.join("\n\n"), limit);
}

async function tryRedditJsonFetch(source, rawJson, options = {}) {
  if (!isRedditUrl(source?.url)) return null;
  const jsonUrl = redditJsonUrl(source.url);
  if (!jsonUrl) return null;
  try {
    await assertSafeFetchUrl(jsonUrl);
  } catch {
    return null;
  }
  try {
    const response = await fetchWithLimits(jsonUrl, options);
    let payload = null;
    try {
      payload = JSON.parse(response.body);
    } catch {
      return null;
    }
    const contentText = flattenRedditJsonText(payload, options.textLimit || 8000);
    if (contentText.length < 80) return null;
    return {
      ...source,
      raw_json: {
        ...rawJson,
        content_text: contentText,
        fetched_at: new Date().toISOString(),
        fetch_provider: "reddit_json",
        final_url: response.finalUrl || jsonUrl,
        fetch_error: undefined,
      },
    };
  } catch (error) {
    return {
      ...source,
      raw_json: {
        ...rawJson,
        fetch_error: cleanText(error?.message || error, 500),
        fetch_attempted_at: new Date().toISOString(),
        fetch_provider: "reddit_json_failed",
      },
    };
  }
}

async function readBodyCapped(response, maxBytes) {
  if (!response.body || typeof response.body.getReader !== "function") {
    const bytes = new Uint8Array(await response.arrayBuffer());
    const truncated = bytes.byteLength > maxBytes;
    return {
      body: new TextDecoder().decode(truncated ? bytes.slice(0, maxBytes) : bytes),
      truncated,
    };
  }

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  let truncated = false;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value?.byteLength) continue;
    const remaining = maxBytes - total;
    if (remaining <= 0) {
      truncated = true;
      try { await reader.cancel(); } catch { /* ignore */ }
      break;
    }
    if (value.byteLength > remaining) {
      chunks.push(value.slice(0, remaining));
      total += remaining;
      truncated = true;
      try { await reader.cancel(); } catch { /* ignore */ }
      break;
    }
    chunks.push(value);
    total += value.byteLength;
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return {
    body: new TextDecoder().decode(merged),
    truncated,
  };
}

async function fetchWithLimits(url, options = {}) {
  const timeoutMs = options.timeoutMs || 8000;
  const maxBytes = options.maxBytes || 1_500_000;
  const maxRedirects = Math.max(0, Number(options.maxRedirects ?? 5));
  let current = String(url);
  const undici = options.undici || loadUndici();

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const safe = await assertSafeFetchUrl(current);
    const addresses = await assertDnsStable(safe.url.hostname, safe.addresses);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const headers = {
        // Browser-like UA reduces HTTP 403 on review hosts that block bot UAs.
        "User-Agent": options.userAgent
          || "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      };

      let response;
      let dispatcher;
      if (undici?.Agent && undici?.fetch && addresses.length && !net.isIP(safe.url.hostname.replace(/^\[|\]$/g, ""))) {
        dispatcher = new undici.Agent({
          connect: {
            lookup: createPinnedLookup(addresses),
          },
        });
        try {
          response = await undici.fetch(current, {
            redirect: "manual",
            signal: controller.signal,
            headers,
            dispatcher,
          });
        } finally {
          try { await dispatcher.close(); } catch { /* ignore */ }
        }
      } else {
        response = await fetch(current, {
          redirect: "manual",
          signal: controller.signal,
          headers,
        });
      }

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        if (!location) throw new Error("redirect without location");
        current = new URL(location, current).toString();
        continue;
      }

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const contentType = response.headers.get("content-type") || "";
      if (BINARY_CONTENT_RE.test(contentType)) throw new Error(`unsupported content type: ${contentType}`);

      // Cap/truncate instead of aborting — large review pages still yield usable text.
      const { body } = await readBodyCapped(response, maxBytes);
      return {
        body,
        contentType,
        finalUrl: response.url || current,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error(`too many redirects (>${maxRedirects})`);
}

async function fetchYouTubeMetadata(url, options = {}) {
  const endpoint = new URL("https://www.youtube.com/oembed");
  endpoint.searchParams.set("url", url);
  endpoint.searchParams.set("format", "json");
  const response = await fetchWithLimits(endpoint.toString(), {
    timeoutMs: options.timeoutMs,
    maxBytes: 100_000,
  });
  const data = JSON.parse(response.body);
  return {
    video_title: cleanText(data.title, 500),
    channel_name: cleanText(data.author_name, 255),
    channel_url: cleanText(data.author_url, 1000),
  };
}

function parseTimedTextXml(xml) {
  const $ = cheerio.load(String(xml || ""), { xmlMode: true });
  const chunks = [];
  $("text").each((_, el) => {
    const piece = cleanText($(el).text(), 2000);
    if (piece) chunks.push(piece);
  });
  return cleanText(chunks.join(" "), 8000);
}

/** Prefer TranscriptAPI when keyed; else YouTube timedtext (no new deps). */
export async function fetchYouTubeTranscript(videoId, options = {}) {
  const id = String(videoId || "").trim();
  if (!id) return "";

  const apiKey = process.env.TRANSCRIPT_API_KEY || "";
  if (apiKey) {
    try {
      const endpoint = new URL("https://transcriptapi.com/api/v2/youtube/transcript");
      endpoint.searchParams.set("video_url", `https://www.youtube.com/watch?v=${id}`);
      endpoint.searchParams.set("format", "text");
      endpoint.searchParams.set("include_timestamp", "false");
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 8000);
      try {
        const res = await fetch(endpoint, {
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "User-Agent": "APF-Enrichment/1.0",
          },
        });
        if (res.ok) {
          const payload = await res.json().catch(() => null);
          const text = cleanText(
            payload?.transcript || payload?.text || payload?.data?.transcript || "",
            options.textLimit || 8000,
          );
          if (text) return text;
        }
      } finally {
        clearTimeout(timeout);
      }
    } catch {
      // fall through to timedtext
    }
  }

  try {
    const listUrl = `https://www.youtube.com/api/timedtext?type=list&v=${encodeURIComponent(id)}`;
    const list = await fetchWithLimits(listUrl, {
      timeoutMs: options.timeoutMs,
      maxBytes: 200_000,
    });
    const $ = cheerio.load(list.body, { xmlMode: true });
    const tracks = [];
    $("track").each((_, el) => {
      tracks.push({
        lang: String($(el).attr("lang_code") || "").trim(),
        name: String($(el).attr("name") || ""),
        kind: String($(el).attr("kind") || "").toLowerCase(),
        isDefault: $(el).attr("lang_default") === "true",
      });
    });
    if (!tracks.length) return "";

    const scoreTrack = (t) => {
      let score = 0;
      if (/^en([_-]|$)/i.test(t.lang)) score += 100;
      if (t.isDefault) score += 40;
      if (t.kind !== "asr" && !/auto[- ]?generat/i.test(t.name)) score += 25;
      if (/^en/i.test(t.lang)) score += 10;
      return score;
    };
    tracks.sort((a, b) => scoreTrack(b) - scoreTrack(a));

    const textLimit = options.textLimit || 8000;
    for (const track of tracks.slice(0, 6)) {
      if (!track.lang) continue;
      const variants = [
        `https://www.youtube.com/api/timedtext?lang=${encodeURIComponent(track.lang)}&v=${encodeURIComponent(id)}`,
        `https://www.youtube.com/api/timedtext?lang=${encodeURIComponent(track.lang)}&v=${encodeURIComponent(id)}&fmt=srv1`,
        `https://www.youtube.com/api/timedtext?lang=${encodeURIComponent(track.lang)}&v=${encodeURIComponent(id)}&fmt=srv3`,
      ];
      if (track.kind === "asr" || /auto[- ]?generat/i.test(track.name)) {
        variants.push(
          `https://www.youtube.com/api/timedtext?lang=${encodeURIComponent(track.lang)}&v=${encodeURIComponent(id)}&kind=asr`,
        );
      }
      for (const trackUrl of variants) {
        try {
          const body = await fetchWithLimits(trackUrl, {
            timeoutMs: options.timeoutMs,
            maxBytes: 1_000_000,
          });
          const text = parseTimedTextXml(body.body).slice(0, textLimit);
          if (text.length >= 40) return text;
        } catch {
          // try next variant / language
        }
      }
    }
    return "";
  } catch {
    return "";
  }
}

/**
 * When local fetch is thin/failed (non-permanent), try Jina Reader then Firecrawl.
 * Ladder: local → Jina (optional) → Firecrawl (BYOK) → caller may snippet_fallback.
 * SSRF-checked before leaving the box. Skips YouTube (dedicated path).
 */
export function isJinaReaderEnabled(env = process.env) {
  const flag = String(env.REVIEW_ENRICHMENT_JINA || "1").trim().toLowerCase();
  if (flag === "0" || flag === "false" || flag === "off" || flag === "no") return false;
  return true;
}

export function buildJinaReaderUrl(targetUrl) {
  const raw = String(targetUrl || "").trim();
  if (!raw) return "";
  return `https://r.jina.ai/${raw}`;
}

async function tryJinaReaderFallback(source, rawJson, options = {}) {
  if (options.allowJina === false) return null;
  if (!isJinaReaderEnabled()) return null;
  if (youtubeVideoId(source?.url)) return null;

  try {
    await assertSafeFetchUrl(source.url);
  } catch {
    return null;
  }

  const jinaUrl = buildJinaReaderUrl(source.url);
  if (!jinaUrl) return null;

  const timeoutSec = Math.max(
    5,
    Math.min(180, Math.ceil(Number(options.timeoutMs || process.env.REVIEW_ENRICHMENT_FETCH_TIMEOUT_MS || 8000) / 1000)),
  );
  const headers = {
    Accept: "text/plain",
    "X-Respond-With": "markdown",
    "X-Timeout": String(timeoutSec),
    "User-Agent": "APF-Enrichment/1.0",
  };
  const token = String(process.env.JINA_API_KEY || "").trim();
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const res = await fetch(jinaUrl, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(Math.max(5000, timeoutSec * 1000 + 2000)),
    });
    if (!res.ok) {
      return {
        ...source,
        raw_json: {
          ...rawJson,
          fetch_error: cleanText(`jina HTTP ${res.status}`, 500),
          fetch_attempted_at: new Date().toISOString(),
          fetch_provider: "jina_failed",
        },
      };
    }
    const body = await res.text();
    const contentText = cleanText(body, options.textLimit || 8000);
    if (contentText.length < 80) return null;
    return {
      ...source,
      raw_json: {
        ...rawJson,
        content_text: contentText,
        fetched_at: new Date().toISOString(),
        fetch_provider: "jina",
        fetch_error: undefined,
      },
    };
  } catch (error) {
    return {
      ...source,
      raw_json: {
        ...rawJson,
        fetch_error: cleanText(error?.message || error, 500),
        fetch_attempted_at: new Date().toISOString(),
        fetch_provider: "jina_failed",
      },
    };
  }
}

/**
 * When local fetch is thin/failed (non-permanent), try Firecrawl scrape if configured + budget.
 * SSRF-checked before leaving the box. Skips YouTube (dedicated path).
 */
async function tryFirecrawlPageFallback(source, rawJson, options = {}) {
  if (options.allowFirecrawl === false) return null;
  if (!isFirecrawlConfigured() || !canFirecrawlScrape()) return null;
  if (youtubeVideoId(source?.url)) return null;

  try {
    await assertSafeFetchUrl(source.url);
  } catch {
    return null;
  }

  try {
    const scraped = await firecrawlScrape(source.url, {
      textLimit: options.textLimit || 8000,
    });
    const contentText = cleanText(scraped.content_text, options.textLimit || 8000);
    if (contentText.length < 80) return null;
    return {
      ...source,
      raw_json: {
        ...rawJson,
        content_text: contentText,
        fetched_at: new Date().toISOString(),
        fetch_provider: "firecrawl",
        fetch_error: undefined,
      },
    };
  } catch (error) {
    return {
      ...source,
      raw_json: {
        ...rawJson,
        fetch_error: cleanText(error?.message || error, 500),
        fetch_attempted_at: new Date().toISOString(),
        fetch_provider: "firecrawl_failed",
      },
    };
  }
}

async function trySecondaryPageFallbacks(source, rawJson, options = {}) {
  const viaJina = await tryJinaReaderFallback(source, rawJson, options);
  if (viaJina?.raw_json?.content_text
    && cleanText(viaJina.raw_json.content_text).length >= 80) {
    return viaJina;
  }
  const viaFirecrawl = await tryFirecrawlPageFallback(source, {
    ...rawJson,
    ...(viaJina?.raw_json?.fetch_provider ? { jina_fetch_provider: viaJina.raw_json.fetch_provider } : {}),
    ...(viaJina?.raw_json?.fetch_error ? { jina_fetch_error: viaJina.raw_json.fetch_error } : {}),
  }, options);
  if (viaFirecrawl?.raw_json?.content_text
    && cleanText(viaFirecrawl.raw_json.content_text).length >= 80) {
    return viaFirecrawl;
  }
  return viaFirecrawl || viaJina || null;
}

export async function enrichSourceContent(source, options = {}) {
  const rawJson = source?.raw_json && typeof source.raw_json === "object"
    ? source.raw_json
    : {};
  if (isContentCacheFresh(rawJson, options)) {
    const cachedText = cleanText(rawJson.content_text, options.textLimit || 8000);
    return { ...source, raw_json: { ...rawJson, content_text: cachedText } };
  }

  const snippetFallback = () => {
    const snippet = cleanText(source?.snippet || rawJson?.snippet || "", options.textLimit || 8000);
    if (snippet.length < 80) return null;
    return {
      ...source,
      raw_json: {
        ...rawJson,
        content_text: snippet,
        fetched_at: new Date().toISOString(),
        fetch_provider: "snippet_fallback",
      },
    };
  };

  const videoId = youtubeVideoId(source?.url);
  try {
    if (videoId) {
      const metadata = await fetchYouTubeMetadata(source.url, options);
      const transcript = await fetchYouTubeTranscript(videoId, options);
      return {
        ...source,
        title: metadata.video_title || source.title,
        raw_json: {
          ...rawJson,
          ...metadata,
          youtube_video_id: videoId,
          content_text: transcript || cleanText(
            [metadata.video_title, metadata.channel_name, source.snippet]
              .filter(Boolean)
              .join(" — "),
            options.textLimit || 8000,
          ),
          transcript_fetched: Boolean(transcript),
          fetched_at: new Date().toISOString(),
          fetch_provider: "youtube",
        },
      };
    }

    const viaReddit = await tryRedditJsonFetch(source, rawJson, options);
    if (viaReddit?.raw_json?.content_text
      && cleanText(viaReddit.raw_json.content_text).length >= 80) {
      return viaReddit;
    }

    const response = await fetchWithLimits(source.url, options);
    const contentText = extractMainText(response.body, options.textLimit || 8000);
    if (contentText.length >= 80) {
      return {
        ...source,
        raw_json: {
          ...rawJson,
          content_text: contentText,
          content_type: response.contentType,
          final_url: response.finalUrl,
          fetched_at: new Date().toISOString(),
          fetch_provider: "local",
          fetch_error: undefined,
        },
      };
    }

    const viaSecondary = await trySecondaryPageFallbacks(source, {
      ...rawJson,
      content_type: response.contentType,
      final_url: response.finalUrl,
      local_content_text: contentText || undefined,
    }, options);
    if (viaSecondary?.raw_json?.content_text
      && cleanText(viaSecondary.raw_json.content_text).length >= 80) {
      return viaSecondary;
    }

    if (!contentText) {
      const fallback = snippetFallback();
      if (fallback) return fallback;
      throw new Error("no readable page text");
    }
    return {
      ...source,
      raw_json: {
        ...rawJson,
        content_text: contentText,
        content_type: response.contentType,
        final_url: response.finalUrl,
        fetched_at: new Date().toISOString(),
        fetch_provider: "local",
        fetch_error: undefined,
      },
    };
  } catch (error) {
    const msg = cleanText(error?.message || error, 500);
    if (isPermanentFetchError(msg)) {
      return snippetFallback() || {
        ...source,
        raw_json: {
          ...rawJson,
          fetch_error: msg,
          fetch_attempted_at: new Date().toISOString(),
        },
      };
    }

    const viaSecondary = await trySecondaryPageFallbacks(source, {
      ...rawJson,
      local_fetch_error: msg,
    }, options);
    if (viaSecondary?.raw_json?.content_text
      && cleanText(viaSecondary.raw_json.content_text).length >= 80) {
      return viaSecondary;
    }

    return snippetFallback() || {
      ...source,
      raw_json: {
        ...rawJson,
        fetch_error: viaSecondary?.raw_json?.fetch_error || msg,
        fetch_attempted_at: new Date().toISOString(),
      },
    };
  }
}

export async function enrichHighTrustSources(sources, options = {}) {
  const vendorDomains = options.vendorDomains || new Set();
  const limit = Math.max(0, Number(options.limit ?? 6));
  const delayMs = Math.max(0, Number(options.delayMs ?? 250));
  const { candidates, successLimit } = selectPageFetchCandidates(sources, {
    vendorDomains,
    limit,
    maxAttempts: options.maxAttempts,
  });
  const selectedUrls = new Set(candidates.map((s) => s.url));
  const enrichedByUrl = new Map();
  let successes = 0;

  for (const source of candidates) {
    if (successes >= successLimit) break;
    const enriched = await enrichSourceContent(source, options);
    enrichedByUrl.set(source.url, enriched);
    const textLen = cleanText(enriched?.raw_json?.content_text, options.textLimit || 8000).length;
    if (textLen >= 80) successes += 1;
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  return sources.map((source) => {
    if (!selectedUrls.has(source.url)) return source;
    return enrichedByUrl.get(source.url) || source;
  });
}
