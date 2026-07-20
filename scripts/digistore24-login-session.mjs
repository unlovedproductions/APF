#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { firefox } from "playwright";

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

if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  const defaultBrowsers = `${process.env.HOME || ""}/.cache/ms-playwright`;
  if (defaultBrowsers && fs.existsSync(defaultBrowsers)) {
    process.env.PLAYWRIGHT_BROWSERS_PATH = defaultBrowsers;
  }
}

const PROFILE_DIR =
  process.env.DIGISTORE24_BROWSER_PROFILE ||
  path.join(process.env.HOME || "", ".config", "unloved-digistore24-firefox-profile");

const START_URL =
  "https://www.digistore24-app.com/app/en/affiliate/account/marketplace/all";

console.log("Opening Digistore24 login browser (Firefox).");
console.log("Profile:", PROFILE_DIR);
console.log("");
console.log("Log into Digistore24 completely in the browser window.");
console.log("Do not press Enter here until you can see the marketplace/account page.");
console.log("");

fs.mkdirSync(PROFILE_DIR, { recursive: true });

const browser = await firefox.launchPersistentContext(PROFILE_DIR, {
  headless: false,
  viewport: { width: 1920, height: 1080 },
  userAgent: "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0",
  acceptDownloads: true,
});

const page = browser.pages()[0] || await browser.newPage();
await page.goto(START_URL, { waitUntil: "domcontentloaded", timeout: 60000 });

const rl = readline.createInterface({ input, output });
await rl.question("After login is complete, press Enter here to save the session and close the browser...");
rl.close();

await browser.close();

console.log("");
console.log("Digistore24 login session saved.");
console.log("Verify session:");
console.log("  pnpm run digistore24:session:check");
console.log("Start collector daemon:");
console.log("  pnpm run digistore24:daemon");
