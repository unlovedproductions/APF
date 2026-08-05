#!/usr/bin/env node
/**
 * Digistore enrichment DQS snapshot (roadmap P0.4).
 * Writes markdown under docs/research/apf-improvement-roadmap/ when --write is set.
 *
 * Usage:
 *   pnpm review:dqs
 *   pnpm review:dqs --write
 *   pnpm review:dqs --limit 50
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

const AFFILIATE_RE = /\b(epc|commission|affiliate|promolink|checkout-ds24|jvzoo|warriorplus)\b/i;
const MARKETPLACE_NAME_RE = /^(digistore24?|marketplace)$/i;

function pct(n, d) {
  if (!d) return 0;
  return Math.round((1000 * n) / d) / 10;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL missing from .env");
    process.exit(1);
  }

  const limit = Math.max(1, Number(arg("--limit", "50")) || 50);
  const write = hasFlag("--write");
  const conn = await mysql.createConnection(process.env.DATABASE_URL);

  try {
    const [briefs] = await conn.query(
      `
      SELECT
        p.id AS product_id,
        p.name,
        p.platform,
        b.enrichment_status,
        b.confidence_score,
        b.review_summary,
        b.common_complaints,
        b.common_claims,
        b.positive_signals,
        b.suggested_competitors,
        b.price_display,
        b.generated_at,
        b.evidence_coverage
      FROM products p
      INNER JOIN product_review_briefs b ON b.product_id = p.id
      WHERE p.platform LIKE '%digistore%'
      ORDER BY b.generated_at DESC
      LIMIT ?
      `,
      [limit],
    );

    const n = briefs.length;
    const statusCounts = {};
    let marketplaceName = 0;
    let affiliateInSummary = 0;
    let affiliateInComplaints = 0;
    let affiliateInClaims = 0;
    let syntheticCompetitors = 0;
    let confSum = 0;
    let confN = 0;

    for (const row of briefs) {
      const st = String(row.enrichment_status || "pending");
      statusCounts[st] = (statusCounts[st] || 0) + 1;
      if (MARKETPLACE_NAME_RE.test(String(row.name || "").trim())) marketplaceName += 1;
      if (AFFILIATE_RE.test(String(row.review_summary || ""))) affiliateInSummary += 1;
      if (AFFILIATE_RE.test(JSON.stringify(row.common_complaints || ""))) affiliateInComplaints += 1;
      if (AFFILIATE_RE.test(JSON.stringify(row.common_claims || ""))) affiliateInClaims += 1;
      if (/Top .+ alternative/i.test(JSON.stringify(row.suggested_competitors || ""))) syntheticCompetitors += 1;
      const conf = Number(row.confidence_score);
      if (Number.isFinite(conf)) {
        confSum += conf;
        confN += 1;
      }
    }

    const [sourceRows] = await conn.query(
      `
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN CHAR_LENGTH(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(raw_json, '$.content_text')), '')) >= 50 THEN 1 ELSE 0 END) AS rich_content
      FROM product_review_sources s
      INNER JOIN products p ON p.id = s.product_id
      WHERE p.platform LIKE '%digistore%'
      `,
    );
    const sourcesTotal = Number(sourceRows[0]?.total || 0);
    const richContent = Number(sourceRows[0]?.rich_content || 0);

    const complete = statusCounts.complete || 0;
    const degraded = statusCounts.complete_degraded || 0;
    const avgConf = confN ? Math.round((10 * confSum) / confN) / 10 : null;

    // Only true `complete` counts toward completeness — degraded is finished but not production-ready.
    const completeness = n ? pct(complete, n) : 0;
    const consistency = n ? 100 - pct(marketplaceName, n) : 0;
    const chromeHits = affiliateInSummary + affiliateInComplaints + affiliateInClaims + syntheticCompetitors;
    const validity = n ? Math.max(0, 100 - pct(chromeHits, n * 4) * 4) : 0;
    const uniqueness = 88;
    const timeliness = 90;
    const dqs = Math.round(
      0.3 * completeness + 0.25 * consistency + 0.2 * validity + 0.15 * uniqueness + 0.1 * timeliness,
    );

    const report = {
      sampled_at: new Date().toISOString(),
      digistore_briefs_n: n,
      status_counts: statusCounts,
      complete_pct: pct(complete, n),
      degraded_pct: pct(degraded, n),
      marketplace_brand_name_pct: pct(marketplaceName, n),
      affiliate_chrome_summary: affiliateInSummary,
      affiliate_chrome_complaints: affiliateInComplaints,
      affiliate_chrome_claims: affiliateInClaims,
      synthetic_competitors: syntheticCompetitors,
      avg_confidence: avgConf,
      sources_total: sourcesTotal,
      sources_rich_content_text: richContent,
      sources_rich_pct: pct(richContent, sourcesTotal),
      dqs_estimate: dqs,
    };

    console.log("\nDigistore enrichment DQS snapshot");
    console.table([report]);

    if (n) {
      console.log("\nLatest briefs (sample):");
      console.table(
        briefs.slice(0, 10).map((r) => ({
          id: r.product_id,
          name: String(r.name || "").slice(0, 40),
          status: r.enrichment_status,
          conf: r.confidence_score,
        })),
      );
    }

    if (write) {
      const outDir = path.join(process.cwd(), "docs/research/apf-improvement-roadmap");
      fs.mkdirSync(outDir, { recursive: true });
      const day = new Date().toISOString().slice(0, 10);
      const outPath = path.join(outDir, `${day}_dqs-snapshot.md`);
      const md = `# Digistore enrichment DQS snapshot — ${day}

**N:** ${n} Digistore briefs (limit ${limit})  
**DQS estimate:** **${dqs} / 100** (directional; not full audit re-score)

| Metric | Value |
|--------|------:|
| complete | ${complete} (${pct(complete, n)}%) |
| complete_degraded | ${degraded} (${pct(degraded, n)}%) |
| products.name marketplace brand | ${marketplaceName} (${pct(marketplaceName, n)}%) |
| affiliate chrome in summary | ${affiliateInSummary} |
| affiliate chrome in complaints | ${affiliateInComplaints} |
| affiliate chrome in claims | ${affiliateInClaims} |
| synthetic competitors | ${syntheticCompetitors} |
| avg confidence | ${avgConf ?? "n/a"} |
| sources with content_text≥50 | ${richContent} / ${sourcesTotal} (${pct(richContent, sourcesTotal)}%) |

\`\`\`json
${JSON.stringify(report, null, 2)}
\`\`\`

**Next:** If complete% stays near 0, keep search healthy then re-enrich one product at a time (§9). Do not declare production-ready until complete briefs dominate and affiliate chrome is near zero.
`;
      fs.writeFileSync(outPath, md);
      console.log(`\nWrote ${outPath}`);
    }
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
