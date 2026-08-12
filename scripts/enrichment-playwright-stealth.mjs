/**
 * Headless Chromium + playwright-extra stealth for enrichment page-fetch fallback.
 * SSRF / YouTube / extractMainText are handled by enrichment-page-fetch.mjs wrappers.
 */

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

let stealthReady = null;
let chromium = null;

function loadStealthStack() {
  if (stealthReady !== null) return stealthReady;
  try {
    const { chromium: cr } = require("playwright-extra");
    const StealthPlugin = require("puppeteer-extra-plugin-stealth");
    cr.use(StealthPlugin());
    chromium = cr;
    stealthReady = true;
  } catch {
    chromium = null;
    stealthReady = false;
  }
  return stealthReady;
}

function envFlagOn(name, defaultOn = true) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return defaultOn;
  return !/^(0|false|off|no)$/i.test(String(raw).trim());
}

function defaultMaxPerJob() {
  return Math.max(0, Number(process.env.REVIEW_ENRICHMENT_PLAYWRIGHT_STEALTH_MAX_PER_JOB || "3"));
}

function defaultTimeoutMs() {
  return Math.max(3000, Number(process.env.REVIEW_ENRICHMENT_PLAYWRIGHT_STEALTH_TIMEOUT_MS
    || process.env.REVIEW_ENRICHMENT_FETCH_TIMEOUT_MS
    || "15000"));
}

/** @type {{ used: number, max: number, browser: import('playwright').Browser | null }} */
let budget = {
  used: 0,
  max: defaultMaxPerJob(),
  browser: null,
};

export function isPlaywrightStealthEnabled(env = process.env) {
  if (!envFlagOn("REVIEW_ENRICHMENT_PLAYWRIGHT_STEALTH", true)) return false;
  return loadStealthStack();
}

export function resetPlaywrightStealthBudget(options = {}) {
  const prev = budget.browser;
  budget = {
    used: 0,
    max: Math.max(0, Number(options.max ?? defaultMaxPerJob())),
    browser: null,
  };
  if (prev) {
    prev.close().catch(() => {});
  }
  return getPlaywrightStealthBudget();
}

export function getPlaywrightStealthBudget() {
  return { used: budget.used, max: budget.max, browserOpen: Boolean(budget.browser) };
}

export function canPlaywrightStealthFetch() {
  return isPlaywrightStealthEnabled() && budget.used < budget.max;
}

async function getBrowser() {
  if (!loadStealthStack() || !chromium) {
    throw new Error("playwright-extra / stealth plugin unavailable");
  }
  if (budget.browser?.isConnected?.() !== false && budget.browser) {
    return budget.browser;
  }
  budget.browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-blink-features=AutomationControlled",
    ],
  });
  return budget.browser;
}

/**
 * Fetch page HTML with stealth Chromium.
 * @returns {Promise<{ html: string, finalUrl: string }>}
 */
export async function playwrightStealthFetch(url, options = {}) {
  if (!canPlaywrightStealthFetch()) {
    return { html: "", finalUrl: String(url || "") };
  }

  budget.used += 1;
  const timeoutMs = Math.max(3000, Number(options.timeoutMs || defaultTimeoutMs()));
  const target = String(url || "").trim();
  if (!target) return { html: "", finalUrl: "" };

  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    javaScriptEnabled: true,
    ignoreHTTPSErrors: false,
  });
  const page = await context.newPage();
  try {
    await page.goto(target, {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    });
    // Brief settle for client-rendered review bodies
    await new Promise((r) => setTimeout(r, Math.min(1500, Math.floor(timeoutMs / 10))));
    const html = await page.content();
    const finalUrl = page.url() || target;
    return { html: String(html || ""), finalUrl };
  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
  }
}

/** Close reused browser (call on process shutdown if needed). */
export async function closePlaywrightStealthBrowser() {
  if (budget.browser) {
    await budget.browser.close().catch(() => {});
    budget.browser = null;
  }
}
