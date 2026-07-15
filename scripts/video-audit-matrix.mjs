#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import mysql from "mysql2/promise";
import { queueReview } from "./apf-db-helpers.mjs";
import { buildPayload, sendToShadowCast, shadowcastBaseUrl } from "./shadowcast-direct-lib.mjs";

const APF_ROOT = "/home/unloved/APF";
const REVIEW_WORKER_PATH = path.join(APF_ROOT, "scripts/review-enrichment-worker.mjs");
const EXPORT_DIR = path.join(APF_ROOT, "exports");
const CONTENT_STYLES = [
  "honest_review",
  "elimination",
  "worth_it_or_waste",
  "budget_challenge",
  "vs_battle",
  "standard",
];

function parseArgs(argv) {
  const options = {
    limit: 1,
    platform: "",
    dryRun: false,
    skipStart: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (token === "--skip-start") {
      options.skipStart = true;
      continue;
    }
    if (token === "--limit") {
      const next = Number(argv[i + 1]);
      if (!Number.isFinite(next) || next < 1) {
        throw new Error("--limit must be a positive integer.");
      }
      options.limit = Math.min(2, Math.floor(next));
      i += 1;
      continue;
    }
    if (token === "--platform") {
      options.platform = String(argv[i + 1] || "").trim();
      if (!options.platform) {
        throw new Error("--platform requires a value.");
      }
      i += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }

  return options;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function apfBaseUrl() {
  const fromEnv = String(process.env.APF_BASE_URL || "").trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  return "http://127.0.0.1:3001";
}

async function appHealthOk(url, appName) {
  const res = await fetch(url);
  if (!res.ok) return false;
  const body = await res.json();
  return body?.app === appName && body?.status === "ok";
}

async function discoverApfBaseUrl() {
  const ports = Array.from({ length: 11 }, (_, index) => 3000 + index);
  for (const port of ports) {
    const base = `http://127.0.0.1:${port}`;
    try {
      if (await appHealthOk(`${base}/api/health`, "APF")) return base;
    } catch {
      // try next port
    }
  }
  return null;
}

async function checkHealth(url, appName, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = "unknown";
  while (Date.now() < deadline) {
    try {
      if (await appHealthOk(url, appName)) return true;
      lastError = `missing or invalid ${appName} health payload`;
    } catch (error) {
      lastError = error?.message || String(error);
    }
    await sleep(1200);
  }
  throw new Error(`Health check failed for ${url}: ${lastError}`);
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} missing.`);
  return value;
}

async function db() {
  return mysql.createConnection(requireEnv("DATABASE_URL"));
}

async function selectProducts(conn, limit, platform) {
  const normalizedPlatform = String(platform || "").trim();
  const [rows] = await conn.query(
    `
      SELECT
        p.id,
        p.name,
        p.platform,
        p.hiddenGemScore
      FROM products p
      WHERE
        COALESCE(p.hiddenGemScore, 0) > 0
        AND (? = '' OR p.platform = ?)
      ORDER BY
        COALESCE(p.hiddenGemScore, 0) DESC,
        COALESCE(p.lastUpdatedAt, p.createdAt) DESC
      LIMIT ?
    `,
    [normalizedPlatform, normalizedPlatform, limit],
  );

  return rows.map((row) => ({
    id: Number(row.id),
    name: String(row.name || ""),
    platform: String(row.platform || ""),
    score: Number(row.hiddenGemScore || 0),
  }));
}

async function getEnrichmentState(conn, productId) {
  const [rows] = await conn.query(
    `
      SELECT
        b.enrichment_status AS brief_status,
        j.status AS job_status,
        j.error_message
      FROM products p
      LEFT JOIN product_review_briefs b ON b.product_id = p.id
      LEFT JOIN review_enrichment_jobs j ON j.product_id = p.id
      WHERE p.id = ?
      LIMIT 1
    `,
    [productId],
  );

  const row = rows[0] || {};
  return {
    briefStatus: String(row.brief_status || ""),
    jobStatus: String(row.job_status || ""),
    errorMessage: String(row.error_message || ""),
  };
}

function runReviewWorkerOnce() {
  const result = spawnSync(process.execPath, [REVIEW_WORKER_PATH, "--once"], {
    cwd: APF_ROOT,
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(`review-enrichment-worker exited with code ${result.status}`);
  }
}

async function ensureEnrichmentComplete(conn, productId, timeoutMs = 15 * 60 * 1000) {
  await queueReview(conn, productId);

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = await getEnrichmentState(conn, productId);
    if (state.briefStatus === "complete") {
      return state;
    }

    if (state.jobStatus === "failed" || state.jobStatus === "pending_api_key" || state.briefStatus === "failed") {
      const reason = state.errorMessage ? ` (${state.errorMessage})` : "";
      throw new Error(`Enrichment failed for product ${productId}: ${state.jobStatus || state.briefStatus}${reason}`);
    }

    runReviewWorkerOnce();
    await sleep(1200);
  }

  throw new Error(`Enrichment timeout for product ${productId}`);
}

function toStringOrEmpty(value) {
  return value == null ? "" : String(value);
}

function toArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((entry) => String(entry)).filter(Boolean);
  if (typeof value === "string") return value.split(",").map((entry) => entry.trim()).filter(Boolean);
  return [];
}

function toProductInfo(payload, style) {
  const source = payload?.shadowcast_import || {};
  const product = payload?.product || {};

  return {
    product_name: toStringOrEmpty(source.product_name || product.name),
    niche: toStringOrEmpty(source.niche || product.category || "General"),
    key_features: toArray(source.key_features),
    price: toStringOrEmpty(source.price),
    affiliate_link: toStringOrEmpty(source.affiliate_link || product.affiliate_url),
    keywords: toArray(source.keywords || product.keywords),
    target_audience: toStringOrEmpty(source.target_audience),
    product_category: toStringOrEmpty(source.product_category || product.category),
    competitors: toArray(source.competitors),
    unique_selling_point: toStringOrEmpty(source.unique_selling_point),
    discount_info: toStringOrEmpty(source.discount_info),
    coupon_code: toStringOrEmpty(source.coupon_code),
    common_complaints: toStringOrEmpty(source.common_complaints),
    common_praises: toStringOrEmpty(source.common_praises),
    who_not_for: toStringOrEmpty(source.who_not_for),
    series_name: toStringOrEmpty(source.series_name),
    price_comparison: toStringOrEmpty(source.price_comparison),
    content_style: style,
  };
}

async function startGenerateJob(productInfo, style) {
  const requestBody = {
    product_info: productInfo,
    hook_types: ["curiosity"],
    formats: ["short_form", "long_form"],
    content_style: style,
    video_preset: "medium",
  };

  const res = await fetch(new URL("/api/generate", shadowcastBaseUrl()), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });

  if (!res.ok) {
    throw new Error(`Generate failed ${res.status}: ${(await res.text()).slice(0, 800)}`);
  }

  const body = await res.json();
  if (!body?.job_id) throw new Error("Generate response missing job_id.");
  return body;
}

async function waitForJob(jobId, timeoutMs = 45 * 60 * 1000) {
  const statusUrl = new URL(`/api/status/${encodeURIComponent(jobId)}`, shadowcastBaseUrl());
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const res = await fetch(statusUrl);
    if (!res.ok) {
      throw new Error(`Status check failed for ${jobId}: ${res.status}`);
    }

    const body = await res.json();
    const status = String(body?.status || "").toLowerCase();

    if (status === "completed" || status === "complete") return body;
    if (status === "failed" || status === "error") {
      throw new Error(`ShadowCast job ${jobId} failed: ${JSON.stringify(body?.errors || body?.error || [])}`);
    }

    await sleep(8000);
  }

  throw new Error(`ShadowCast job ${jobId} timed out.`);
}

function writeSummary(summary) {
  fs.mkdirSync(EXPORT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = path.join(EXPORT_DIR, `video-audit-matrix-${stamp}.json`);
  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));
  return outPath;
}

async function run() {
  const options = parseArgs(process.argv.slice(2));

  if (!options.skipStart) {
    const apfBase = (await discoverApfBaseUrl()) || apfBaseUrl();
    await checkHealth(`${apfBase}/api/health`, "APF");
    await checkHealth("http://127.0.0.1:8000/api/health", "ShadowCast");
  }

  const summary = {
    startedAt: new Date().toISOString(),
    options,
    styles: CONTENT_STYLES,
    products: [],
    errors: [],
  };

  const conn = await db();
  try {
    const products = await selectProducts(conn, options.limit, options.platform);
    if (!products.length) {
      throw new Error("No eligible products found. Need hiddenGemScore > 0.");
    }

    for (const product of products) {
      const productSummary = {
        id: product.id,
        name: product.name,
        platform: product.platform,
        score: product.score,
        enrichment: null,
        openUrl: "",
        jobs: [],
      };

      try {
        if (options.dryRun) {
          productSummary.enrichment = await getEnrichmentState(conn, product.id);
          productSummary.jobs = CONTENT_STYLES.map((style) => ({
            style,
            dryRun: true,
            hook_types: ["curiosity"],
            formats: ["short_form", "long_form"],
          }));
          summary.products.push(productSummary);
          continue;
        }

        const enrichmentState = await ensureEnrichmentComplete(conn, product.id);
        productSummary.enrichment = enrichmentState;

        const payload = await buildPayload(product.id);
        if (payload?.review_enrichment?.status !== "complete") {
          throw new Error(
            `Refusing send for product ${product.id}: review_enrichment.status=${payload?.review_enrichment?.status || "missing"}`,
          );
        }

        const sendResult = await sendToShadowCast(product.id);
        productSummary.openUrl = String(sendResult?.open_url || "");

        for (const style of CONTENT_STYLES) {
          const productInfo = toProductInfo(payload, style);
          const generateStart = await startGenerateJob(productInfo, style);
          const jobId = String(generateStart.job_id);
          const status = await waitForJob(jobId);
          productSummary.jobs.push({
            style,
            jobId,
            status: String(status?.status || "unknown"),
          });
        }

        summary.products.push(productSummary);
      } catch (error) {
        productSummary.error = error?.message || String(error);
        summary.errors.push({
          productId: product.id,
          message: productSummary.error,
        });
        summary.products.push(productSummary);
      }
    }
  } finally {
    await conn.end();
  }

  summary.completedAt = new Date().toISOString();
  summary.totalProducts = summary.products.length;
  summary.totalJobs = summary.products.reduce((acc, item) => acc + (item.jobs?.length || 0), 0);
  const outPath = writeSummary(summary);

  console.log(`Summary: ${outPath}`);
  console.log(`Products processed: ${summary.totalProducts}`);
  console.log(`Jobs finished: ${summary.totalJobs}`);
  if (summary.errors.length) {
    console.log(`Errors: ${summary.errors.length}`);
  }
  console.log("Run video audit:");
  console.log("cd /home/unloved/shadowcast- && .venv/bin/python backend/video_claim_audit.py --require-videos");
}

run().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
