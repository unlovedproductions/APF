#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import mysql from "mysql2/promise";
import { z } from "zod";
import { SCORING_VERSION, scoreProduct } from "./marketplace-scoring.mjs";
import {
  ensureVendorMaterialsTable,
  loadVendorMaterials,
  hostnameFromUrl,
  isMarketplaceHost,
  resolveCreatorVendor,
} from "./digistore24-vendor-materials.mjs";
import {
  isMarketplaceBrandName,
  resolveExportProductName,
  sanitizeBuyerPrice,
} from "./digistore24-detail-extractor.mjs";
import {
  classifySourceHost,
  competitorEvidenceQueries,
  digistoreEvidenceQueries,
  digistoreVendorQueries,
  evidenceCoverageFromSources,
  extractCompetitorCandidatesFromHits,
  normalizeSuggestedCompetitors,
  productNameTokenMatch,
  seriesNameForStyle,
  splitClaimAndReviewSources,
  stripAffiliateMetaLines,
} from "./enrichment-source-trust.mjs";
import {
  ensureVendorProfilesTable,
  upsertVendorProfile,
} from "./vendor-profiles.mjs";
import { enrichHighTrustSources } from "./enrichment-page-fetch.mjs";
import { reapExhaustedJobs, reapStaleRunningJobs } from "./apf-db-helpers.mjs";

// BEGIN UNLOVED_MYSQL_NAN_GUARD
function unlovedSanitizeSqlValue(v) {
  if (typeof v === "number" && !Number.isFinite(v)) return null;
  if (Array.isArray(v)) return v.map(unlovedSanitizeSqlValue);
  if (v && typeof v === "object") {
    const out = {};
    for (const [k, val] of Object.entries(v)) out[k] = unlovedSanitizeSqlValue(val);
    return out;
  }
  return v;
}

function unlovedSanitizeSqlText(sql) {
  if (typeof sql !== "string") return sql;
  return sql.replace(/\bNaN\b/g, "NULL");
}

function unlovedPatchMysqlNanGuard(mysqlModule) {
  if (!mysqlModule || mysqlModule.__unlovedNanGuardPatched) return;

  const originalCreateConnection = mysqlModule.createConnection?.bind(mysqlModule);
  if (!originalCreateConnection) return;

  mysqlModule.createConnection = async (...args) => {
    const conn = await originalCreateConnection(...args);

    for (const method of ["query", "execute"]) {
      if (!conn[method] || conn[method].__unlovedNanGuardPatched) continue;

      const original = conn[method].bind(conn);

      conn[method] = (sql, params, ...rest) => {
        return original(
          unlovedSanitizeSqlText(sql),
          unlovedSanitizeSqlValue(params),
          ...rest.map(unlovedSanitizeSqlValue)
        );
      };

      conn[method].__unlovedNanGuardPatched = true;
    }

    return conn;
  };

  mysqlModule.__unlovedNanGuardPatched = true;
}

if (typeof mysql !== "undefined") {
  unlovedPatchMysqlNanGuard(mysql);
}
// END UNLOVED_MYSQL_NAN_GUARD


function loadEnv(file = ".env") {
  if (!fs.existsSync(file)) return;

  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;

    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }

    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}

loadEnv(path.resolve(process.cwd(), ".env"));

const ONCE = process.argv.includes("--once");

function cliArg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return 0;
  return Number(process.argv[index + 1]) || 0;
}

const CLAIM_PRODUCT_ID = cliArg("--product-id");
const CLAIM_USER_ID = cliArg("--user-id") || Number(process.env.APF_USER_ID || "0") || 0;

const DATABASE_URL = process.env.DATABASE_URL;
const REVIEW_ENRICHMENT_PROVIDER = process.env.REVIEW_ENRICHMENT_PROVIDER || "searxng";
/** Canonical host URL — keep SearXNG on :8088 (docker maps 8088:8080). */
const SEARXNG_BASE_URL = process.env.SEARXNG_BASE_URL || "http://localhost:8088";
const BRAVE_SEARCH_API_KEY = process.env.BRAVE_SEARCH_API_KEY || "";
const MAX_SOURCES = Number(process.env.REVIEW_ENRICHMENT_MAX_SOURCES || "25");
const FULL_PAGE_SOURCE_LIMIT = Number(process.env.REVIEW_ENRICHMENT_FULL_PAGE_LIMIT || "4");
const FULL_PAGE_FETCH_TIMEOUT_MS = Number(process.env.REVIEW_ENRICHMENT_FETCH_TIMEOUT_MS || "8000");
const FULL_PAGE_FETCH_DELAY_MS = Number(process.env.REVIEW_ENRICHMENT_FETCH_DELAY_MS || "250");
const REFRESH_DAYS = Number(process.env.REVIEW_ENRICHMENT_REFRESH_DAYS || "14");
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
const LLM_MODEL = process.env.LLM_MODEL || "qwen2.5:14b-instruct-q5_K_M";

if (!DATABASE_URL) {
  console.error("DATABASE_URL missing.");
  process.exit(1);
}

function clamp(v, n = 2000) {
  return String(v || "").replace(/\s+/g, " ").trim().slice(0, n);
}

function briefText(value, fallback = "") {
  if (value == null || value === "") return fallback;
  if (typeof value === "string") return clamp(value);
  if (Array.isArray(value)) return clamp(value.map(x => briefText(x, "")).filter(Boolean).join("; "));
  if (typeof value === "object") {
    return clamp(Object.values(value).map(x => briefText(x, "")).filter(Boolean).join("; "));
  }
  return clamp(String(value));
}

