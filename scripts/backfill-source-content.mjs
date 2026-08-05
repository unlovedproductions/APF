#!/usr/bin/env node
/**
 * Backfill product_review_sources.content_text for Digistore SKUs without
 * re-running SERP discovery (avoids diluting rich% with new thin hits).
 *
 * Usage:
 *   pnpm review:backfill-content [--product-id N] [--limit 40] [--delay-ms 300] [--dry-run]
 */
import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";
import {
  enrichSourceContent,
  selectPageFetchCandidates,
} from "./enrichment-page-fetch.mjs";
import { classifySourceHost } from "./enrichment-source-trust.mjs";
import { finalizeBrief } from "./enrichment-brief-finalize.mjs";

function loadEnv(file = ".env") {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[m[1]] ||= v;
  }
}

loadEnv();

function arg(name, fallback = "") {
  const i = process.argv.indexOf(name);
  if (i === -1) return fallback;
  return process.argv[i + 1] ?? fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function parseJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function contentLen(raw) {
  return String(raw?.content_text || "").trim().length;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL missing");
    process.exit(1);
  }
  const productId = Number(arg("--product-id", "0"));
  const perProduct = Math.max(1, Number(arg("--limit", "40")));
  const delayMs = Math.max(0, Number(arg("--delay-ms", "300")));
  const dryRun = hasFlag("--dry-run");
  const timeoutMs = Number(process.env.REVIEW_ENRICHMENT_FETCH_TIMEOUT_MS || "8000");
  const conn = await mysql.createConnection(process.env.DATABASE_URL);

  const summary = {
    products: 0,
    attempted: 0,
    newly_rich: 0,
    still_thin: 0,
    errors: 0,
    conf_updates: [],
  };

  try {
    const params = [];
    let sql = `SELECT id, name, platform, category, cartValue FROM products WHERE platform='digistore24'`;
    if (productId > 0) {
      sql += ` AND id=?`;
      params.push(productId);
    }
    sql += ` ORDER BY id ASC`;
    const [products] = await conn.query(sql, params);

    for (const product of products) {
      summary.products += 1;
      const [rows] = await conn.query(
        `SELECT id, source_type, source_name, title, url, snippet,
                relevance_score, trust_score, sentiment, raw_json
         FROM product_review_sources WHERE product_id=? ORDER BY id ASC`,
        [product.id],
      );
      const sources = (rows || []).map((row) => ({
        ...row,
        raw_json: parseJson(row.raw_json, {}),
      }));
      const thin = sources.filter((s) => contentLen(s.raw_json) < 50);
      const priority = thin.filter((s) => {
        let host = "";
        try { host = new URL(s.url).hostname; } catch { /* ignore */ }
        const tier = classifySourceHost(host).tier;
        return tier === "review" || tier === "scam_advisor" || tier === "video" || tier === "retailer";
      });
      const pool = priority.length ? priority : thin;
      const { candidates } = selectPageFetchCandidates(pool, {
        limit: Math.min(perProduct, 10),
        maxAttempts: Math.min(perProduct, pool.length),
      });

      let successes = 0;
      const fetchBudget = Math.min(perProduct, candidates.length);
      for (let i = 0; i < fetchBudget; i++) {
        const source = candidates[i];
        summary.attempted += 1;
        if (dryRun) {
          console.log(`[dry-run] #${product.id} would fetch ${source.url}`);
          continue;
        }

        try {
          const enriched = await enrichSourceContent(source, {
            timeoutMs,
            forceRefresh: true,
            textLimit: 8000,
          });
          const raw = enriched?.raw_json || {};
          const len = contentLen(raw);
          await conn.query(
            `UPDATE product_review_sources SET raw_json=?, title=COALESCE(?, title) WHERE id=?`,
            [JSON.stringify(raw), enriched.title || null, source.id],
          );
          source.raw_json = raw;
          if (enriched.title) source.title = enriched.title;
          if (len >= 50) {
            summary.newly_rich += 1;
            successes += 1;
          } else {
            summary.still_thin += 1;
          }
        } catch (err) {
          summary.errors += 1;
          console.warn(`[${product.id}] fetch failed ${source.url}: ${err?.message || err}`);
        }
        if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
      }

      const [mats] = await conn.query(
        `SELECT id FROM product_vendor_materials WHERE product_id=? LIMIT 1`,
        [product.id],
      );
      const [briefs] = await conn.query(
        `SELECT * FROM product_review_briefs WHERE product_id=? LIMIT 1`,
        [product.id],
      );
      const briefRow = briefs[0];
      if (!briefRow || dryRun) continue;

      const before = Number(briefRow.confidence_score || 0);
      const finalized = finalizeBrief(
        product,
        {
          review_summary: briefRow.review_summary,
          positive_signals: parseJson(briefRow.positive_signals, []),
          negative_signals: parseJson(briefRow.negative_signals, []),
          common_claims: parseJson(briefRow.common_claims, []),
          common_complaints: parseJson(briefRow.common_complaints, []),
          target_audience: briefRow.target_audience,
          who_it_may_help: briefRow.who_it_may_help,
          who_should_skip_it: briefRow.who_should_skip_it,
          best_video_angles: parseJson(briefRow.best_video_angles, []),
          cta_guidance: briefRow.cta_guidance,
          recommended_content_style: briefRow.recommended_content_style,
          suggested_competitors: parseJson(briefRow.suggested_competitors, []),
          price_display: briefRow.price_display,
          price_comparison: briefRow.price_comparison,
          confidence_score: Math.max(before, 60),
        },
        sources,
        {
          hasVendorMaterial: (mats || []).length > 0,
          reviewSources: sources.filter((s) => {
            let host = "";
            try { host = new URL(s.url).hostname; } catch { /* ignore */ }
            const tier = classifySourceHost(host).tier;
            return tier === "review" || tier === "scam_advisor";
          }),
        },
      );
      const after = Number(finalized.confidence_score || before);
      if (after !== before || finalized.evidence_coverage) {
        await conn.query(
          `UPDATE product_review_briefs
           SET confidence_score=?, evidence_coverage=?, updated_at=NOW()
           WHERE product_id=?`,
          [after, JSON.stringify(finalized.evidence_coverage || {}), product.id],
        );
        summary.conf_updates.push({ id: product.id, from: before, to: after });
      }
      console.log(
        `[${product.id}] ${product.name.slice(0, 48)} attempted=${candidates.length} `
        + `successes≈${successes} conf ${before}→${after}`,
      );
    }

    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await conn.end();
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
