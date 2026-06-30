#!/usr/bin/env node
import fs from "node:fs";
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

const profileDir =
  process.env.DIGISTORE24_BROWSER_PROFILE ||
  "/home/unloved/.config/unloved-digistore24-firefox-profile";

const startUrl =
  "https://www.digistore24-app.com/app/en/affiliate/account/marketplace/all";

fs.mkdirSync(profileDir, { recursive: true });

console.log("Digistore24 persistent Firefox session check");
console.log("Profile:", profileDir);
console.log("");

const context = await firefox.launchPersistentContext(profileDir, {
  headless: false,
  viewport: { width: 1440, height: 1000 },
  acceptDownloads: true,
});

const page =
  context.pages().find(p => /digistore24/i.test(p.url())) ||
  context.pages()[0] ||
  await context.newPage();

await page.goto(startUrl, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});

await page.waitForTimeout(3000);

let currentUrl = page.url();
let title = await page.title().catch(() => "");

console.log("Current URL:", currentUrl);
console.log("Title:", title);

const cookiesBefore = await context.cookies();
const digistoreCookiesBefore = cookiesBefore.filter(c =>
  /digistore24|ds24/i.test(c.domain)
);

console.log("Digistore cookies before manual action:", digistoreCookiesBefore.length);

const rl = readline.createInterface({ input, output });

console.log("");
console.log("If you are on the login page, log in fully now.");
console.log("After you can see the marketplace/account page, press Enter here.");
console.log("");

await rl.question("Press Enter after login/session check is complete...");
rl.close();

await page.waitForTimeout(2000);

currentUrl = page.url();
title = await page.title().catch(() => "");

const cookiesAfter = await context.cookies();
const digistoreCookiesAfter = cookiesAfter.filter(c =>
  /digistore24|ds24/i.test(c.domain)
);

fs.mkdirSync("exports", { recursive: true });
fs.writeFileSync(
  "exports/digistore24_session_cookies_summary.json",
  JSON.stringify(
    digistoreCookiesAfter.map(c => ({
      name: c.name,
      domain: c.domain,
      path: c.path,
      expires: c.expires,
      httpOnly: c.httpOnly,
      secure: c.secure,
      sameSite: c.sameSite,
    })),
    null,
    2
  )
);

console.log("");
console.log("After manual action:");
console.log("Current URL:", currentUrl);
console.log("Title:", title);
console.log("Digistore cookies after:", digistoreCookiesAfter.length);
console.log("Cookie summary saved:");
console.log("  exports/digistore24_session_cookies_summary.json");

await context.close();

console.log("");
console.log("Session browser closed.");
console.log("Now immediately run:");
console.log("  pnpm run digistore24:session:check");
console.log("");
console.log("If it opens already logged in the second time, persistence works.");