function consumerProductContext(product) {
  const scrub = (text) => String(text || "")
    .replace(/\b\d+%\s*commission\b/gi, "")
    .replace(/\bearn\s+\d+%\s+commission\b/gi, "")
    .replace(/\baffiliate\b/gi, "")
    .replace(/\bpromot(e|ing|ion)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  return {
    ...product,
    name: scrub(product.name),
    description: scrub(product.description),
    category: product.category,
    vendor: product.vendor,
    platform: product.platform,
    cartValue: product.cartValue,
  };
}

const PROMPTS_DIR = path.resolve(process.cwd(), "docs/prompts");

const INLINE_PROMPTS = {
  digistore24: `Create a buyer-facing consumer product brief as strict JSON for a video aimed at regular customers, NOT affiliate marketers.

Product (affiliate/commission language in the name or description should be ignored):
{{PRODUCT_JSON}}

Primary vendor sales materials (highest priority — claims / mechanism / benefits only):
{{VENDOR_MATERIALS_JSON}}

Vendor-domain claim sources (sales/marketing only — do not treat as independent reviews):
{{CLAIM_SOURCES_JSON}}

Independent review sources (reviews / complaints / scam checks / YouTube only):
{{REVIEW_SOURCES_JSON}}

Retrieved competitor candidates (choose only from this list; empty array is allowed):
{{COMPETITOR_CANDIDATES_JSON}}

Rules:
- Write for end consumers considering a purchase, not for affiliates promoting the product.
- common_claims, mechanism language, and benefits must come from vendor materials / claim sources only.
- positive_signals and common_complaints must come from independent review sources only. If none exist, use [] and lower confidence_score.
- Never invent praises from sales copy when independent reviews are missing.
- Explicitly ban affiliate compliance text, keyword-bidding rules, Digistore nav chrome, commission/EPC language.
- Do not invent facts.
- Avoid affiliate-marketer language like "promote", "commission", "JV", or "hidden gem".
- Return only JSON with:
review_summary, positive_signals, negative_signals, common_claims, common_complaints, target_audience, who_it_may_help, who_should_skip_it, best_video_angles, cta_guidance, confidence_score, recommended_content_style, suggested_competitors, price_display, price_comparison, series_name, coupon_code, evidence_coverage
- recommended_content_style must be one of: honest_review, elimination, worth_it_or_waste, budget_challenge, vs_battle, standard
- suggested_competitors must be chosen only from COMPETITOR_CANDIDATES_JSON (use [] if none are real). Never invent brand names.
- price_display must describe what a buyer would pay, not affiliate payouts
- price_comparison must compare the buyer offer against category alternatives without inventing prices
- series_name must match the selected content style, coupon_code must be an empty string when no verified coupon exists, and evidence_coverage must be a JSON object summarizing the supplied sources`,
  generic: `Create a cautious affiliate product review brief as strict JSON.

Product:
{{PRODUCT_JSON}}

Sources:
{{SOURCES_JSON}}

Retrieved competitor candidates (choose only from this list; empty array is allowed):
{{COMPETITOR_CANDIDATES_JSON}}

Rules:
- Do not invent facts.
- Use "sources suggest" or "product claims" when evidence is weak.
- Avoid medical, financial, or guaranteed-result claims.
- Return only JSON with:
review_summary, positive_signals, negative_signals, common_claims, common_complaints, target_audience, who_it_may_help, who_should_skip_it, best_video_angles, cta_guidance, confidence_score, recommended_content_style, suggested_competitors, price_display
- recommended_content_style must be one of: honest_review, elimination, worth_it_or_waste, budget_challenge, vs_battle, standard
- suggested_competitors must be chosen only from COMPETITOR_CANDIDATES_JSON (use [] if none are real). Never invent brand names.
- price_display must be a short human-readable price string; use APV/aggregateSales when no retail price is known, otherwise "Varies"`,
};

function loadPromptTemplate(name) {
  const filePath = path.join(PROMPTS_DIR, `enrichment-${name}.txt`);
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, "utf8");
    }
  } catch {
    // fall through to inline template
  }
  return INLINE_PROMPTS[name] || "";
}

function renderPromptTemplate(template, vars) {
  let out = template;
  for (const [key, value] of Object.entries(vars)) {
    out = out.replaceAll(`{{${key}}}`, value);
  }
  return out;
}

function sourcePayload(sources, limit = 12) {
  return JSON.stringify(sources.slice(0, limit).map(s => ({
    title: s.title,
    url: s.url,
    snippet: s.snippet,
    excerpt: String(s.raw_json?.content_text || "").slice(0, 8000),
    channel: s.raw_json?.channel_name || "",
    relevance_score: s.relevance_score,
    trust_score: s.trust_score,
    sentiment: s.sentiment,
  })), null, 2);
}

function buildEnrichmentPrompt(isDigistore, product, sources, vendorMaterials, options = {}) {
  const variant = isDigistore ? "digistore24" : "generic";
  const template = loadPromptTemplate(variant);
  const competitorJson = JSON.stringify(options.competitorCandidates || [], null, 2);
  const { claimSources = [], reviewSources = [] } = options;
  const vars = isDigistore
    ? {
      PRODUCT_JSON: JSON.stringify(consumerProductContext(product), null, 2),
      VENDOR_MATERIALS_JSON: JSON.stringify(vendorMaterialSummary(vendorMaterials), null, 2),
      CLAIM_SOURCES_JSON: sourcePayload(claimSources.length ? claimSources : sources.filter(s => s.source_type === "vendor")),
      REVIEW_SOURCES_JSON: sourcePayload(reviewSources),
      COMPETITOR_CANDIDATES_JSON: competitorJson,
    }
    : {
      PRODUCT_JSON: JSON.stringify(product, null, 2),
      SOURCES_JSON: sourcePayload(sources, sources.length),
      COMPETITOR_CANDIDATES_JSON: competitorJson,
    };
  return renderPromptTemplate(template, vars);
}

const briefString = z.union([z.string(), z.number()]).transform(v => String(v));
const briefStringArray = z.array(briefString).optional();
const contentStyleSchema = z.enum([
  "honest_review",
  "elimination",
  "worth_it_or_waste",
  "budget_challenge",
  "vs_battle",
  "standard",
]);

const digistoreBriefSchema = z.object({
  review_summary: briefString.pipe(z.string().min(1)),
  positive_signals: briefStringArray,
  negative_signals: briefStringArray,
  common_claims: briefStringArray,
  common_complaints: briefStringArray,
  target_audience: briefString.optional(),
  who_it_may_help: briefString.optional(),
  who_should_skip_it: briefString.optional(),
  best_video_angles: z.array(briefString).min(1),
  cta_guidance: briefString.optional(),
  confidence_score: z.coerce.number().min(0).max(100).optional(),
  recommended_content_style: contentStyleSchema.optional(),
  suggested_competitors: briefStringArray,
  price_display: briefString.optional(),
  price_comparison: briefString.optional(),
  series_name: briefString.optional(),
  coupon_code: briefString.optional(),
  evidence_coverage: z.record(z.string(), z.unknown()).optional(),
});

const genericBriefSchema = digistoreBriefSchema.omit({
  price_comparison: true,
  series_name: true,
  coupon_code: true,
  evidence_coverage: true,
});

