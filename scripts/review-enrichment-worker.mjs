#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import mysql from "mysql2/promise";
import { SCORING_VERSION, scoreProduct } from "./marketplace-scoring.mjs";
import {
  ensureVendorMaterialsTable,
  loadVendorMaterials,
  hostnameFromUrl,
} from "./digistore24-vendor-materials.mjs";

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
  return sql.replace(/NaN/g, "NULL");
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
const DATABASE_URL = process.env.DATABASE_URL;
const REVIEW_ENRICHMENT_PROVIDER = process.env.REVIEW_ENRICHMENT_PROVIDER || "searxng";
const SEARXNG_BASE_URL = process.env.SEARXNG_BASE_URL || "http://localhost:8088";
const BRAVE_SEARCH_API_KEY = process.env.BRAVE_SEARCH_API_KEY || "";
const MAX_SOURCES = Number(process.env.REVIEW_ENRICHMENT_MAX_SOURCES || "25");
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

const REVIEW_BRIEF_COLUMNS = [
  { name: "recommended_content_style", ddl: "ADD COLUMN recommended_content_style TEXT NULL AFTER cta_guidance" },
  { name: "suggested_competitors", ddl: "ADD COLUMN suggested_competitors JSON NULL AFTER recommended_content_style" },
  { name: "price_display", ddl: "ADD COLUMN price_display TEXT NULL AFTER suggested_competitors" },
];

async function ensureReviewBriefSchema(conn) {
  const [rows] = await conn.query(`
    SELECT COLUMN_NAME
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_review_briefs'
  `);
  const existing = new Set(rows.map(r => r.COLUMN_NAME));

  for (const col of REVIEW_BRIEF_COLUMNS) {
    if (existing.has(col.name)) continue;
    await conn.query(`ALTER TABLE product_review_briefs ${col.ddl}`);
    console.log(`Applied schema patch: product_review_briefs.${col.name}`);
    existing.add(col.name);
  }

  if (!REVIEW_BRIEF_COLUMNS.every(col => existing.has(col.name))) return;

  const [result] = await conn.query(`
    UPDATE review_enrichment_jobs
    SET status='queued', next_run_at=NOW(), error_message=NULL, updated_at=NOW()
    WHERE status='failed'
      AND error_message LIKE '%recommended_content_style%'
  `);
  if (result.affectedRows) {
    console.log(`Requeued ${result.affectedRows} failed review jobs after schema check`);
  }
}

async function enqueueMissingProducts(conn) {
  await conn.query(`
    INSERT INTO review_enrichment_jobs (product_id, status, next_run_at)
    SELECT id, 'queued', NOW()
    FROM products
    ON DUPLICATE KEY UPDATE updated_at = updated_at
  `);

  if (REVIEW_ENRICHMENT_PROVIDER === "searxng" || BRAVE_SEARCH_API_KEY) {
    await conn.query(`
      UPDATE review_enrichment_jobs
      SET status='queued', next_run_at=NOW(), error_message=NULL, updated_at=NOW()
      WHERE status='pending_api_key'
    `);
  }
}

