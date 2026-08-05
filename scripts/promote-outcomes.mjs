#!/usr/bin/env node
/**
 * Promote outcome log for Hidden Gem calibration (roadmap P1.3).
 *
 * Usage:
 *   pnpm promote:outcome --product-id 123 --event promote_start
 *   pnpm promote:outcome --product-id 123 --event promote_result --epc 1.25 --refund-rate 8
 *   pnpm promote:outcome --list [--product-id 123] [--limit 20]
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

  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    await ensurePromoteOutcomesTable(conn);

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
      console.error("Usage: pnpm promote:outcome --product-id N --event promote_start|promote_result [--epc X] [--refund-rate Y]");
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