function parseAndValidateLlmBrief(raw, isDigistore) {
  const schema = isDigistore ? digistoreBriefSchema : genericBriefSchema;
  const parsed = schema.safeParse(raw);
  if (parsed.success) return parsed.data;

  const issues = parsed.error.issues
    .map(i => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ");
  console.error(`Brief schema validation failed: ${issues}`);
  return null;
}

const REVIEW_BRIEF_COLUMNS = [
  { name: "recommended_content_style", ddl: "ADD COLUMN recommended_content_style TEXT NULL AFTER cta_guidance" },
  { name: "suggested_competitors", ddl: "ADD COLUMN suggested_competitors JSON NULL AFTER recommended_content_style" },
  { name: "price_display", ddl: "ADD COLUMN price_display TEXT NULL AFTER suggested_competitors" },
  { name: "price_comparison", ddl: "ADD COLUMN price_comparison TEXT NULL AFTER price_display" },
  { name: "series_name", ddl: "ADD COLUMN series_name TEXT NULL AFTER price_comparison" },
  { name: "coupon_code", ddl: "ADD COLUMN coupon_code TEXT NULL AFTER series_name" },
  { name: "evidence_coverage", ddl: "ADD COLUMN evidence_coverage JSON NULL AFTER coupon_code" },
];

async function ensureReviewBriefSchema(conn) {
  const [rows] = await conn.query(`
    SELECT COLUMN_NAME
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_review_briefs'
  `);
  const existing = new Set(rows.map(r => r.COLUMN_NAME));
  const missing = REVIEW_BRIEF_COLUMNS.map(col => col.name).filter(name => !existing.has(name));
  if (missing.length) {
    throw new Error(
      `product_review_briefs missing columns: ${missing.join(", ")}. Run: pnpm db:push`
    );
  }

  const [result] = await conn.query(`
    UPDATE review_enrichment_jobs
    SET status='queued', attempts=0, next_run_at=NOW(), error_message=NULL, updated_at=NOW()
    WHERE status='failed'
      AND error_message LIKE '%recommended_content_style%'
  `);
  if (result.affectedRows) {
    console.log(`Requeued ${result.affectedRows} failed review jobs after schema check`);
  }
}

async function reconcileStaleQueuedJobs(conn) {
  const [result] = await conn.query(`
    UPDATE review_enrichment_jobs j
    JOIN product_review_briefs b ON b.product_id = j.product_id
    SET j.status='complete',
        j.error_message=NULL,
        j.next_run_at=DATE_ADD(NOW(), INTERVAL ? DAY)
    WHERE j.status = 'queued'
      AND b.enrichment_status = 'complete'
      AND (j.next_run_at > NOW() OR j.attempts >= 10)
  `, [REFRESH_DAYS]);

  if (result.affectedRows) {
    console.log(`Reconciled ${result.affectedRows} stale queued jobs with complete briefs`);
  }
}

async function enqueueMissingProducts(conn) {
  await reconcileStaleQueuedJobs(conn);

  await conn.query(`
    INSERT INTO review_enrichment_jobs (product_id, status, next_run_at)
    SELECT id, 'queued', NOW()
    FROM products
    WHERE deletedAt IS NULL
    ON DUPLICATE KEY UPDATE updated_at = updated_at
  `);

  if (REVIEW_ENRICHMENT_PROVIDER === "searxng" || BRAVE_SEARCH_API_KEY) {
    await conn.query(`
      UPDATE review_enrichment_jobs
      SET status='queued', attempts=0, next_run_at=NOW(), error_message=NULL, updated_at=NOW()
      WHERE status='pending_api_key'
    `);
  }
}

async function claimJob(conn) {
  await conn.query("START TRANSACTION");

  let scopeSql = "";
  const scopeParams = [];
  if (CLAIM_PRODUCT_ID > 0) {
    scopeSql = " AND product_id = ?";
    scopeParams.push(CLAIM_PRODUCT_ID);
  } else if (CLAIM_USER_ID > 0) {
    scopeSql = " AND product_id IN (SELECT id FROM products WHERE userId = ?)";
    scopeParams.push(CLAIM_USER_ID);
  }

  const [rows] = await conn.query(`
    SELECT id, product_id
    FROM review_enrichment_jobs
    WHERE status IN ('queued','failed','pending_api_key')
      AND next_run_at <= NOW()
      AND attempts < 10
      ${scopeSql}
    ORDER BY next_run_at ASC, id ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  `, scopeParams);

  if (!rows.length) {
    await conn.query("COMMIT");
    return null;
  }

  const job = rows[0];

  await conn.query(`
    UPDATE review_enrichment_jobs
    SET status='running', attempts=attempts+1, locked_at=NOW(), error_message=NULL, updated_at=NOW()
    WHERE id=?
  `, [job.id]);

  await conn.query("COMMIT");
  return job;
}

async function getProduct(conn, id) {
  const [rows] = await conn.query(`
    SELECT
      id,
      platform,
      platformProductId,
      name,
      vendor,
      category,
      keywords,
      description,
      affiliateLink,
      hiddenGemScore,
      scoreComponents,
      commissionRate,
      commissionType,
      saleCount,
      aggregateSales,
      cartValue,
      refundCount
    FROM products
    WHERE id=?
    LIMIT 1
  `, [id]);

  return rows[0] || null;
}

function queriesFor(p) {
  if (String(p.platform || "").toLowerCase() === "digistore24") {
    return queriesForDigistore24Consumer(p);
  }
  return [
    `"${p.name}" review`,
    `"${p.name}" complaints`,
    `"${p.name}" scam`,
    `"${p.name}" results`,
    `"${p.name}" before after`,
    `"${p.name}" reddit`,
    `"${p.name}" youtube review`,
    `"${p.name}" ClickBank review`,
    p.vendor ? `"${p.name}" "${p.vendor}" review` : "",
    p.category ? `"${p.name}" "${p.category}" review` : ""
  ].filter(Boolean);
}

function queriesForDigistore24Consumer(p) {
  return digistoreEvidenceQueries(p);
}

async function searxngSearch(query) {
  const url = new URL("/search", SEARXNG_BASE_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("language", "en");
  url.searchParams.set("safesearch", "1");

  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`SearXNG failed ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }

  const json = await res.json();
  const results = json.results || [];

  return results.map(r => ({
    source_type: "web",
    source_name: (() => {
      try {
        return new URL(r.url).hostname.replace(/^www\./, "");
      } catch {
        return r.engine || "searxng";
      }
    })(),
    title: r.title || "",
    url: r.url,
    snippet: r.content || r.description || "",
    raw_json: r
  }));
}

async function braveSearch(query) {
  if (!BRAVE_SEARCH_API_KEY) {
    throw new Error("BRAVE_SEARCH_API_KEY missing");
  }

  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", "10");
  url.searchParams.set("safesearch", "moderate");

  const res = await fetch(url, {
    headers: {
      "Accept": "application/json",
      "X-Subscription-Token": BRAVE_SEARCH_API_KEY
    }
  });

  if (!res.ok) {
    throw new Error(`Brave Search failed ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }

  const json = await res.json();

  return (json.web?.results || []).flatMap(r => {
    if (!r?.url) return [];
    let source_name;
    try {
      source_name = new URL(r.url).hostname.replace(/^www\./, "");
    } catch {
      source_name = "brave";
    }
    return [{
      source_type: "web",
      source_name,
      title: r.title || "",
      url: r.url,
      snippet: r.description || "",
      raw_json: r
    }];
  });
}

async function searchReviews(query) {
  if (REVIEW_ENRICHMENT_PROVIDER === "searxng") {
    return searxngSearch(query);
  }

  return braveSearch(query);
}

function scoreSource(product, source, vendorDomains = new Set()) {
  const hay = `${source.title} ${source.snippet} ${source.url}`.toLowerCase();
  const name = String(product.name || "").toLowerCase();
  const vendor = String(product.vendor || "").toLowerCase();
  const host = hostnameFromUrl(source.url);
  const classified = classifySourceHost(host);
  const isDigistore = String(product.platform || "").toLowerCase() === "digistore24";
  const nameMatched = productNameTokenMatch(hay, name);
  const isVendorDomain = vendorDomains.has(host);

  let relevance = 40;
  if (nameMatched) relevance += 35;
  else if (name && hay.includes(name)) relevance += 35;
  if (vendor && hay.includes(vendor)) relevance += 10;

  if (isDigistore) {
    if (isVendorDomain) relevance += 35;
    if (/official|how it works|what is|benefits|ingredients|faq|guarantee|refund/i.test(hay)) relevance += 15;
    if (/earn commission|\bepc\b|affiliates are seeing|promote now|marketplace analytics|dashboard marketplace/i.test(hay)) {
      relevance -= 35;
    }
    if (/affiliate|jvzoo|warriorplus|clickbank|promo link/i.test(hay)) relevance -= 20;
    if (classified.tier === "affiliate_noise") relevance -= 40;
    // Digistore-only / marketplace pages without product tokens are weak
    if (!nameMatched && !isVendorDomain && /digistore24/i.test(host || hay)) relevance -= 45;
    if (!nameMatched && !isVendorDomain) relevance -= 20;
  } else if (/review|reviews|worth|scam|complaint|reddit|youtube|before|after/i.test(hay)) {
    relevance += 15;
  }

  if (classified.tier === "video" && /review|honest|worth it|exposed|scam/i.test(hay)) {
    relevance += 12;
  }

  let trust = 45 + classified.trust_boost;
  if (isVendorDomain) trust += 25;
  if (/official|refund|ingredients|terms|guarantee/i.test(hay)) trust += 8;
  if (/affiliate|promo|bonus|jvzoo|warriorplus|\bepc\b|commission/i.test(hay)) trust -= 12;
  if (classified.tier === "affiliate_noise") trust = Math.min(trust, 20);

  let sentiment = "unknown";
  if (/scam|complaint|warning|refund|doesn't work|does not work|side effect/i.test(hay)) sentiment = "negative";
  else if (/best|works|benefit|positive|recommended|worth/i.test(hay)) sentiment = "positive";
  if (/mixed|pros and cons|honest|warning|red flag/i.test(hay)) sentiment = "mixed";

  const sourceType = source.source_type === "competitor_search"
    ? "competitor_search"
    : (isVendorDomain ? "vendor" : classified.source_type);

  return {
    relevance_score: Math.max(0, Math.min(100, relevance)),
    trust_score: Math.max(0, Math.min(100, trust)),
    sentiment,
    source_type: sourceType,
  };
}

function vendorDomainSet(materials) {
  const domains = new Set();
  for (const m of materials || []) {
    const domain = String(m.domain || "").toLowerCase().replace(/^www\./, "");
    const host = hostnameFromUrl(m.source_url);
    if (domain && !isMarketplaceHost(domain)) domains.add(domain);
    if (host && !isMarketplaceHost(host)) domains.add(host);
  }
  return domains;
}

function vendorMaterialSummary(materials) {
  const blocks = [];
  for (const m of materials || []) {
    const structured = m.structured_blocks || {};
    blocks.push({
      source_type: m.source_type,
      url: m.source_url,
      title: m.title,
      headline: structured.headline || "",
      core_promise: structured.core_promise || "",
      benefits: structured.benefits || [],
      problems: structured.problems || [],
      objections: structured.objections || [],
      testimonials: structured.testimonials || [],
      pricing: structured.pricing || [],
      excerpt: String(m.content_text || "").slice(0, 1500),
    });
  }
  return blocks;
}

async function saveSources(conn, product, sources, vendorDomains = new Set()) {
  const seen = new Set();
  const final = [];
  const [cachedRows] = await conn.query(`
    SELECT url, raw_json
    FROM product_review_sources
    WHERE product_id=?
  `, [product.id]);
  const cachedByUrl = new Map((cachedRows || []).map((row) => {
    let raw = row.raw_json || {};
    if (typeof raw === "string") {
      try { raw = JSON.parse(raw); } catch { raw = {}; }
    }
    return [row.url, raw];
  }));

  for (const s of sources) {
    if (!s.url || seen.has(s.url)) continue;
    seen.add(s.url);
    const cached = cachedByUrl.get(s.url) || {};
    final.push({
      ...s,
      raw_json: { ...s.raw_json, ...cached },
      ...scoreSource(product, s, vendorDomains),
    });
  }

  final.sort((a, b) => (b.relevance_score + b.trust_score) - (a.relevance_score + a.trust_score));
  const top = await enrichHighTrustSources(final.slice(0, MAX_SOURCES), {
    vendorDomains,
    limit: FULL_PAGE_SOURCE_LIMIT,
    timeoutMs: FULL_PAGE_FETCH_TIMEOUT_MS,
    delayMs: FULL_PAGE_FETCH_DELAY_MS,
    textLimit: 8000,
  });

  for (const s of top) {
    await conn.query(`
      INSERT INTO product_review_sources
      (product_id, source_type, source_name, title, url, snippet, relevance_score, trust_score, sentiment, raw_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON))
      ON DUPLICATE KEY UPDATE
        source_type=VALUES(source_type),
        source_name=VALUES(source_name),
        title=VALUES(title),
        snippet=VALUES(snippet),
        relevance_score=VALUES(relevance_score),
        trust_score=VALUES(trust_score),
        sentiment=VALUES(sentiment),
        raw_json=VALUES(raw_json),
        discovered_at=NOW()
    `, [
      product.id,
      s.source_type,
      s.source_name,
      clamp(s.title, 1000),
      s.url,
      clamp(s.snippet, 1000),
      s.relevance_score,
      s.trust_score,
      s.sentiment,
      JSON.stringify(s.raw_json || {})
    ]);
  }

  return top;
}

const CONTENT_STYLES = new Set([
  "honest_review",
  "elimination",
  "worth_it_or_waste",
  "budget_challenge",
  "vs_battle",
  "standard"
]);

const ANGLE_STYLE_PATTERNS = [
  {style: "worth_it_or_waste", patterns: [/worth it/i, /hype/i, /waste/i]},
  {style: "vs_battle", patterns: [/\bvs\b/i, /compare/i, /better than/i]},
  {style: "budget_challenge", patterns: [/budget/i, /under \$/i, /cheapest/i]},
  {style: "elimination", patterns: [/eliminate/i, /rejected/i, /skip these/i]},
  {style: "honest_review", patterns: [/honest/i, /pros and cons/i, /red flags/i]}
];

function parseScoreComponents(product) {
  if (!product?.scoreComponents) return {};
  if (typeof product.scoreComponents === "object") return product.scoreComponents;
  try {
    return JSON.parse(product.scoreComponents);
  } catch {
    return {};
  }
}

function inferContentStyleFromAngles(angles) {
  const text = (angles || []).join(" ");
  for (const {style, patterns} of ANGLE_STYLE_PATTERNS) {
    if (patterns.some(p => p.test(text))) return style;
  }
  return "honest_review";
}

function derivePriceDisplay(product) {
  const cart = Number(product.cartValue);
  if (Number.isFinite(cart) && cart > 0) return `$${cart.toFixed(2)}`;

  const components = parseScoreComponents(product);
  const meta = components._meta || components.meta || {};
  if (meta.price) return String(meta.price);
  if (meta.apv) return `$${Number(meta.apv).toFixed(2)} avg payout`;

  return String(product.platform || "").toLowerCase() === "digistore24"
    ? "See official offer page"
    : "Varies";
}

function finalizeBrief(product, brief, sources = [], options = {}) {
  const isDigistore = String(product.platform || "").toLowerCase() === "digistore24";
  const angles = (brief.best_video_angles || []).map(a => briefText(a)).filter(Boolean);
  const inferredStyle = inferContentStyleFromAngles(angles);
  let recommended_content_style = CONTENT_STYLES.has(brief.recommended_content_style)
    ? brief.recommended_content_style
    : inferredStyle;

  const competitorCandidates = options.competitorCandidates || [];
  const suggested_competitors = normalizeSuggestedCompetitors(
    product,
    brief.suggested_competitors,
    competitorCandidates,
  );

  if (
    suggested_competitors.length < 2
    && (recommended_content_style === "vs_battle" || recommended_content_style === "elimination")
  ) {
    recommended_content_style = isDigistore ? "worth_it_or_waste" : "honest_review";
  }

  const coverage = brief.evidence_coverage && typeof brief.evidence_coverage === "object"
    ? {
      ...evidenceCoverageFromSources(sources, {
        has_vendor_material: Boolean(options.hasVendorMaterial),
        resolved_product_name: product.name || "",
      }),
      ...brief.evidence_coverage,
      resolved_product_name: product.name || brief.evidence_coverage.resolved_product_name || "",
    }
    : evidenceCoverageFromSources(sources, {
      has_vendor_material: Boolean(options.hasVendorMaterial),
      resolved_product_name: product.name || "",
    });

  let confidence_score = Number(brief.confidence_score || 0) || Math.min(95, 50);
  if (options.identityUnresolved) {
    confidence_score = Math.min(confidence_score, 25);
    recommended_content_style = isDigistore ? "worth_it_or_waste" : "honest_review";
  } else if (!coverage.has_independent_review && !coverage.has_vendor_material) {
    confidence_score = Math.min(confidence_score, 40);
  } else if (!coverage.has_independent_review && isDigistore) {
    confidence_score = Math.min(confidence_score, 55);
  }

  const positive_signals = stripAffiliateMetaLines(
    (brief.positive_signals || []).map(x => briefText(x)).filter(Boolean),
  );
  const common_claims = stripAffiliateMetaLines(
    (brief.common_claims || []).map(x => briefText(x)).filter(Boolean),
  );
  const common_complaints = stripAffiliateMetaLines(
    (brief.common_complaints || []).map(x => briefText(x)).filter(Boolean),
  );

  return {
    ...brief,
    review_summary: briefText(brief.review_summary),
    positive_signals,
    negative_signals: stripAffiliateMetaLines(
      (brief.negative_signals || []).map(x => briefText(x)).filter(Boolean),
    ),
    common_claims,
    common_complaints,
    target_audience: briefText(brief.target_audience),
    who_it_may_help: briefText(brief.who_it_may_help),
    who_should_skip_it: briefText(brief.who_should_skip_it),
    best_video_angles: angles.length ? angles : ["What problem does this solve for buyers?", "What to verify before buying"],
    cta_guidance: briefText(brief.cta_guidance, "Check the official offer page for current price and refund terms."),
    recommended_content_style,
    suggested_competitors,
    price_display: sanitizeBuyerPrice(
      brief.price_display || derivePriceDisplay(product),
      product.cartValue,
    ),
    price_comparison: briefText(brief.price_comparison, `Compare the current ${derivePriceDisplay(product)} offer against 2-3 category alternatives before buying.`),
    series_name: seriesNameForStyle(recommended_content_style),
    coupon_code: briefText(brief.coupon_code, ""),
    evidence_coverage: coverage,
    confidence_score,
  };
}

function fallbackBrief(product, sources, vendorMaterials = [], options = {}) {
  const isDigistore = String(product.platform || "").toLowerCase() === "digistore24";
  if (isDigistore) return fallbackConsumerBrief(product, sources, vendorMaterials, options);

  const category = product.category || "this category";
  const positives = sources.filter(s => s.sentiment === "positive").slice(0, 5).map(s => s.title || s.snippet).filter(Boolean);
  const negatives = sources.filter(s => s.sentiment === "negative" || s.sentiment === "mixed").slice(0, 5).map(s => s.title || s.snippet).filter(Boolean);

  const base = {
    review_summary: `${product.name} has ${sources.length} discovered public review/search signals. Present this as a trust-first review and avoid unsupported claims.`,
    positive_signals: positives,
    negative_signals: negatives.length ? negatives : ["Some review sources may be affiliate-driven.", "Claims should be verified on the current offer page."],
    common_claims: [`Positioned as a ${category} product.`, "Viewers should verify current price, details, claims, and refund terms."],
    common_complaints: ["Results may vary.", "Public review quality may be mixed or promotional."],
    target_audience: `People researching ${product.name} or ${category} products before buying.`,
    who_it_may_help: `People comparing ${category} offers and wanting a quick evidence-based overview.`,
    who_should_skip_it: "People expecting guaranteed results or anyone who should consult a professional before using the product.",
    best_video_angles: ["Hidden gem or hype?", "What to verify before buying", "Pros, cons, and red flags"],
    cta_guidance: "Invite viewers to check the current product page and verify the details before buying.",
    confidence_score: Math.min(95, Math.max(35, 40 + sources.length * 3)),
    suggested_competitors: (options.competitorCandidates || []).map(c => c.name || c).slice(0, 4),
  };

  return finalizeBrief(product, base, sources, options);
}

function fallbackConsumerBrief(product, sources, vendorMaterials, options = {}) {
  const category = product.category || "this product category";
  const summary = vendorMaterialSummary(vendorMaterials);
  const primary = summary[0] || {};
  const benefits = stripAffiliateMetaLines(summary.flatMap(s => s.benefits || []).slice(0, 6));
  const problems = summary.flatMap(s => s.problems || []).slice(0, 4);
  const objections = stripAffiliateMetaLines(summary.flatMap(s => s.objections || []).slice(0, 4));
  const { reviewSources = [] } = options;
  const independent = reviewSources.length
    ? reviewSources
    : sources.filter(s => s.source_type !== "vendor");
  const riskSignals = stripAffiliateMetaLines(
    independent
      .filter(s => s.sentiment === "negative" || s.sentiment === "mixed")
      .slice(0, 4)
      .map(s => s.title || s.snippet)
      .filter(Boolean),
  );
  const pricing = summary.flatMap(s => s.pricing || []).slice(0, 2);

  const base = {
    review_summary: primary.core_promise
      || primary.headline
      || `${product.name} is positioned for everyday buyers in ${category}. Use vendor sales copy as the primary source and treat third-party claims as secondary.`,
    positive_signals: [],
    negative_signals: riskSignals.length
      ? riskSignals
      : ["Verify refund terms and current pricing on the official offer page."],
    common_claims: benefits.length
      ? benefits
      : [`Vendor copy presents ${product.name} as a solution in ${category}.`],
    common_complaints: riskSignals.length
      ? riskSignals
      : objections.length
        ? objections
        : ["Results may vary between customers.", "Some marketing claims should be verified before purchase."],
    target_audience: problems[0]
      ? `Everyday consumers dealing with: ${problems[0]}`
      : `Everyday consumers interested in ${category} who want a clear buyer-focused overview before purchasing.`,
    who_it_may_help: benefits[0]
      ? `Buyers who want ${benefits[0].toLowerCase()}`
      : `People comparing ${category} options and trying to understand what this product actually delivers.`,
    who_should_skip_it: "Anyone expecting guaranteed outcomes, anyone who should consult a professional first, or buyers who cannot verify the current offer details.",
    best_video_angles: [
      "What problem does this actually solve for buyers?",
      "What the vendor promises vs what to verify",
      "Who should buy and who should skip",
    ],
    cta_guidance: "Tell viewers to check the official product page for current price, refund policy, and offer details before buying.",
    confidence_score: Math.min(95, Math.max(40, 50 + summary.length * 8 + independent.length * 2)),
    price_display: pricing[0] || derivePriceDisplay(product),
    suggested_competitors: (options.competitorCandidates || []).map(c => c.name || c).slice(0, 4),
  };

  return finalizeBrief(product, base, sources, {
    ...options,
    hasVendorMaterial: summary.length > 0,
  });
}

async function summarizeWithOllama(product, sources, vendorMaterials = [], options = {}) {
  const fallback = fallbackBrief(product, sources, vendorMaterials, options);
  const isDigistore = String(product.platform || "").toLowerCase() === "digistore24";
  if (!isDigistore && !sources.length) return { brief: fallback, degraded: true };
  if (isDigistore && !sources.length && !vendorMaterials.length) return { brief: fallback, degraded: true };
  if (options.identityUnresolved) return { brief: fallback, degraded: true };

  const prompt = buildEnrichmentPrompt(isDigistore, product, sources, vendorMaterials, options);

  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        model: LLM_MODEL,
        stream: false,
        format: "json",
        messages: [
          {role: "system", content: "Return strict JSON only."},
          {role: "user", content: prompt}
        ]
      })
    });

    if (!res.ok) throw new Error(`Ollama failed ${res.status}: ${await res.text()}`);
    const json = await res.json();
    let rawBrief;
    try {
      rawBrief = JSON.parse(json.message?.content || "{}");
    } catch (parseErr) {
      console.error("Ollama JSON parse failed; using fallback:", parseErr.message);
      return { brief: fallback, degraded: true };
    }

    const validated = parseAndValidateLlmBrief(rawBrief, isDigistore);
    if (!validated) {
      return { brief: fallback, degraded: true };
    }

    const finalized = finalizeBrief(product, {...fallback, ...validated}, sources, options);
    const coverage = finalized.evidence_coverage || {};
    const weakEvidence = !coverage.has_independent_review && !coverage.has_vendor_material;
    return {
      brief: finalized,
      degraded: weakEvidence || options.identityUnresolved,
    };
  } catch (err) {
    console.error("Ollama summary failed; using fallback:", err.message);
    return { brief: fallback, degraded: true };
  }
}

