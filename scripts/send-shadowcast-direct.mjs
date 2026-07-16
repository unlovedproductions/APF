#!/usr/bin/env node
import mysql from "mysql2/promise";
import { spawn } from "node:child_process";
import { sendToShadowCast } from "./shadowcast-direct-lib.mjs";

const productId = Number(process.argv[2]);
const shouldOpen = process.argv.includes("--open");
const force = process.argv.includes("--force");

if (!productId) {
  console.error("Usage: pnpm run shadowcast:send <product_id> [--open] [--force]");
  process.exit(1);
}

async function enrichmentStatus(id) {
  if (!process.env.DATABASE_URL) return "unknown";
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    const [rows] = await conn.query(
      `SELECT COALESCE(b.enrichment_status, 'pending') AS status
       FROM products p
       LEFT JOIN product_review_briefs b ON b.product_id = p.id
       WHERE p.id=? LIMIT 1`,
      [id],
    );
    return String(rows[0]?.status || "pending");
  } finally {
    await conn.end();
  }
}

try {
  const status = await enrichmentStatus(productId);
  if (!force && status !== "complete") {
    console.error(`Review enrichment is not complete (status=${status}). Use --force to send anyway.`);
    process.exit(1);
  }

  const result = await sendToShadowCast(productId);
  console.log(JSON.stringify(result, null, 2));

  if (shouldOpen && result.open_url) {
    spawn("xdg-open", [result.open_url], {
      detached: true,
      stdio: "ignore",
    }).unref();
  }
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
