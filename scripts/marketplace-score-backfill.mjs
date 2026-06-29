#!/usr/bin/env node
import fs from "node:fs";
import mysql from "mysql2/promise";
import { SCORING_VERSION, scoreProduct } from "./marketplace-scoring.mjs";

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
  return i === -1 ? fallback : process.argv[i + 1] || fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL missing from APF .env");
  process.exit(1);
}

const DRY_RUN = hasFlag("--dry-run");
const FORCE_CLICKBANK = hasFlag("--force-clickbank");
const MARKETPLACE = arg("--marketplace", "");
const LIMIT = Number(arg("--limit", "500"));

function whereClause() {
  if (!MARKETPLACE) return ["", []];
  return [
    "WHERE LOWER(COALESCE(p.platform, '')) LIKE ?",
    [`%${MARKETPLACE.toLowerCase()}%`]
  ];
}

async function main() {
  const conn = await mysql.createConnection(DATABASE_URL);

  try {
    const [where, params] = whereClause();

    const [rows] = await conn.query(`
      SELECT
        p.*,
        b.enrichment_status,
        b.source_count,
        b.confidence_score,
        l.status AS link_status,
        l.affiliate_url AS generated_affiliate_url
      FROM products p
      LEFT JOIN product_review_briefs b
        ON b.product_id = p.id
      LEFT JOIN product_affiliate_links l
        ON l.product_id = p.id
       AND l.provider = p.platform
      ${where}
      ORDER BY COALESCE(p.lastUpdatedAt, p.createdAt) DESC, p.id DESC
      LIMIT ?
    `, [...params, LIMIT]);

    const output = [];

    for (const row of rows) {
      const product = {
        ...row,
        affiliateLink: row.affiliateLink || row.generated_affiliate_url || ""
      };

      const scored = scoreProduct(product, {
        forceClickBank: FORCE_CLICKBANK
      });

      const scoreComponents = {
        ...scored.components,
        _meta: {
          scoring_version: SCORING_VERSION,
          marketplace: scored.marketplace,
          strategy: scored.strategy,
          ...scored.meta
        }
      };

      output.push({
        id: row.id,
        platform: row.platform,
        name: row.name,
        oldScore: row.hiddenGemScore,
        newScore: scored.score,
        recency: scored.components.recency,
        growth: scored.components.growth,
        competition: scored.components.competition,
        quality: scored.components.quality,
        strategy: scored.strategy
      });

      if (!DRY_RUN) {
        await conn.query(`
          UPDATE products
          SET hiddenGemScore=?, scoreComponents=?, lastUpdatedAt=NOW()
          WHERE id=?
        `, [
          scored.score,
          JSON.stringify(scoreComponents),
          row.id
        ]);
      }
    }

    console.table(output);

    console.log("");
    console.log(DRY_RUN ? "Dry run only. No scores were saved." : "Scores saved.");
    console.log("Scoring version:", SCORING_VERSION);
  } finally {
    await conn.end();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