function validateBriefShape(brief) {
  if (!brief || typeof brief !== "object") return false;
  if (!String(brief.review_summary || "").trim()) return false;
  if (!Array.isArray(brief.best_video_angles) || brief.best_video_angles.length === 0) return false;
  return true;
}

async function saveBrief(conn, product, brief, sourceCount, enrichmentStatus = "complete") {
  if (!validateBriefShape(brief)) {
    throw new Error(`Brief validation failed for product ${product.id}`);
  }
  await conn.query(`
    INSERT INTO product_review_briefs
    (product_id, enrichment_status, review_summary, positive_signals, negative_signals,
     common_claims, common_complaints, target_audience, who_it_may_help, who_should_skip_it,
     best_video_angles, cta_guidance, recommended_content_style, suggested_competitors, price_display, price_comparison,
     series_name, coupon_code, evidence_coverage,
     source_count, confidence_score, generated_at)
    VALUES (?, ?, ?, CAST(? AS JSON), CAST(? AS JSON), CAST(? AS JSON), CAST(? AS JSON),
            ?, ?, ?, CAST(? AS JSON), ?, ?, CAST(? AS JSON), ?, ?, ?, ?, CAST(? AS JSON), ?, ?, NOW())
    ON DUPLICATE KEY UPDATE
      enrichment_status=VALUES(enrichment_status),
      review_summary=VALUES(review_summary),
      positive_signals=VALUES(positive_signals),
      negative_signals=VALUES(negative_signals),
      common_claims=VALUES(common_claims),
      common_complaints=VALUES(common_complaints),
      target_audience=VALUES(target_audience),
      who_it_may_help=VALUES(who_it_may_help),
      who_should_skip_it=VALUES(who_should_skip_it),
      best_video_angles=VALUES(best_video_angles),
      cta_guidance=VALUES(cta_guidance),
      recommended_content_style=VALUES(recommended_content_style),
      suggested_competitors=VALUES(suggested_competitors),
      price_display=VALUES(price_display),
      price_comparison=VALUES(price_comparison),
      series_name=VALUES(series_name),
      coupon_code=VALUES(coupon_code),
      evidence_coverage=VALUES(evidence_coverage),
      source_count=VALUES(source_count),
      confidence_score=VALUES(confidence_score),
      generated_at=NOW(),
      error_message=NULL,
      updated_at=NOW()
  `, [
    product.id,
    enrichmentStatus,
    clamp(brief.review_summary, 4000),
    JSON.stringify(brief.positive_signals || []),
    JSON.stringify(brief.negative_signals || []),
    JSON.stringify(brief.common_claims || []),
    JSON.stringify(brief.common_complaints || []),
    clamp(brief.target_audience, 2000),
    clamp(brief.who_it_may_help, 2000),
    clamp(brief.who_should_skip_it, 2000),
    JSON.stringify(brief.best_video_angles || []),
    clamp(brief.cta_guidance, 2000),
    clamp(brief.recommended_content_style, 64),
    JSON.stringify(brief.suggested_competitors || []),
    clamp(brief.price_display, 200),
    clamp(brief.price_comparison, 2000),
    clamp(brief.series_name, 255),
    clamp(brief.coupon_code, 255),
    JSON.stringify(brief.evidence_coverage || {}),
    sourceCount,
    Number(brief.confidence_score || Math.min(95, 40 + sourceCount * 3))
  ]);
}

