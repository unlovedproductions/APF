#!/usr/bin/env node
/**
 * Reconcile live DB with drizzle migration journal.
 * Run: node --env-file=.env scripts/reconcile-drizzle-migrations.mjs
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MIGRATIONS_DIR = path.join(ROOT, "drizzle");
const JOURNAL_PATH = path.join(MIGRATIONS_DIR, "meta", "_journal.json");

function migrationHash(tag) {
  const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, `${tag}.sql`), "utf8");
  return crypto.createHash("sha256").update(sql).digest("hex");
}

function loadJournal() {
  const journal = JSON.parse(fs.readFileSync(JOURNAL_PATH, "utf8"));
  return journal.entries.map((entry) => ({
    tag: entry.tag,
    when: entry.when,
    hash: migrationHash(entry.tag),
  }));
}

async function indexExists(conn, table, indexName) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [table, indexName],
  );
  return Number(rows[0].cnt) > 0;
}

async function countDuplicateProductGroups(conn) {
  const [rows] = await conn.query(`
    SELECT COUNT(*) AS cnt FROM (
      SELECT userId, platform, platformProductId
      FROM products
      WHERE platformProductId IS NOT NULL AND platformProductId != ''
      GROUP BY userId, platform, platformProductId
      HAVING COUNT(*) > 1
    ) dupes
  `);
  return Number(rows[0].cnt);
}

async function repointChildRows(conn, table, column, fromId, toId) {
  await conn.query(`UPDATE \`${table}\` SET \`${column}\` = ? WHERE \`${column}\` = ?`, [toId, fromId]);
}

async function deleteConflictingChildRows(conn, table, column, fromId, toId, conflictColumns) {
  const cols = conflictColumns.map((c) => `\`${c}\``).join(", ");
  await conn.query(
    `DELETE t FROM \`${table}\` t
     INNER JOIN \`${table}\` keeper ON keeper.\`${column}\` = ? AND ${conflictColumns.map((c) => `keeper.\`${c}\` = t.\`${c}\``).join(" AND ")}
     WHERE t.\`${column}\` = ?`,
    [toId, fromId],
  );
}

async function dedupeProducts(conn) {
  const [groups] = await conn.query(`
    SELECT userId, platform, platformProductId, COUNT(*) AS count
    FROM products
    WHERE platformProductId IS NOT NULL AND platformProductId != ''
    GROUP BY userId, platform, platformProductId
    HAVING count > 1
  `);

  let removed = 0;
  for (const g of groups) {
    const [rows] = await conn.query(
      `SELECT id FROM products
       WHERE userId = ? AND platform = ? AND platformProductId = ?
       ORDER BY lastUpdatedAt DESC, id DESC`,
      [g.userId, g.platform, g.platformProductId],
    );

    const keepId = rows[0].id;
    const removeIds = rows.slice(1).map((r) => r.id);

    for (const removeId of removeIds) {
      await repointChildRows(conn, "bookmarks", "productId", removeId, keepId);

      for (const [table, col, conflicts] of [
        ["product_affiliate_links", "product_id", ["provider", "affiliate_nickname"]],
        ["product_review_sources", "product_id", ["url"]],
        ["product_vendor_materials", "product_id", ["source_url_hash"]],
      ]) {
        await deleteConflictingChildRows(conn, table, col, removeId, keepId, conflicts);
        await repointChildRows(conn, table, col, removeId, keepId);
      }

      for (const [table, col] of [
        ["product_review_briefs", "product_id"],
        ["review_enrichment_jobs", "product_id"],
      ]) {
        const [keepers] = await conn.query(`SELECT id FROM \`${table}\` WHERE \`${col}\` = ? LIMIT 1`, [keepId]);
        if (keepers.length) {
          await conn.query(`DELETE FROM \`${table}\` WHERE \`${col}\` = ?`, [removeId]);
        } else {
          await repointChildRows(conn, table, col, removeId, keepId);
        }
      }

      await conn.query(`DELETE FROM products WHERE id = ?`, [removeId]);
      removed += 1;
      console.log(`Deduped ${g.platform}/${g.platformProductId} (user ${g.userId}): kept ${keepId}, removed ${removeId}`);
    }
  }

  const [bookmarkGroups] = await conn.query(`
    SELECT userId, productId, COUNT(*) AS count
    FROM bookmarks
    GROUP BY userId, productId
    HAVING count > 1
  `);

  for (const g of bookmarkGroups) {
    const [rows] = await conn.query(
      `SELECT id FROM bookmarks WHERE userId = ? AND productId = ? ORDER BY updatedAt DESC, id DESC`,
      [g.userId, g.productId],
    );
    const removeIds = rows.slice(1).map((r) => r.id);
    if (removeIds.length) {
      await conn.query(`DELETE FROM bookmarks WHERE id IN (${removeIds.map(() => "?").join(",")})`, removeIds);
      console.log(`Deduped bookmarks for user ${g.userId}, product ${g.productId}: removed ${removeIds.join(", ")}`);
    }
  }

  return removed;
}

async function ensureUniqueIndexes(conn) {
  const added = [];

  if (!(await indexExists(conn, "products", "products_user_platform_product_unique"))) {
    await conn.query(
      `CREATE UNIQUE INDEX \`products_user_platform_product_unique\` ON \`products\` (\`userId\`,\`platform\`,\`platformProductId\`)`,
    );
    added.push("products_user_platform_product_unique");
  }

  if (!(await indexExists(conn, "bookmarks", "bookmarks_user_product_unique"))) {
    await conn.query(
      `CREATE UNIQUE INDEX \`bookmarks_user_product_unique\` ON \`bookmarks\` (\`userId\`,\`productId\`)`,
    );
    added.push("bookmarks_user_product_unique");
  }

  return added;
}

async function recordMissingMigrations(conn, journalEntries) {
  const [existing] = await conn.query(`SELECT hash, created_at FROM __drizzle_migrations ORDER BY created_at`);
  const existingHashes = new Set(existing.map((r) => r.hash));
  const recorded = [];

  for (const entry of journalEntries) {
    if (existingHashes.has(entry.hash)) continue;
    const alreadyByTime = existing.some((r) => Number(r.created_at) === entry.when);
    if (alreadyByTime) continue;

    await conn.query(
      `INSERT INTO __drizzle_migrations (\`hash\`, \`created_at\`) VALUES (?, ?)`,
      [entry.hash, entry.when],
    );
    recorded.push(entry.tag);
    console.log(`Recorded migration ${entry.tag} (hash ${entry.hash.slice(0, 12)}…)`);
  }

  return recorded;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required (use node --env-file=.env)");
  }

  const journalEntries = loadJournal();
  const conn = await mysql.createConnection(process.env.DATABASE_URL);

  try {
    const [migrationsBefore] = await conn.query(
      `SELECT id, hash, created_at FROM __drizzle_migrations ORDER BY created_at`,
    );
    const dupesBefore = await countDuplicateProductGroups(conn);
    console.log(`Migrations before: ${migrationsBefore.length}`);
    console.log(`Duplicate product groups before: ${dupesBefore}`);

    const removed = await dedupeProducts(conn);
    const dupesAfter = await countDuplicateProductGroups(conn);
    console.log(`Products removed: ${removed}`);
    console.log(`Duplicate product groups after: ${dupesAfter}`);

    const indexesAdded = await ensureUniqueIndexes(conn);
    console.log(`Indexes added: ${indexesAdded.length ? indexesAdded.join(", ") : "(none)"}`);

    const recorded = await recordMissingMigrations(conn, journalEntries);
    console.log(`Migrations recorded: ${recorded.length ? recorded.join(", ") : "(none)"}`);

    const [migrationsAfter] = await conn.query(
      `SELECT id, hash, created_at FROM __drizzle_migrations ORDER BY created_at`,
    );
    console.log(`Migrations after: ${migrationsAfter.length}`);
    for (const m of migrationsAfter) {
      console.log(`  id=${m.id} created_at=${m.created_at} hash=${m.hash.slice(0, 16)}…`);
    }

    const productsIdx = await indexExists(conn, "products", "products_user_platform_product_unique");
    const bookmarksIdx = await indexExists(conn, "bookmarks", "bookmarks_user_product_unique");
    console.log(`products_user_platform_product_unique: ${productsIdx ? "present" : "missing"}`);
    console.log(`bookmarks_user_product_unique: ${bookmarksIdx ? "present" : "missing"}`);
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
