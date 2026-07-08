import { spawn } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import mysql from "mysql2/promise";

type Marketplace = "warriorplus" | "digistore24" | "clickbank" | "shareasale";

type ScriptResult = {
  code: number;
  stdout: string;
  stderr: string;
};

function finiteNumber(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function repoRoot() {
  return process.cwd();
}

async function runNodeScript(
  script: string,
  args: string[] = [],
  timeoutMs = 15 * 60 * 1000,
  userId?: number
): Promise<ScriptResult> {
  const cwd = repoRoot();

  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd,
      env: {
        ...process.env,
        ...(Number.isFinite(userId) && userId! > 0
          ? { APF_USER_ID: String(userId) }
          : (process.env.APF_USER_ID ? { APF_USER_ID: process.env.APF_USER_ID } : {})),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`Script timed out after ${Math.round(timeoutMs / 1000)}s: node ${script} ${args.join(" ")}`));
    }, timeoutMs);

    child.stdout.on("data", chunk => {
      const s = String(chunk);
      stdout += s;
      process.stdout.write(`[workflow:${path.basename(script)}] ${s}`);
    });

    child.stderr.on("data", chunk => {
      const s = String(chunk);
      stderr += s;
      process.stderr.write(`[workflow:${path.basename(script)}] ${s}`);
    });

    child.on("error", err => {
      clearTimeout(timer);
      reject(err);
    });

    child.on("close", code => {
      clearTimeout(timer);
      const result = { code: finiteNumber(code), stdout, stderr };

      if (code === 0) {
        resolve(result);
      } else {
        reject(new Error(`Script failed (${code}): node ${script} ${args.join(" ")}\n${stderr || stdout}`));
      }
    });
  });
}

async function productCount(platform: Marketplace, userId: number): Promise<number> {
  if (!process.env.DATABASE_URL) return 0;

  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    const [rows] = await conn.query(
      `SELECT COUNT(*) AS count FROM products WHERE userId=? AND platform=?`,
      [userId, platform]
    ) as any[];

    return finiteNumber(rows?.[0]?.count, 0);
  } finally {
    await conn.end();
  }
}

export async function runPostRefreshWorkflow(platform: Marketplace, userId: number) {
  const steps: string[] = [];

  if (platform === "clickbank") {
    steps.push("clickbank_native_score_from_importer");
  }

  const reviewRuns = Math.max(0, Math.min(10, finiteNumber(process.env.APF_REFRESH_REVIEW_RUNS, 1)));

  for (let i = 0; i < reviewRuns; i++) {
    await runNodeScript("scripts/review-enrichment-worker.mjs", ["--once"], 10 * 60 * 1000, userId);
    steps.push("review_enrichment_once");
  }

  if (platform === "digistore24") {
    await runNodeScript("scripts/marketplace-score-backfill.mjs", ["--marketplace", "digistore24"], 5 * 60 * 1000, userId);
    steps.push("digistore24_score_backfill");
  }

  return {
    steps,
    productsCount: await productCount(platform, userId),
  };
}

export async function runDigistore24RefreshWorkflow(userId: number) {
  const before = await productCount("digistore24", userId);

  const limit = String(Math.max(1, Math.min(200, finiteNumber(process.env.DIGISTORE24_REFRESH_LIMIT, 50))));

  const collectorArgs = ["collect", "--ensure", "--limit", limit];

  if (process.env.DIGISTORE24_AUTO_PROMOTE === "true" || process.env.DIGISTORE24_AUTO_PROMOTE === "1") {
    collectorArgs.push("--promote");
  }

  if (process.env.DIGISTORE24_CONFIRM_PROMOTE === "true" || process.env.DIGISTORE24_CONFIRM_PROMOTE === "1") {
    collectorArgs.push("--confirm-promote");
  }

  await runNodeScript(
    "scripts/digistore24-daemon-client.mjs",
    collectorArgs,
    15 * 60 * 1000,
    userId
  );

  const post = await runPostRefreshWorkflow("digistore24", userId);
  const after = await productCount("digistore24", userId);

  return {
    success: true,
    productsCount: after,
    importedOrUpdatedCount: Math.max(0, after - before),
    steps: ["digistore24_firefox_collector", ...post.steps],
    message: "Digistore24 refresh complete. Products were collected, scored, and review enrichment was run.",
  };
}

export async function exportProductsToShadowCast(userId: number, productIds: number[]) {
  const uniqueIds = Array.from(new Set(productIds.map(x => finiteNumber(x)).filter(x => x > 0))).slice(0, 100);
  const metaById = new Map<number, { name: string; enrichmentStatus: string }>();

  if (uniqueIds.length === 0) {
    throw new Error("No products selected.");
  }

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL missing from APF .env");
  }

  const directLibUrl = pathToFileURL(path.resolve(repoRoot(), "scripts/shadowcast-direct-lib.mjs")).href;
  const directLib = await import(directLibUrl) as {
    sendToShadowCast: (productId: number) => Promise<any>;
  };

  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    const [rows] = await conn.query(
      `SELECT
         p.id,
         p.name,
         COALESCE(b.enrichment_status, 'pending') AS enrichmentStatus
       FROM products p
       LEFT JOIN product_review_briefs b ON b.product_id = p.id
       WHERE p.userId=? AND p.id IN (${uniqueIds.map(() => "?").join(",")})`,
      [userId, ...uniqueIds]
    ) as any[];

    const allowed = new Set((rows || []).map((r: any) => Number(r.id)));
    for (const r of (rows || [])) {
      metaById.set(Number(r.id), {
        name: String(r.name || `Product #${r.id}`),
        enrichmentStatus: String(r.enrichmentStatus || "pending"),
      });
    }
    const denied = uniqueIds.filter(id => !allowed.has(id));

    if (denied.length) {
      throw new Error(`Some selected products were not found for this APF user: ${denied.join(", ")}`);
    }
  } finally {
    await conn.end();
  }

  const results = [];

  for (const productId of uniqueIds) {
    const result = await directLib.sendToShadowCast(productId);
    const meta = metaById.get(productId);
    results.push({
      productId,
      name: meta?.name || `Product #${productId}`,
      openUrl: result.open_url,
      enrichmentStatus: meta?.enrichmentStatus || "pending",
      token: result.token || null,
      raw: result,
    });
  }

  return {
    success: true,
    count: results.length,
    firstOpenUrl: results[0]?.openUrl || "",
    openUrls: results.map(r => r.openUrl).filter(Boolean),
    results,
  };
}