async function rescoreProductAfterEnrichment(conn, product, sourceCount, confidenceScore, vendorTrustScore = null) {
  const [linkRows] = await conn.query(`
    SELECT affiliate_url, status
    FROM product_affiliate_links
    WHERE product_id=? AND provider=?
    ORDER BY
      CASE
        WHEN status='approved' THEN 0
        WHEN status='generated' THEN 1
        ELSE 2
      END,
      updated_at DESC,
      id DESC
    LIMIT 1
  `, [product.id, product.platform || "digistore24"]);

  const affiliate_url = linkRows?.[0]?.affiliate_url || "";
  const link_status = linkRows?.[0]?.status || "";

  const scored = scoreProduct({
    ...product,
    affiliateLink: product.affiliateLink || affiliate_url || "",
    source_count: Number(sourceCount || 0),
    confidence_score: Number(confidenceScore || 0),
    vendor_trust_score: vendorTrustScore,
    link_status,
    generated_affiliate_url: affiliate_url,
  });

  const scoreComponents = {
    ...scored.components,
    _meta: {
      scoring_version: SCORING_VERSION,
      marketplace: scored.marketplace,
      strategy: scored.strategy,
      ...scored.meta,
    },
  };

  await conn.query(`
    UPDATE products
    SET hiddenGemScore=?, scoreComponents=?, lastUpdatedAt=NOW()
    WHERE id=?
  `, [scored.score, JSON.stringify(scoreComponents), product.id]);
}

