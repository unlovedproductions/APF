#!/usr/bin/env node
import fs from "node:fs";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { chromium } from "playwright";

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

const PROFILE_DIR =
  process.env.DIGISTORE24_BROWSER_PROFILE ||
  "/home/unloved/.config/unloved-digistore24-browser";

const START_URL =
  "https://www.digistore24-app.com/app/en/affiliate/account/marketplace/all";

console.log("Opening Digistore24 login browser.");
console.log("Profile:", PROFILE_DIR);
console.log("");
console.log("Log into Digistore24 completely in the browser window.");
console.log("Do not press Enter here until you can see the marketplace/account page.");
console.log("");

const browser = await chromium.launchPersistentContext(PROFILE_DIR, {
  headless: false,
  viewport: { width: 1440, height: 1000 }
});

const page = browser.pages()[0] || await browser.newPage();
await page.goto(START_URL, { waitUntil: "domcontentloaded", timeout: 60000 });

const rl = readline.createInterface({ input, output });
await rl.question("After login is complete, press Enter here to save the session and close the browser...");
rl.close();

await browser.close();

console.log("");
console.log("Digistore24 login session saved.");
console.log("Now run:");
console.log("  pnpm run digistore24:browser -- --limit 50");
