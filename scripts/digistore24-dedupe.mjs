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
  SELECT platformProductId, COUNT(*) AS count
  FROM products
  WHERE platform='digistore24'
  GROUP BY platformProductId
  HAVING count > 1
`);

for (const g of groups) {
  const [rows] = await conn.query(`
    SELECT id, affiliateLink, hiddenGemScore, lastUpdatedAt
    FROM products
    WHERE platform='digistore24' AND platformProductId=?
    ORDER BY
      CASE WHEN affiliateLink IS NOT NULL AND affiliateLink != '' THEN 0 ELSE 1 END,
      lastUpdatedAt DESC,
      id DESC
  `, [g.platformProductId]);

  const keep = rows[0];
  const remove = rows.slice(1).map(r => r.id);

  if (remove.length) {
    await conn.query(`DELETE FROM products WHERE id IN (${remove.map(() => "?").join(",")})`, remove);
    console.log(`Deduped ${g.platformProductId}: kept ${keep.id}, removed ${remove.join(", ")}`);
  }
}

await conn.end();
