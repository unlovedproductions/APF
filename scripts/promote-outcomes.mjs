#!/usr/bin/env node
/**
 * Promote outcome log for Hidden Gem calibration (roadmap P1.3).
 *
 * Usage:
 *   pnpm promote:outcome --product-id 123 --event promote_start
 *   pnpm promote:outcome --product-id 123 --event promote_result --epc 1.25 --refund-rate 8
 *   pnpm promote:outcome --list [--product-id 123] [--limit 20]
 *   pnpm promote:outcome --import docs/research/apf-improvement-roadmap/promote-result.template.csv
 *   pnpm promote:outcome --import path.csv --dry-run
 */
import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";

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

export async function ensurePromoteOutcomesTable(conn) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS product_promote_outcomes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      product_id INT NOT NULL,
      event VARCHAR(32) NOT NULL,
      net_epc DECIMAL(12,4) NULL,
      refund_rate DECIMAL(5,2) NULL,
      hidden_gem_score DECIMAL(8,2) NULL,
      notes TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_promote_outcomes_product (product_id),
      KEY idx_promote_outcomes_user (user_id),
      KEY idx_promote_outcomes_event (event)
    )
  `);
}

export async function logPromoteOutcome(conn, {
  userId,
  productId,
  event,
  netEpc = null,
  refundRate = null,
  hiddenGemScore = null,
  notes = null,
}) {
  if (!userId || !productId || !event) {
    throw new Error("userId, productId, and event are required");
  }
  await ensurePromoteOutcomesTable(conn);
  const [result] = await conn.query(
    `INSERT INTO product_promote_outcomes
      (user_id, product_id, event, net_epc, refund_rate, hidden_gem_score, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      Number(userId),
      Number(productId),
      String(event).slice(0, 32),
      netEpc == null || netEpc === "" ? null : Number(netEpc),
      refundRate == null || refundRate === "" ? null : Number(refundRate),
      hiddenGemScore == null || hiddenGemScore === "" ? null : Number(hiddenGemScore),
      notes == null ? null : String(notes).slice(0, 4000),
    ],
  );
  return Number(result.insertId || 0);
}

async function appendJsonl(row) {
  const dir = path.join(process.cwd(), ".data");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "promote-outcomes.jsonl");
  fs.appendFileSync(file, `${JSON.stringify({ ...row, logged_at: new Date().toISOString() })}\n`);
  return file;
}

/** Minimal CSV parser: header row required; supports quoted fields. */
export function parsePromoteCsv(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
  if (lines.length < 2) return [];

  const split = (line) => {
    const out = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }
      if (ch === "," && !inQuotes) {
        out.push(cur.trim());
        cur = "";
        continue;
      }
      cur += ch;
    }
    out.push(cur.trim());
    return out;
  };

  const headers = split(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, "_"));
  const rows = [];
  for (const line of lines.slice(1)) {
    const cols = split(line);
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = cols[i] ?? "";
    });
    rows.push(obj);
  }
  return rows;
}