async function markPendingApiKey(conn, job, product) {
  await conn.query(`
    INSERT INTO product_review_briefs
    (product_id, enrichment_status, error_message, source_count, updated_at)
    VALUES (?, 'pending_api_key', 'BRAVE_SEARCH_API_KEY missing', 0, NOW())
    ON DUPLICATE KEY UPDATE enrichment_status='pending_api_key', error_message='BRAVE_SEARCH_API_KEY missing', updated_at=NOW()
  `, [product.id]);

  await conn.query(`
    UPDATE review_enrichment_jobs
    SET status='pending_api_key', error_message='BRAVE_SEARCH_API_KEY missing',
        next_run_at=DATE_ADD(NOW(), INTERVAL 1 DAY), updated_at=NOW()
    WHERE id=?
  `, [job.id]);
}

async function processJob(conn, job) {
  const product = await getProduct(conn, job.product_id);
  if (!product || !product.name) throw new Error(`Product ${job.product_id} missing or has no name.`);

  if (REVIEW_ENRICHMENT_PROVIDER !== "searxng" && !BRAVE_SEARCH_API_KEY) {
    await markPendingApiKey(conn, job, product);
    console.log(`[${product.name}] pending_api_key`);
    return;
  }

  const isDigistore = String(product.platform || "").toLowerCase() === "digistore24";
  let vendorMaterials = [];
  if (isDigistore) {
    await ensureVendorMaterialsTable(conn);
    vendorMaterials = await loadVendorMaterials(conn, product.id);
  }

  const resolvedName = isDigistore
    ? resolveExportProductName(product, vendorMaterials)
    : product.name;
  const enrichProduct = { ...product, name: resolvedName };
  if (String(product.name || "") !== String(resolvedName || "")) {
    console.log(`[${product.id}] ${product.name} → ${resolvedName}`);
  }

  const identityUnresolved = isDigistore && (
    isMarketplaceBrandName(resolvedName)
    || /^Digistore24 Product\b/i.test(String(resolvedName || ""))
  );
  if (identityUnresolved) {
    console.warn(`[${product.id}] unresolved marketplace brand name after vendor materials; degrading brief`);
  }

  const collected = [];
  const evidenceQueries = queriesFor(enrichProduct);
  const secondaryQueryLimit = isDigistore ? digistoreEvidenceQueries(enrichProduct).length : evidenceQueries.length;

  for (const q of evidenceQueries.slice(0, secondaryQueryLimit)) {
    console.log(`[${enrichProduct.name}] ${q}`);
    collected.push(...await searchReviews(q));
  }

  const competitorHits = [];
  for (const q of competitorEvidenceQueries(enrichProduct)) {
    console.log(`[${enrichProduct.name}] competitor: ${q}`);
    const hits = await searchReviews(q);
    for (const hit of hits) {
      competitorHits.push({
        ...hit,
        source_type: "competitor_search",
        raw_json: { ...(hit.raw_json || {}), competitor_search: true },
      });
    }
  }
  collected.push(...competitorHits);

  const vendorDomains = vendorDomainSet(vendorMaterials);
  const sources = await saveSources(conn, enrichProduct, collected, vendorDomains);
  let vendorProfile = null;
  const creatorVendor = isDigistore
    ? resolveCreatorVendor(product.vendor, vendorMaterials)
    : String(product.vendor || "").trim();
  if (isDigistore && creatorVendor) {
    const vendorHits = [];
    for (const q of digistoreVendorQueries(creatorVendor)) {
      console.log(`[${enrichProduct.name}] vendor: ${q}`);
      vendorHits.push(...await searchReviews(q));
    }
    vendorProfile = await upsertVendorProfile(conn, {
      platform: product.platform,
      vendorName: creatorVendor,
      hits: vendorHits,
    });
  }

  let catalogMatches = [];
  try {
    const [rows] = await conn.query(`
      SELECT name
      FROM products
      WHERE id <> ?
        AND name IS NOT NULL
        AND name <> ''
        AND (
          platform = ?
          OR (category IS NOT NULL AND category <> '' AND category = ?)
        )
      ORDER BY lastUpdatedAt DESC
      LIMIT 25
    `, [product.id, product.platform || "digistore24", product.category || ""]);
    catalogMatches = rows || [];
  } catch {
    catalogMatches = [];
  }

  const competitorCandidates = extractCompetitorCandidatesFromHits(
    [...competitorHits, ...sources],
    enrichProduct,
    { vendorMaterials, catalogMatches, vendor: creatorVendor || product.vendor },
  );

  const { claimSources, reviewSources } = splitClaimAndReviewSources(sources, vendorDomains);
  const enrichOptions = {
    competitorCandidates,
    claimSources,
    reviewSources,
    hasVendorMaterial: vendorMaterials.length > 0,
    identityUnresolved,
  };

  const { brief, degraded } = await summarizeWithOllama(
    enrichProduct,
    sources,
    vendorMaterials,
    enrichOptions,
  );
  const coverage = brief.evidence_coverage || {};
  const forceDegraded = identityUnresolved
    || degraded
    || (!coverage.has_independent_review && !coverage.has_vendor_material);
  const enrichmentStatus = forceDegraded ? "complete_degraded" : "complete";
  await saveBrief(conn, enrichProduct, brief, sources.length + vendorMaterials.length, enrichmentStatus);
  await rescoreProductAfterEnrichment(
    conn, enrichProduct, sources.length + vendorMaterials.length, Number(brief.confidence_score || 0),
    vendorProfile?.vendor_trust_score ?? null
  );

  await conn.query(`
    UPDATE review_enrichment_jobs
    SET status='complete', error_message=NULL,
        next_run_at=DATE_ADD(NOW(), INTERVAL ? DAY), updated_at=NOW()
    WHERE id=?
  `, [REFRESH_DAYS, job.id]);

  console.log(`[${enrichProduct.name}] ${enrichmentStatus}: ${sources.length} web sources, ${vendorMaterials.length} vendor materials, ${competitorCandidates.length} competitor candidates`);
}

