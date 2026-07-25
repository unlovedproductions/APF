import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Finished review enrichment — eligible for ShadowCast export. */
export function isEnrichmentExportReady(status: string | null | undefined) {
  return status === "complete" || status === "complete_degraded";
}
