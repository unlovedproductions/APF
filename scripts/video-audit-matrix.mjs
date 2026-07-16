#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import mysql from "mysql2/promise";
import { queueReview, reapStaleRunningJobs } from "./apf-db-helpers.mjs";
import { buildPayload, sendToShadowCast, shadowcastBaseUrl } from "./shadowcast-direct-lib.mjs";

const APF_ROOT = process.env.APF_ROOT || process.cwd();
const REVIEW_WORKER_PATH = path.join(APF_ROOT, "scripts/review-enrichment-worker.mjs");
const EXPORT_DIR = path.join(APF_ROOT, "exports");
const FETCH_TIMEOUT_MS = Number(process.env.SHADOWCAST_AUDIT_FETCH_TIMEOUT_MS || "30000");
const ENRICHMENT_RETRY_MAX = Number(process.env.SHADOWCAST_AUDIT_ENRICHMENT_RETRIES || "3");
const RUN_LOG_PATH = process.env.SHADOWCAST_AUDIT_RUN_LOG || path.join(EXPORT_DIR, "video-audit-matrix-run.log");
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
    videoPreset: process.env.SHADOWCAST_AUDIT_PRESET || "fast",
    jobTimeoutMinutes: Number(process.env.SHADOWCAST_AUDIT_JOB_TIMEOUT_MIN || 180),
    formats: ["short_form"],
    fromStyle: "",
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
    if (token === "--preset") {
      options.videoPreset = String(argv[i + 1] || "").trim() || "fast";
      i += 1;
      continue;
    }
    if (token === "--job-timeout-min") {
      const next = Number(argv[i + 1]);
      if (!Number.isFinite(next) || next < 15) {
        throw new Error("--job-timeout-min must be >= 15.");
      }
      options.jobTimeoutMinutes = Math.floor(next);
      i += 1;
      continue;
    }
    if (token === "--formats") {
      const value = String(argv[i + 1] || "").trim().toLowerCase();
      if (value === "short" || value === "short_form") {
        options.formats = ["short_form"];
      } else if (value === "long" || value === "long_form") {
        options.formats = ["long_form"];
      } else if (value === "both" || value === "all") {
        options.formats = ["short_form", "long_form"];
      } else {
        throw new Error("--formats must be short, long, or both.");
      }
      i += 1;
      continue;
    }
    if (token === "--limit") {
      const next = Number(argv[i + 1]);
      if (!Number.isFinite(next) || next < 1) {
        throw new Error("--limit must be a positive integer.");
      }
      options.limit = Math.floor(next);
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
    if (token === "--from-style") {
      options.fromStyle = String(argv[i + 1] || "").trim();
      if (!options.fromStyle) {
        throw new Error("--from-style requires a content style name.");
      }
      i += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }

  if (options.fromStyle && !CONTENT_STYLES.includes(options.fromStyle)) {
    throw new Error(`--from-style must be one of: ${CONTENT_STYLES.join(", ")}`);
  }

  return options;
}

function logLine(message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  fs.mkdirSync(EXPORT_DIR, { recursive: true });
  fs.appendFileSync(RUN_LOG_PATH, `${line}\n`);
  console.log(message);
}