async function claimJob(conn) {
  await conn.query("START TRANSACTION");

  const [rows] = await conn.query(`
    SELECT id, product_id
    FROM review_enrichment_jobs
    WHERE status IN ('queued','failed','pending_api_key')
      AND next_run_at <= NOW()
      AND attempts < 10
    ORDER BY next_run_at ASC, id ASC
    LIMIT 1
    FOR UPDATE
  `);

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
  const category = p.category || "";
  return [
    `"${p.name}" official site`,
    `"${p.name}" what is it`,
    `"${p.name}" how it works`,
    `"${p.name}" price`,
    `"${p.name}" refund policy`,
    `"${p.name}" complaints`,
    `"${p.name}" scam`,
    category ? `"${p.name}" "${category}" benefits` : "",
    p.vendor ? `"${p.name}" "${p.vendor}" product` : "",
  ].filter(Boolean);
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

  return (json.web?.results || []).map(r => ({
    source_type: "web",
    source_name: new URL(r.url).hostname.replace(/^www\./, ""),
    title: r.title || "",
    url: r.url,
    snippet: r.description || "",
    raw_json: r
  }));
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
  const isDigistore = String(product.platform || "").toLowerCase() === "digistore24";

  let relevance = 40;
  if (name && hay.includes(name)) relevance += 35;
  if (vendor && hay.includes(vendor)) relevance += 10;
  if (isDigistore) {
    if (vendorDomains.has(host)) relevance += 35;
    if (/official|how it works|what is|benefits|ingredients|faq|guarantee|refund/i.test(hay)) relevance += 15;
    if (/affiliate|jvzoo|warriorplus|clickbank|promo link|earn commission/i.test(hay)) relevance -= 20;
  } else if (/review|reviews|worth|scam|complaint|reddit|youtube|before|after/i.test(hay)) {
    relevance += 15;
  }

  let trust = 45;
  if (/reddit\.com|youtube\.com|youtu\.be|trustpilot\.com|bbb\.org/i.test(source.url)) trust += 20;
  if (vendorDomains.has(host)) trust += 25;
  if (/official|refund|ingredients|terms|guarantee/i.test(hay)) trust += 8;
  if (/affiliate|promo|bonus|jvzoo|warriorplus/i.test(hay)) trust -= 12;

  let sentiment = "unknown";
  if (/scam|complaint|warning|refund|doesn't work|does not work|side effect/i.test(hay)) sentiment = "negative";
  else if (/best|works|benefit|positive|recommended|worth/i.test(hay)) sentiment = "positive";
  if (/mixed|pros and cons|honest|warning|red flag/i.test(hay)) sentiment = "mixed";

  return {
    relevance_score: Math.max(0, Math.min(100, relevance)),
    trust_score: Math.max(0, Math.min(100, trust)),
    sentiment
  };
}

function vendorDomainSet(materials) {
  const domains = new Set();
  for (const m of materials || []) {
    if (m.domain) domains.add(String(m.domain).toLowerCase());
    const host = hostnameFromUrl(m.source_url);
    if (host) domains.add(host);
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

  for (const s of sources) {
    if (!s.url || seen.has(s.url)) continue;
    seen.add(s.url);
    final.push({...s, ...scoreSource(product, s, vendorDomains)});
  }

  final.sort((a, b) => (b.relevance_score + b.trust_score) - (a.relevance_score + a.trust_score));
  const top = final.slice(0, MAX_SOURCES);

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

  return "Varies";
}

function fallbackSuggestedCompetitors(product) {
  const category = String(product.category || "niche").trim() || "niche";
  return [
    `Top ${category} alternative`,
    `Popular ${category} competitor`,
    `Budget ${category} option`
  ];
}

function normalizeSuggestedCompetitors(product, competitors) {
  const vendor = String(product.vendor || "").trim().toLowerCase();
  const cleaned = (Array.isArray(competitors) ? competitors : [])
    .map(c => String(c || "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .filter(c => !vendor || c.toLowerCase() !== vendor);

  return (cleaned.length >= 2 ? cleaned : fallbackSuggestedCompetitors(product)).slice(0, 4);
}

function finalizeBrief(product, brief) {
  const angles = (brief.best_video_angles || []).map(a => briefText(a)).filter(Boolean);
  const inferredStyle = inferContentStyleFromAngles(angles);
  const recommended_content_style = CONTENT_STYLES.has(brief.recommended_content_style)
    ? brief.recommended_content_style
    : inferredStyle;

  return {
    ...brief,
    review_summary: briefText(brief.review_summary),
    positive_signals: (brief.positive_signals || []).map(x => briefText(x)).filter(Boolean),
    negative_signals: (brief.negative_signals || []).map(x => briefText(x)).filter(Boolean),
    common_claims: (brief.common_claims || []).map(x => briefText(x)).filter(Boolean),
    common_complaints: (brief.common_complaints || []).map(x => briefText(x)).filter(Boolean),
    target_audience: briefText(brief.target_audience),
    who_it_may_help: briefText(brief.who_it_may_help),
    who_should_skip_it: briefText(brief.who_should_skip_it),
    best_video_angles: angles.length ? angles : ["What problem does this solve for buyers?", "What to verify before buying"],
    cta_guidance: briefText(brief.cta_guidance, "Check the official offer page for current price and refund terms."),
    recommended_content_style,
    suggested_competitors: normalizeSuggestedCompetitors(product, brief.suggested_competitors),
    price_display: clamp(brief.price_display || derivePriceDisplay(product), 200),
    confidence_score: Number(brief.confidence_score || 0) || Math.min(95, 50),
  };
}

function fallbackBrief(product, sources, vendorMaterials = []) {
  const isDigistore = String(product.platform || "").toLowerCase() === "digistore24";
  if (isDigistore) return fallbackConsumerBrief(product, sources, vendorMaterials);

  const category = product.category || "this category";
  const positives = sources.filter(s => s.sentiment === "positive").slice(0, 5).map(s => s.title || s.snippet).filter(Boolean);
  const negatives = sources.filter(s => s.sentiment === "negative" || s.sentiment === "mixed").slice(0, 5).map(s => s.title || s.snippet).filter(Boolean);

  const base = {
    review_summary: `${product.name} has ${sources.length} discovered public review/search signals. Present this as a trust-first review and avoid unsupported claims.`,
    positive_signals: positives.length ? positives : ["Public sources mention the product by name.", "APF marketplace data suggests the product is worth reviewing."],
    negative_signals: negatives.length ? negatives : ["Some review sources may be affiliate-driven.", "Claims should be verified on the current offer page."],
    common_claims: [`Positioned as a ${category} product.`, "Viewers should verify current price, details, claims, and refund terms."],
    common_complaints: ["Results may vary.", "Public review quality may be mixed or promotional."],
    target_audience: `People researching ${product.name} or ${category} products before buying.`,
    who_it_may_help: `People comparing ${category} offers and wanting a quick evidence-based overview.`,
    who_should_skip_it: "People expecting guaranteed results or anyone who should consult a professional before using the product.",
    best_video_angles: ["Hidden gem or hype?", "What to verify before buying", "Pros, cons, and red flags"],
    cta_guidance: "Invite viewers to check the current product page and verify the details before buying.",
    confidence_score: Math.min(95, Math.max(35, 40 + sources.length * 3))
  };

  return finalizeBrief(product, base);
}

function fallbackConsumerBrief(product, sources, vendorMaterials) {
  const category = product.category || "this product category";
  const summary = vendorMaterialSummary(vendorMaterials);
  const primary = summary[0] || {};
  const benefits = summary.flatMap(s => s.benefits || []).slice(0, 6);
  const problems = summary.flatMap(s => s.problems || []).slice(0, 4);
  const objections = summary.flatMap(s => s.objections || []).slice(0, 4);
  const testimonials = summary.flatMap(s => s.testimonials || []).slice(0, 4);
  const pricing = summary.flatMap(s => s.pricing || []).slice(0, 2);
  const riskSignals = sources
    .filter(s => s.sentiment === "negative" || s.sentiment === "mixed")
    .slice(0, 4)
    .map(s => s.title || s.snippet)
    .filter(Boolean);

  const base = {
    review_summary: primary.core_promise
      || primary.headline
      || `${product.name} is positioned for everyday buyers in ${category}. Use vendor sales copy as the primary source and treat third-party claims as secondary.`,
    positive_signals: testimonials.length
      ? testimonials
      : benefits.length
        ? benefits
        : [`Vendor materials highlight benefits for ${category} buyers.`],
    negative_signals: riskSignals.length
      ? riskSignals
      : ["Verify refund terms and current pricing on the official offer page."],
    common_claims: benefits.length
      ? benefits
      : [`Vendor copy presents ${product.name} as a solution in ${category}.`],
    common_complaints: objections.length
      ? objections
      : riskSignals.length
        ? riskSignals
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
    confidence_score: Math.min(95, Math.max(40, 50 + summary.length * 8 + sources.length * 2)),
    price_display: pricing[0] || derivePriceDisplay(product),
  };

  return finalizeBrief(product, base);
}

async function summarizeWithOllama(product, sources, vendorMaterials = []) {
  const fallback = fallbackBrief(product, sources, vendorMaterials);
  const isDigistore = String(product.platform || "").toLowerCase() === "digistore24";
  if (!isDigistore && !sources.length) return fallback;
  if (isDigistore && !sources.length && !vendorMaterials.length) return fallback;

  const prompt = isDigistore
    ? `Create a buyer-facing consumer product brief as strict JSON for a video aimed at regular customers, NOT affiliate marketers.

Product (affiliate/commission language in the name or description should be ignored):
${JSON.stringify(consumerProductContext(product), null, 2)}

Primary vendor sales materials (highest priority):
${JSON.stringify(vendorMaterialSummary(vendorMaterials), null, 2)}

Secondary public sources (validation / risk only):
${JSON.stringify(sources.slice(0, 12).map(s => ({
    title: s.title,
    url: s.url,
    snippet: s.snippet,
    relevance_score: s.relevance_score,
    trust_score: s.trust_score,
    sentiment: s.sentiment
  })), null, 2)}

Rules:
- Write for end consumers considering a purchase, not for affiliates promoting the product.
- Prioritize vendor-hosted sales copy for benefits, mechanism, deliverables, pricing language, guarantees, and objections.
- Use third-party sources only to validate risks, complaints, or contradictions.
- Do not invent facts.
- Avoid affiliate-marketer language like "promote", "commission", "JV", or "hidden gem".
- Return only JSON with:
review_summary, positive_signals, negative_signals, common_claims, common_complaints, target_audience, who_it_may_help, who_should_skip_it, best_video_angles, cta_guidance, confidence_score, recommended_content_style, suggested_competitors, price_display
- recommended_content_style must be one of: honest_review, elimination, worth_it_or_waste, budget_challenge, vs_battle, standard
- suggested_competitors must be a JSON array of 2-4 real consumer alternatives in the same category (never the vendor name)
- price_display must describe what a buyer would pay, not affiliate payouts`
    : `Create a cautious affiliate product review brief as strict JSON.

Product:
${JSON.stringify(product, null, 2)}

Sources:
${JSON.stringify(sources.map(s => ({
    title: s.title,
    url: s.url,
    snippet: s.snippet,
    relevance_score: s.relevance_score,
    trust_score: s.trust_score,
    sentiment: s.sentiment
  })), null, 2)}

Rules:
- Do not invent facts.
- Use "sources suggest" or "product claims" when evidence is weak.
- Avoid medical, financial, or guaranteed-result claims.
- Return only JSON with:
review_summary, positive_signals, negative_signals, common_claims, common_complaints, target_audience, who_it_may_help, who_should_skip_it, best_video_angles, cta_guidance, confidence_score, recommended_content_style, suggested_competitors, price_display
- recommended_content_style must be one of: honest_review, elimination, worth_it_or_waste, budget_challenge, vs_battle, standard
- suggested_competitors must be a JSON array of 2-4 category-appropriate product or offer names (never the vendor name)
- price_display must be a short human-readable price string; use APV/aggregateSales when no retail price is known, otherwise "Varies"`;

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
    return finalizeBrief(product, {...fallback, ...JSON.parse(json.message?.content || "{}")});
  } catch (err) {
    console.error("Ollama summary failed; using fallback:", err.message);
    return fallback;
  }
}

async function saveBrief(conn, product, brief, sourceCount) {
  await conn.query(`
    INSERT INTO product_review_briefs
    (product_id, enrichment_status, review_summary, positive_signals, negative_signals,
     common_claims, common_complaints, target_audience, who_it_may_help, who_should_skip_it,
     best_video_angles, cta_guidance, recommended_content_style, suggested_competitors, price_display,
     source_count, confidence_score, generated_at)
    VALUES (?, 'complete', ?, CAST(? AS JSON), CAST(? AS JSON), CAST(? AS JSON), CAST(? AS JSON),
            ?, ?, ?, CAST(? AS JSON), ?, ?, CAST(? AS JSON), ?, ?, ?, NOW())
    ON DUPLICATE KEY UPDATE
      enrichment_status='complete',
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
      source_count=VALUES(source_count),
      confidence_score=VALUES(confidence_score),
      generated_at=NOW(),
      error_message=NULL,
      updated_at=NOW()
  `, [
    product.id,
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
    sourceCount,
    Number(brief.confidence_score || Math.min(95, 40 + sourceCount * 3))
  ]);
}

async function rescoreProductAfterEnrichment(conn, product, sourceCount, confidenceScore) {
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

  const collected = [];
  const secondaryQueryLimit = isDigistore ? 5 : queriesFor(product).length;

  for (const q of queriesFor(product).slice(0, secondaryQueryLimit)) {
    console.log(`[${product.name}] ${q}`);
    collected.push(...await searchReviews(q));
  }

  const vendorDomains = vendorDomainSet(vendorMaterials);
  const sources = await saveSources(conn, product, collected, vendorDomains);
  const brief = await summarizeWithOllama(product, sources, vendorMaterials);
  await saveBrief(conn, product, brief, sources.length + vendorMaterials.length);
  await rescoreProductAfterEnrichment(conn, product, sources.length + vendorMaterials.length, Number(brief.confidence_score || 0));

  await conn.query(`
    UPDATE review_enrichment_jobs
    SET status='complete', error_message=NULL,
        next_run_at=DATE_ADD(NOW(), INTERVAL ? DAY), updated_at=NOW()
    WHERE id=?
  `, [REFRESH_DAYS, job.id]);

  console.log(`[${product.name}] complete: ${sources.length} web sources, ${vendorMaterials.length} vendor materials`);
}

async function main() {
  console.log(`Review enrichment provider: ${REVIEW_ENRICHMENT_PROVIDER}`);
  console.log(`SearXNG base URL: ${SEARXNG_BASE_URL}`);

  const conn = await mysql.createConnection(DATABASE_URL);

  try {
    await ensureReviewBriefSchema(conn);
    await ensureVendorMaterialsTable(conn);
    await enqueueMissingProducts(conn);

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
