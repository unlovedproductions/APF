import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * ShadowCast auto-export gate. `complete` is always ready.
 * `complete_degraded` is ready only when server policy allows degraded export.
 */
export function isEnrichmentExportReady(
  status: string | null | undefined,
  allowDegradedShadowCastExport = false,
) {
  if (status === "complete") return true;
  if (status === "complete_degraded" && allowDegradedShadowCastExport) return true;
  return false;
}

/** Brief finished (complete or degraded) — used for queue skip / display, not export. */
export function isEnrichmentFinished(status: string | null | undefined) {
  return status === "complete" || status === "complete_degraded";
}
