import { createHash } from "node:crypto";
import type { MonitorResult, Showtime } from "./monitorTypes.js";

export function availabilityFingerprint(showtimes: Showtime[]): string {
  const normalized = showtimes
    .filter((s) => s.enabled)
    .map((s) => ({
      time: s.time.trim().toUpperCase(),
      movieName: s.movieName?.trim().toUpperCase() || "",
      format: s.format?.trim().toUpperCase() || "",
      language: s.language?.trim().toUpperCase() || "",
      url: s.bookingUrl || ""
    }))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

export function resultFingerprint(result: Pick<MonitorResult, "status" | "showtimes" | "reason">): string {
  if (result.status === "AVAILABLE") return availabilityFingerprint(result.showtimes);
  return createHash("sha256").update(JSON.stringify({
    status: result.status,
    showtimes: result.showtimes.map(({ time, enabled }) => ({ time, enabled })),
    reason: result.reason || ""
  })).digest("hex");
}
