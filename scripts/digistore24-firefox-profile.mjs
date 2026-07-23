import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

export function getDigistore24FirefoxProfileDir() {
  return (
    process.env.DIGISTORE24_BROWSER_PROFILE ||
    path.join(process.env.HOME || "", ".config", "unloved-digistore24-firefox-profile")
  );
}

function profileLockPaths(profileDir) {
  return [
    path.join(profileDir, ".parentlock"),
    path.join(profileDir, "lock"),
  ];
}

function isProfileInUse(profileDir) {
  try {
    const out = execSync("pgrep -af firefox", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (!out) return false;
    return out.split("\n").some(line =>
      line.includes(profileDir) && /(?:-profile|--profile)\s/.test(line)
    );
  } catch {
    return false;
  }
}

export function clearStaleFirefoxProfileLock(profileDir) {
  if (!profileDir || isProfileInUse(profileDir)) {
    return { cleared: [], skipped: profileLockPaths(profileDir).filter(p => fs.existsSync(p)) };
  }

  const cleared = [];
  for (const lockPath of profileLockPaths(profileDir)) {
    if (!fs.existsSync(lockPath)) continue;
    fs.unlinkSync(lockPath);
    cleared.push(lockPath);
  }

  return { cleared, skipped: [] };
}

export function ensurePlaywrightBrowsersPath() {
  if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
    const defaultBrowsers = `${process.env.HOME || ""}/.cache/ms-playwright`;
    if (defaultBrowsers && fs.existsSync(defaultBrowsers)) {
      process.env.PLAYWRIGHT_BROWSERS_PATH = defaultBrowsers;
    }
  }
}