function stylesForRun(fromStyle) {
  if (!fromStyle) return CONTENT_STYLES;
  const index = CONTENT_STYLES.indexOf(fromStyle);
  if (index < 0) {
    throw new Error(`Unknown content style: ${fromStyle}`);
  }
  return CONTENT_STYLES.slice(index);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shadowcastRoot() {
  if (process.env.SHADOWCAST_ROOT) {
    return path.resolve(process.env.SHADOWCAST_ROOT);
  }
  return path.resolve(APF_ROOT, "..", "shadowcast-");
}

function shadowcastOutputDir() {
  return path.join(shadowcastRoot(), "backend", "output");
}

function shadowcastPythonBin() {
  const root = shadowcastRoot();
  for (const candidate of [
    path.join(root, ".venv", "bin", "python"),
    path.join(root, "venv", "bin", "python"),
  ]) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return "python3";
}

async function fetchJson(url, init = {}) {
  const res = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  return res;
}

function apfBaseUrl() {
  const fromEnv = String(process.env.APF_BASE_URL || "").trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  return "http://127.0.0.1:3001";
}

async function appHealthOk(url, appName) {
  const res = await fetchJson(url);
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

function runReviewWorkerOnce(productId) {
  const args = [REVIEW_WORKER_PATH, "--once", "--product-id", String(productId)];
  const result = spawnSync(process.execPath, args, {
    cwd: APF_ROOT,
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(`review-enrichment-worker exited with code ${result.status}`);
  }
}

async function ensureEnrichmentComplete(conn, productId, timeoutMs = 15 * 60 * 1000) {
  await reapStaleRunningJobs(conn);
  await queueReview(conn, productId);

  const deadline = Date.now() + timeoutMs;
  let retries = 0;

  while (Date.now() < deadline) {
    const state = await getEnrichmentState(conn, productId);
    if (state.briefStatus === "complete") {
      return state;
    }

    if (state.jobStatus === "pending_api_key" || state.briefStatus === "failed") {
      const reason = state.errorMessage ? ` (${state.errorMessage})` : "";
      throw new Error(`Enrichment failed for product ${productId}: ${state.jobStatus || state.briefStatus}${reason}`);
    }

    if (state.jobStatus === "failed") {
      if (retries >= ENRICHMENT_RETRY_MAX) {
        const reason = state.errorMessage ? ` (${state.errorMessage})` : "";
        throw new Error(`Enrichment failed for product ${productId} after ${retries} retries${reason}`);
      }
      retries += 1;
      logLine(`Enrichment retry ${retries}/${ENRICHMENT_RETRY_MAX} for product ${productId}`);
      await queueReview(conn, productId);
      await sleep(1500);
      continue;
    }

    if (state.jobStatus === "running") {
      await reapStaleRunningJobs(conn);
    }

    runReviewWorkerOnce(productId);
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

async function startGenerateJob(productInfo, style, videoPreset, formats) {
  const requestBody = {
    product_info: productInfo,
    hook_types: ["curiosity"],
    formats,
    content_style: style,
    video_preset: videoPreset,
  };

  const res = await fetchJson(new URL("/api/generate", shadowcastBaseUrl()), {
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

async function validateJobResult(jobId, formats) {
  const resultsUrl = new URL(`/api/results/${encodeURIComponent(jobId)}`, shadowcastBaseUrl());
  const res = await fetchJson(resultsUrl);
  if (!res.ok) {
    throw new Error(`Results check failed for ${jobId}: ${res.status}`);
  }

  const body = await res.json();
  const errors = [
    ...(Array.isArray(body?.errors) ? body.errors : []),
    ...(Array.isArray(body?.script_errors) ? body.script_errors : []),
    ...(Array.isArray(body?.other_errors) ? body.other_errors : []),
  ];
  if (errors.length) {
    throw new Error(`ShadowCast job ${jobId} completed with errors: ${JSON.stringify(errors.slice(0, 5))}`);
  }

  const outputDir = path.join(shadowcastOutputDir(), jobId);
  const missing = [];
  for (const fmt of formats) {
    const suffix = fmt === "long_form" ? "_long.mp4" : "_short.mp4";
    const matches = fs.existsSync(outputDir)
      ? fs.readdirSync(outputDir).filter((name) => name.endsWith(suffix))
      : [];
    if (!matches.length) {
      missing.push(fmt);
    }
  }

  if (missing.length) {
    throw new Error(`ShadowCast job ${jobId} missing video artifacts for: ${missing.join(", ")}`);
  }

  return body;
}

async function waitForJob(jobId, timeoutMs = 180 * 60 * 1000, formats = ["short_form"]) {
  const statusUrl = new URL(`/api/status/${encodeURIComponent(jobId)}`, shadowcastBaseUrl());
  const deadline = Date.now() + timeoutMs;
  let lastStep = "";

  while (Date.now() < deadline) {
    const res = await fetchJson(statusUrl);
    if (!res.ok) {
      throw new Error(`Status check failed for ${jobId}: ${res.status}`);
    }

    const body = await res.json();
    const status = String(body?.status || "").toLowerCase();
    const step = String(body?.current_step || "");
    const progress = body?.progress ?? "?";
    if (step && step !== lastStep) {
      logLine(`[${jobId}] ${progress}% — ${step}`);
      lastStep = step;
    }

    if (status === "completed" || status === "complete") {
      logLine(`[${jobId}] complete (${progress}%)`);
      return validateJobResult(jobId, formats);
    }
    if (status === "failed" || status === "error") {
      throw new Error(`ShadowCast job ${jobId} failed: ${JSON.stringify(body?.errors || body?.error || [])}`);
    }

    await sleep(15000);
  }

  throw new Error(`ShadowCast job ${jobId} timed out after ${Math.round(timeoutMs / 60000)} minutes.`);
}

function runClaimAuditForJobs(jobIds) {
  const auditScript = path.join(shadowcastRoot(), "backend", "video_claim_audit.py");
  if (!fs.existsSync(auditScript)) {
    logLine(`Claim audit skipped: ${auditScript} not found`);
    return { skipped: true, failures: 0 };
  }

  let failures = 0;
  for (const jobId of jobIds) {
    const outputDir = path.join(shadowcastOutputDir(), jobId);
    if (!fs.existsSync(outputDir)) {
      logLine(`Claim audit skipped for ${jobId}: output dir missing`);
      failures += 1;
      continue;
    }

    const result = spawnSync(
      shadowcastPythonBin(),
      [auditScript, "--output-dir", outputDir, "--require-videos"],
      { cwd: shadowcastRoot(), stdio: "inherit" },
    );
    if (result.status !== 0) {
      failures += 1;
      logLine(`Claim audit failed for job ${jobId}`);
    } else {
      logLine(`Claim audit passed for job ${jobId}`);
    }
  }

  return { skipped: false, failures };
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
  const stylesToRun = stylesForRun(options.fromStyle);

  logLine(
    `Audit matrix starting (preset=${options.videoPreset}, timeout=${options.jobTimeoutMinutes}m, formats=${options.formats.join(", ")}, styles=${stylesToRun.join(", ")})`,
  );

  if (!options.skipStart) {
    const apfBase = (await discoverApfBaseUrl()) || apfBaseUrl();
    const healthTimeoutMs = Number(process.env.SHADOWCAST_AUDIT_HEALTH_TIMEOUT_MS || "180000");
    await checkHealth(`${apfBase}/api/health`, "APF", healthTimeoutMs);
    await checkHealth(`${shadowcastBaseUrl()}/api/health`, "ShadowCast", healthTimeoutMs);
  }

  const summary = {
    startedAt: new Date().toISOString(),
    options,
    styles: stylesToRun,
    products: [],
    errors: [],
    claimAudit: null,
    jobIds: [],
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
          productSummary.jobs = stylesToRun.map((style) => ({
            style,
            dryRun: true,
            hook_types: ["curiosity"],
            formats: options.formats,
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

        const sendResult = await sendToShadowCast(product.id).catch((error) => {
          const message = error?.message || String(error);
          logLine(`ShadowCast import warning for product ${product.id}: ${message}`);
          return null;
        });
        productSummary.openUrl = String(sendResult?.open_url || "");

        for (let styleIndex = 0; styleIndex < stylesToRun.length; styleIndex += 1) {
          const style = stylesToRun[styleIndex];
          try {
            logLine(`Style ${styleIndex + 1}/${stylesToRun.length}: ${style}`);
            const productInfo = toProductInfo(payload, style);
            const generateStart = await startGenerateJob(productInfo, style, options.videoPreset, options.formats);
            const jobId = String(generateStart.job_id);
            logLine(`Style ${style} job started: ${jobId}`);
            summary.jobIds.push(jobId);
            const status = await waitForJob(jobId, options.jobTimeoutMinutes * 60 * 1000, options.formats);
            productSummary.jobs.push({
              style,
              jobId,
              status: String(status?.status || "unknown"),
            });
            logLine(`Style ${style} finished: ${jobId} (${status?.status || "unknown"})`);
          } catch (styleError) {
            const message = styleError?.message || String(styleError);
            logLine(`Style ${style} failed: ${message}`);
            productSummary.jobs.push({ style, status: "failed", error: message });
            summary.errors.push({ productId: product.id, style, message });
          }
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

  if (summary.jobIds.length && !options.dryRun) {
    summary.claimAudit = runClaimAuditForJobs([...new Set(summary.jobIds)]);
    if (summary.claimAudit.failures) {
      summary.errors.push({
        message: `Claim audit failed for ${summary.claimAudit.failures} job(s)`,
      });
    }
    fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));
  }

  logLine(`Summary: ${outPath}`);
  logLine(`Products processed: ${summary.totalProducts}`);
  logLine(`Jobs finished: ${summary.totalJobs}`);
  logLine(`Video preset: ${options.videoPreset}, job timeout: ${options.jobTimeoutMinutes} min, formats: ${options.formats.join(", ")}`);
  if (summary.errors.length) {
    logLine(`Errors: ${summary.errors.length}`);
    process.exitCode = 1;
  }
}

function isMainModule() {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(path.resolve(entry)).href;
}

if (isMainModule()) {
  process.on("SIGHUP", () => {
    logLine("Received SIGHUP — ignoring (use SIGTERM to stop).");
  });

  run().catch((error) => {
    logLine(`Fatal: ${error?.message || error}`);
    process.exit(1);
  });
}
