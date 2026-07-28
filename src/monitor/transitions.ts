import type { MonitorResult } from "./monitorTypes.js";

export function shouldNotifyAvailability(previous: MonitorResult | undefined, current: MonitorResult, notifiedFingerprints: ReadonlySet<string>): boolean {
  if (current.status !== "AVAILABLE" || notifiedFingerprints.has(current.fingerprint)) return false;
  if (!previous || previous.status !== "AVAILABLE") return true;
  const prior = new Set(previous.showtimes.filter((s) => s.enabled).map((s) => `${s.time}|${s.format || ""}|${s.language || ""}`));
  return current.showtimes.some((s) => s.enabled && !prior.has(`${s.time}|${s.format || ""}|${s.language || ""}`));
}
