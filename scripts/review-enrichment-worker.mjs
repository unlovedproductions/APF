#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import mysql from "mysql2/promise";

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
      refundCount
    FROM products
    WHERE id=?
    LIMIT 1
  `, [id]);

  return rows[0] || null;
}

function queriesFor(p) {
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

function scoreSource(product, source) {
  const hay = `${source.title} ${source.snippet} ${source.url}`.toLowerCase();
  const name = String(product.name || "").toLowerCase();
  const vendor = String(product.vendor || "").toLowerCase();

  let relevance = 40;
  if (name && hay.includes(name)) relevance += 35;
  if (vendor && hay.includes(vendor)) relevance += 10;
  if (/review|reviews|worth|scam|complaint|reddit|youtube|before|after/i.test(hay)) relevance += 15;

  let trust = 45;
  if (/reddit\.com|youtube\.com|youtu\.be|trustpilot\.com|bbb\.org/i.test(source.url)) trust += 20;
  if (/official|clickbank|refund|ingredients|terms/i.test(hay)) trust += 8;
  if (/affiliate|promo|bonus/i.test(hay)) trust -= 8;

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

async function saveSources(conn, product, sources) {
  const seen = new Set();
  const final = [];

  for (const s of sources) {
    if (!s.url || seen.has(s.url)) continue;
    seen.add(s.url);
    final.push({...s, ...scoreSource(product, s)});
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

function fallbackBrief(product, sources) {
  const category = product.category || "this category";
  const positives = sources.filter(s => s.sentiment === "positive").slice(0, 5).map(s => s.title || s.snippet).filter(Boolean);
  const negatives = sources.filter(s => s.sentiment === "negative" || s.sentiment === "mixed").slice(0, 5).map(s => s.title || s.snippet).filter(Boolean);

  return {
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
}

async function summarizeWithOllama(product, sources) {
  const fallback = fallbackBrief(product, sources);
  if (!sources.length) return fallback;

  const prompt = `Create a cautious affiliate product review brief as strict JSON.

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
review_summary, positive_signals, negative_signals, common_claims, common_complaints, target_audience, who_it_may_help, who_should_skip_it, best_video_angles, cta_guidance, confidence_score`;

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
    return {...fallback, ...JSON.parse(json.message?.content || "{}")};
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
     best_video_angles, cta_guidance, source_count, confidence_score, generated_at)
    VALUES (?, 'complete', ?, CAST(? AS JSON), CAST(? AS JSON), CAST(? AS JSON), CAST(? AS JSON),
            ?, ?, ?, CAST(? AS JSON), ?, ?, ?, NOW())
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
    sourceCount,
    Number(brief.confidence_score || Math.min(95, 40 + sourceCount * 3))
  ]);
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

  const collected = [];

  for (const q of queriesFor(product)) {
    console.log(`[${product.name}] ${q}`);
    collected.push(...await searchReviews(q));
  }

  const sources = await saveSources(conn, product, collected);
  const brief = await summarizeWithOllama(product, sources);
  await saveBrief(conn, product, brief, sources.length);

  await conn.query(`
    UPDATE review_enrichment_jobs
    SET status='complete', error_message=NULL,
        next_run_at=DATE_ADD(NOW(), INTERVAL ? DAY), updated_at=NOW()
    WHERE id=?
  `, [REFRESH_DAYS, job.id]);

  console.log(`[${product.name}] complete: ${sources.length} sources`);
}

async function main() {
  console.log(`Review enrichment provider: ${REVIEW_ENRICHMENT_PROVIDER}`);
  console.log(`SearXNG base URL: ${SEARXNG_BASE_URL}`);

  const conn = await mysql.createConnection(DATABASE_URL);

  try {
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