async function main() {
  console.log(`Review enrichment provider: ${REVIEW_ENRICHMENT_PROVIDER}`);
  console.log(`SearXNG base URL: ${SEARXNG_BASE_URL}`);
  try {
    const searxPort = new URL(SEARXNG_BASE_URL).port || "80";
    if (searxPort !== "8088") {
      console.warn(`WARNING: SearXNG must use host port 8088 (got ${SEARXNG_BASE_URL})`);
    }
  } catch {
    console.warn(`WARNING: invalid SEARXNG_BASE_URL: ${SEARXNG_BASE_URL}`);
  }

  const conn = await mysql.createConnection(DATABASE_URL);

  try {
    await ensureReviewBriefSchema(conn);
    await ensureVendorMaterialsTable(conn);
    await ensureVendorProfilesTable(conn);

    const reapedRunning = await reapStaleRunningJobs(conn);
    if (reapedRunning) {
      console.log(`Requeued ${reapedRunning} stale running review jobs`);
    }
    const reapedExhausted = await reapExhaustedJobs(conn);
    if (reapedExhausted) {
      console.log(`Requeued ${reapedExhausted} exhausted review jobs`);
    }

    if (!CLAIM_PRODUCT_ID) {
      await enqueueMissingProducts(conn);
    }

    while (true) {
      const job = await claimJob(conn);

      if (!job) {
        console.log("No queued review enrichment jobs.");
        return;
      }

      try {
        await processJob(conn, job);
      } catch (err) {
        console.error(`Job ${job.id} failed:`, err.message);

        await conn.query(`
          UPDATE review_enrichment_jobs
          SET status='failed', error_message=?, next_run_at=DATE_ADD(NOW(), INTERVAL 1 HOUR), updated_at=NOW()
          WHERE id=?
        `, [String(err.message).slice(0, 2000), job.id]);
      }

      if (ONCE) return;
    }
  } finally {
    await conn.end();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
