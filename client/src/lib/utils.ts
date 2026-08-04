import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * ShadowCast auto-export gate. Only `complete` is ready by default.
 * `complete_degraded` is finished work but quarantined from export (use CLI --force).
 */
export function isEnrichmentExportReady(status: string | null | undefined) {
  return status === "complete";
}

/** Brief finished (complete or degraded) — used for queue skip / display, not export. */
export function isEnrichmentFinished(status: string | null | undefined) {
  return status === "complete" || status === "complete_degraded";
}
