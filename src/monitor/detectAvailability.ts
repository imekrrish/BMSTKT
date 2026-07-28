import { availabilityFingerprint, resultFingerprint } from "./fingerprints.js";
import { extractShowtimes, type PageSnapshot } from "./extractShowtimes.js";
import { detectionConfig } from "./selectors.js";
import type { MonitorResult, MonitorStatus } from "./monitorTypes.js";

export function detectAvailability(snapshot: PageSnapshot, checkedAt = new Date().toISOString()): MonitorResult {
  const text = `${snapshot.title} ${snapshot.bodyText}`.slice(0, 200_000);
  const blocked = detectionConfig.blockedPatterns.find((pattern) => pattern.test(text));
  if (blocked) return finish("BLOCKED", [], checkedAt, snapshot, `Access protection detected: ${blocked.source}`);

  const showtimes = extractShowtimes(snapshot);
  const enabled = showtimes.filter((show) => show.enabled);
  const strong = enabled.filter((show) => {
    const signals = show.signals || [];
    return signals.includes("visible showtime text") &&
      signals.includes("enabled state") &&
      (signals.includes("booking URL") || signals.includes("actionable control")) &&
      signals.length >= 3;
  });

  const cinemaSignal = /allu\s+cinemas?|kokapet/i.test(text);
  const dateSignal = /29(?:th)?\s+(?:jul|july)|(?:jul|july)\s+29|2026-07-29|29\/07\/2026/i.test(text);
  if (strong.length && cinemaSignal && dateSignal) {
    const signals = ["target cinema context", "target date context", "visible structured showtime", "enabled actionable booking control"];
    if (strong.some((s) => s.bookingUrl)) signals.push("relevant booking URL");
    return finish("AVAILABLE", showtimes, checkedAt, snapshot, undefined, signals);
  }

  if (showtimes.length || detectionConfig.unavailablePatterns.some((pattern) => pattern.test(text))) {
    return finish("NOT_AVAILABLE", showtimes, checkedAt, snapshot, enabled.length ? "Showtime context could not be tied to both target cinema and date" : undefined);
  }

  const meaningful = text.replace(/\s+/g, " ").length > 150;
  if (!meaningful || !cinemaSignal) {
    return finish("PAGE_CHANGED", [], checkedAt, snapshot, "Expected target cinema and recognizable availability structure were not found");
  }
  return finish("NOT_AVAILABLE", [], checkedAt, snapshot, "No bookable showtimes detected");
}

function finish(status: MonitorStatus, showtimes: ReturnType<typeof extractShowtimes>, checkedAt: string, snapshot: PageSnapshot, reason?: string, signals?: string[]): MonitorResult {
  const partial = {
    status, checkedAt, showtimes, pageTitle: snapshot.title || undefined,
    movieName: snapshot.movieName || inferMovie(snapshot.title),
    movieNames: snapshot.movieNames?.length ? snapshot.movieNames : [snapshot.movieName || inferMovie(snapshot.title)].filter((value): value is string => Boolean(value)),
    cinemaName: snapshot.cinemaName || (/allu\s+cinemas?.{0,30}kokapet/i.exec(snapshot.bodyText)?.[0] ?? undefined),
    reason, signals
  };
  return { ...partial, fingerprint: status === "AVAILABLE" ? availabilityFingerprint(showtimes) : resultFingerprint(partial) };
}

function inferMovie(title: string) {
  return title.split(/\s+(?:movie tickets|tickets|at allu|[-|])/i)[0]?.trim() || undefined;
}
