#!/usr/bin/env node
import fs from "node:fs";
import mysql from "mysql2/promise";

for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (!m) continue;
  let v = m[2].trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  process.env[m[1]] ||= v;
}

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const [groups] = await conn.query(`
  SELECT userId, platform, platformProductId, COUNT(*) AS count
  FROM products
  WHERE platformProductId IS NOT NULL AND platformProductId != ''
  GROUP BY userId, platform, platformProductId
  HAVING count > 1
`);

for (const g of groups) {
  const [rows] = await conn.query(`
    SELECT id, affiliateLink, hiddenGemScore, lastUpdatedAt
    FROM products
    WHERE userId=? AND platform=? AND platformProductId=?
    ORDER BY
      CASE WHEN affiliateLink IS NOT NULL AND affiliateLink != '' THEN 0 ELSE 1 END,
      lastUpdatedAt DESC,
      id DESC
  `, [g.userId, g.platform, g.platformProductId]);

  const keep = rows[0];
  const remove = rows.slice(1).map(r => r.id);

  if (remove.length) {
    await conn.query(`
      UPDATE bookmarks
      SET productId=?
      WHERE userId=? AND productId IN (${remove.map(() => "?").join(",")})
    `, [keep.id, g.userId, ...remove]);

    await conn.query(`DELETE FROM products WHERE id IN (${remove.map(() => "?").join(",")})`, remove);
    console.log(`Deduped ${g.platform}/${g.platformProductId} (user ${g.userId}): kept ${keep.id}, removed ${remove.join(", ")}`);
  }
}

const [bookmarkGroups] = await conn.query(`
  SELECT userId, productId, COUNT(*) AS count
  FROM bookmarks
  GROUP BY userId, productId
  HAVING count > 1
`);

for (const g of bookmarkGroups) {
  const [rows] = await conn.query(`
    SELECT id
    FROM bookmarks
    WHERE userId=? AND productId=?
    ORDER BY updatedAt DESC, id DESC
  `, [g.userId, g.productId]);
  const remove = rows.slice(1).map(r => r.id);
  if (remove.length) {
    await conn.query(`DELETE FROM bookmarks WHERE id IN (${remove.map(() => "?").join(",")})`, remove);
    console.log(`Deduped bookmarks for user ${g.userId}, product ${g.productId}: removed ${remove.join(", ")}`);
  }
}

await conn.end();
