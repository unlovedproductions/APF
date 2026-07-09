#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const [, , inputHtml, outputPdf] = process.argv;

if (!inputHtml || !outputPdf) {
  console.error("Usage: node scripts/render-html-to-pdf.mjs <input.html> <output.pdf>");
  process.exit(1);
}

const htmlPath = path.resolve(inputHtml);
const pdfPath = path.resolve(outputPdf);

if (!fs.existsSync(htmlPath)) {
  console.error(`Input not found: ${htmlPath}`);
  process.exit(1);
}

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.goto(`file://${htmlPath}`, { waitUntil: "load" });
  await page.pdf({
    path: pdfPath,
    format: "Letter",
    printBackground: true,
    margin: { top: "20mm", right: "20mm", bottom: "20mm", left: "20mm" },
  });
  console.log(`Wrote ${pdfPath}`);
} finally {
  await browser.close();
}
