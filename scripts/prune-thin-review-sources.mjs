#!/usr/bin/env node
/**
 * Way 1 — Prune thin Digistore review-source orphans (denominator surgery).
 *
 * Default is dry-run. Soft-apply sets raw_json.pruned_at (DQS excludes these).
 * Hard delete requires --apply --hard.
 *
 * Usage:
 *   pnpm review:prune-thin
 *   pnpm review:prune-thin --days 14 --product-id N
 *   pnpm review:prune-thin --days 0          # no age gate (thin web orphans ok)
 *   pnpm review:prune-thin --apply
 *   pnpm review:prune-thin --apply --hard
 */
import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";
import { classifySourceHost } from "./enrichment-source-trust.mjs";

const FETCHABLE_TIERS = new Set(["review", "scam_advisor", "retailer", "video"]);
const PERMANENT_FETCH_RE = /http 404|http 410|unsupported content type|invalid url|blocked (host|ip)|unsupported protocol/i;

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

function parseJson(value, fallback = {}) {
  if (value == null) return fallback;
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function contentLen(raw) {
  return String(raw?.content_text || "").trim().length;
}

function hostnameFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function isPermanentFetchError(message) {
  return PERMANENT_FETCH_RE.test(String(message || ""));
}

export function shouldRetain(row, raw, tier) {
  if (row.source_type === "competitor" || raw.competitor_search) {
    return { retain: true, reason: "competitor_context" };
  }
  if (raw.retain_reason) {
    return { retain: true, reason: String(raw.retain_reason) };
  }
  if (FETCHABLE_TIERS.has(tier) && !isPermanentFetchError(raw.fetch_error)) {
    return { retain: true, reason: "high_trust_retryable" };
  }
  return { retain: false, reason: "" };
}

export function shouldPrune(row, raw, tier, minAgeDays) {
  if (raw.pruned_at) return { prune: false, reason: "already_pruned" };
  if (contentLen(raw) >= 50) return { prune: false, reason: "rich" };

  const retain = shouldRetain(row, raw, tier);
  if (retain.retain) return { prune: false, reason: retain.reason };

  // Permanent dead URLs: prune even if young (no value keeping 404/410 stubs).
  if (isPermanentFetchError(raw.fetch_error)) {
    return { prune: true, reason: "permanent_fetch_error" };
  }

  const discovered = Date.parse(String(row.discovered_at || ""));
  const ageMs = Number.isFinite(discovered) ? Date.now() - discovered : Infinity;
  if (minAgeDays > 0 && ageMs < minAgeDays * 24 * 60 * 60 * 1000) {
    return { prune: false, reason: "too_young" };
  }

  if (tier === "web" || tier === "affiliate_noise" || !tier) {
    return { prune: true, reason: `thin_${tier || "unknown"}_orphan` };
  }
  return { prune: false, reason: "tier_hold" };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL missing");
    process.exit(1);
  }

  const apply = hasFlag("--apply");
  const hard = hasFlag("--hard");
  const dryRun = !apply;
  // --days 0 disables the age gate so fresh thin web orphans can soft-prune.
  const days = Math.max(0, Number(arg("--days", "14")));
  const daysResolved = Number.isFinite(days) ? days : 14;
  const productId = Number(arg("--product-id", "0"));
  const limit = Math.max(0, Number(arg("--limit", "0")) || 0);

  if (hard && !apply) {
    console.error("--hard requires --apply");
    process.exit(1);
  }

  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  const prunedAt = new Date().toISOString();
  const candidates = [];
  const retained = [];

  try {
    let sql = `
      SELECT s.id, s.product_id, s.source_type, s.url, s.discovered_at, s.raw_json
      FROM product_review_sources s
      INNER JOIN products p ON p.id = s.product_id AND p.platform = 'digistore24'
      WHERE CHAR_LENGTH(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(s.raw_json, '$.content_text')), '')) < 50
        AND (JSON_EXTRACT(s.raw_json, '$.pruned_at') IS NULL)
    `;
    const params = [];
    if (productId > 0) {
      sql += ` AND s.product_id=?`;
      params.push(productId);
    }
    sql += ` ORDER BY s.product_id ASC, s.id ASC`;
    const [rows] = await conn.query(sql, params);

    for (const row of rows) {
      const raw = parseJson(row.raw_json, {});
      const host = hostnameFromUrl(row.url);
      const tier = classifySourceHost(host).tier;
      const decision = shouldPrune(row, raw, tier, daysResolved);
      const entry = {
        id: row.id,
        product_id: row.product_id,
        url: row.url,
        tier,
        source_type: row.source_type,
        text_len: contentLen(raw),
        fetch_error: raw.fetch_error || null,
        fetch_provider: raw.fetch_provider || null,
        decision: decision.prune ? "prune" : "retain",
        reason: decision.reason,
      };
      if (decision.prune) candidates.push(entry);
      else retained.push(entry);
    }

    const toAct = limit > 0 ? candidates.slice(0, limit) : candidates;

    if (apply && toAct.length) {
      for (const item of toAct) {
        if (hard) {
          await conn.query(`DELETE FROM product_review_sources WHERE id=?`, [item.id]);
        } else {
          const [cur] = await conn.query(`SELECT raw_json FROM product_review_sources WHERE id=?`, [item.id]);
          const raw = parseJson(cur[0]?.raw_json, {});
          raw.pruned_at = prunedAt;
          raw.prune_reason = item.reason;
          await conn.query(`UPDATE product_review_sources SET raw_json=? WHERE id=?`, [
            JSON.stringify(raw),
            item.id,
          ]);
        }
      }
    }

    const dataDir = path.join(process.cwd(), ".data");
    fs.mkdirSync(dataDir, { recursive: true });
    const day = prunedAt.slice(0, 10);
    const logPath = path.join(dataDir, `prune-thin-${day}.jsonl`);
    const logLines = toAct.map((row) => JSON.stringify({
      ...row,
      applied: apply,
      hard,
      pruned_at: apply ? prunedAt : null,
    }));
    if (logLines.length) {
      fs.appendFileSync(logPath, `${logLines.join("\n")}\n`);
    }

    console.log(JSON.stringify({
      dry_run: dryRun,
      apply,
      hard,
      days: daysResolved,
      product_id: productId || null,
      thin_aged_scanned: rows.length,
      prune_candidates: candidates.length,
      prune_acted: toAct.length,
      retained_sample: retained.slice(0, 8),
      prune_sample: toAct.slice(0, 12),
      log: logLines.length ? logPath : null,
      note: dryRun
        ? "Dry-run only. Re-run with --apply for soft prune (pruned_at). Add --hard to DELETE."
        : hard
          ? "Hard-deleted prune candidates."
          : "Soft-pruned via raw_json.pruned_at (excluded from DQS).",
    }, null, 2));
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