export function normalizePromoteCsvRow(row = {}) {
  const productId = Number(row.product_id || row.productid || row.id || 0);
  const event = String(row.event || "promote_result").trim() || "promote_result";
  const netEpc = row.net_epc ?? row.epc ?? row.netepc ?? "";
  const refundRate = row.refund_rate ?? row.refund ?? row.refundrate ?? "";
  let notes = String(row.notes || row.note || "").trim();
  if (event === "promote_result" && notes && /^listing_signal\b/i.test(notes)) {
    throw new Error("CSV import rejects listing_signal notes — use real campaign notes");
  }
  if (event === "promote_result" && !notes) {
    notes = "campaign: csv_import";
  }
  return {
    productId,
    event,
    netEpc: netEpc === "" ? null : Number(netEpc),
    refundRate: refundRate === "" ? null : Number(refundRate),
    notes,
  };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL missing from .env");
    process.exit(1);
  }

  const userId = Number(arg("--user-id", process.env.APF_USER_ID || "1"));
  const productId = Number(arg("--product-id", "0"));
  const event = String(arg("--event", "promote_result")).trim();
  const epc = arg("--epc", "");
  const refundRate = arg("--refund-rate", "");
  const notes = arg("--notes", "");
  const limit = Math.max(1, Number(arg("--limit", "20")) || 20);
  const listOnly = hasFlag("--list");
  const calibrate = hasFlag("--calibrate");
  const importPath = arg("--import", "");
  const dryRun = hasFlag("--dry-run");

  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    await ensurePromoteOutcomesTable(conn);

    if (importPath) {
      const abs = path.resolve(importPath);
      if (!fs.existsSync(abs)) {
        console.error(`Import file not found: ${abs}`);
        process.exit(1);
      }
      const parsed = parsePromoteCsv(fs.readFileSync(abs, "utf8"));
      const summary = { file: abs, dry_run: dryRun, rows: 0, inserted: 0, errors: [] };
      for (const raw of parsed) {
        summary.rows += 1;
        try {
          const norm = normalizePromoteCsvRow(raw);
          if (!(norm.productId > 0)) throw new Error("product_id required");
          if (!["promote_start", "promote_result"].includes(norm.event)) {
            throw new Error(`unsupported event ${norm.event}`);
          }
          if (norm.event === "promote_result" && (norm.netEpc == null || !Number.isFinite(norm.netEpc))) {
            throw new Error("net_epc/epc required for promote_result");
          }
          const [[product]] = await conn.query(
            `SELECT id, name, hiddenGemScore FROM products WHERE id=? LIMIT 1`,
            [norm.productId],
          );
          if (!product) throw new Error(`product #${norm.productId} not found`);
          if (dryRun) {
            summary.inserted += 1;
            continue;
          }
          const id = await logPromoteOutcome(conn, {
            userId,
            productId: norm.productId,
            event: norm.event,
            netEpc: norm.netEpc,
            refundRate: norm.refundRate,
            hiddenGemScore: product.hiddenGemScore,
            notes: norm.notes,
          });
          await appendJsonl({
            id,
            userId,
            productId: norm.productId,
            name: product.name,
            event: norm.event,
            netEpc: norm.netEpc,
            refundRate: norm.refundRate,
            notes: norm.notes,
            source: "csv_import",
          });
          summary.inserted += 1;
        } catch (err) {
          summary.errors.push({ row: summary.rows, error: err.message });
        }
      }
      console.log(JSON.stringify(summary, null, 2));
      if (summary.errors.length) process.exitCode = 1;
      return;
    }

    if (calibrate) {
      const { summarizePromoteResults, PROMOTE_CALIBRATION_MIN_RESULTS } = await import(
        "./marketplace-scoring.mjs"
      );
      const params = [];
      let sql = `
        SELECT product_id, event, net_epc, refund_rate, hidden_gem_score, notes, created_at
        FROM product_promote_outcomes
        WHERE event='promote_result'
      `;
      if (productId > 0) {
        sql += ` AND product_id=?`;
        params.push(productId);
      }
      sql += ` ORDER BY id DESC LIMIT ?`;
      params.push(Math.max(limit, 200));
      const [rows] = await conn.query(sql, params);
      const byProduct = new Map();
      for (const row of rows) {
        const list = byProduct.get(row.product_id) || [];
        list.push(row);
        byProduct.set(row.product_id, list);
      }
      const report = [];
      for (const [pid, outcomes] of byProduct.entries()) {
        const summary = summarizePromoteResults(outcomes);
        const listingN = outcomes.filter((o) => /^listing_signal\b/i.test(String(o.notes || ""))).length;
        report.push({
          product_id: pid,
          promote_result_n: summary.n,
          listing_signal_n: listingN,
          avg_epc: summary.avg_epc == null ? null : Number(summary.avg_epc.toFixed(4)),
          avg_refund_rate: summary.avg_refund_rate == null
            ? null
            : Number(summary.avg_refund_rate.toFixed(2)),
          ready: summary.n >= PROMOTE_CALIBRATION_MIN_RESULTS,
          min_required: PROMOTE_CALIBRATION_MIN_RESULTS,
        });
      }
      console.log(JSON.stringify({
        products_with_results: report.length,
        ready_count: report.filter((r) => r.ready).length,
        min_required: PROMOTE_CALIBRATION_MIN_RESULTS,
        note: "listing_signal rows are excluded from promote_result_n / ready",
        products: report,
      }, null, 2));
      return;
    }

    if (listOnly) {
      const params = [];
      let sql = `
        SELECT o.id, o.user_id, o.product_id, p.name, p.platform, o.event,
               o.net_epc, o.refund_rate, o.hidden_gem_score, o.notes, o.created_at
        FROM product_promote_outcomes o
        LEFT JOIN products p ON p.id = o.product_id
      `;
      if (productId > 0) {
        sql += ` WHERE o.product_id=?`;
        params.push(productId);
      }
      sql += ` ORDER BY o.id DESC LIMIT ?`;
      params.push(limit);
      const [rows] = await conn.query(sql, params);
      console.table(rows);
      return;
    }

    if (!(productId > 0)) {
      console.error(
        "Usage: pnpm promote:outcome --product-id N --event promote_start|promote_result [--epc X] [--refund-rate Y]\n"
        + "   or: pnpm promote:outcome --import path.csv [--dry-run]",
      );
      process.exit(1);
    }

    const [[product]] = await conn.query(
      `SELECT id, name, hiddenGemScore FROM products WHERE id=? LIMIT 1`,
      [productId],
    );
    if (!product) {
      console.error(`Product #${productId} not found`);
      process.exit(1);
    }

    const id = await logPromoteOutcome(conn, {
      userId,
      productId,
      event,
      netEpc: epc,
      refundRate,
      hiddenGemScore: product.hiddenGemScore,
      notes: notes || null,
    });

    const jsonl = await appendJsonl({
      id,
      userId,
      productId,
      name: product.name,
      event,
      netEpc: epc || null,
      refundRate: refundRate || null,
      hiddenGemScore: product.hiddenGemScore,
      notes: notes || null,
    });

    console.log(`Logged ${event} for #${productId} (${product.name}) → outcome id=${id}`);
    console.log(`Also appended ${jsonl}`);
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
