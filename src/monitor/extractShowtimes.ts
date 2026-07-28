import { detectionConfig } from "./selectors.js";
import type { Showtime } from "./monitorTypes.js";

export type ElementSnapshot = {
  tag: string;
  text: string;
  href?: string;
  disabled: boolean;
  visible: boolean;
  context: string;
  attributes: Record<string, string>;
  movieName?: string;
};

export type PageSnapshot = {
  title: string;
  bodyText: string;
  html: string;
  url: string;
  elements: ElementSnapshot[];
  movieName?: string;
  movieNames?: string[];
  cinemaName?: string;
};

const clean = (value: string) => value.replace(/\s+/g, " ").trim();

export function extractShowtimes(snapshot: PageSnapshot): Showtime[] {
  const candidates: Showtime[] = [];
  for (const element of snapshot.elements) {
    if (!element.visible) continue;
    const combined = clean(`${element.text} ${element.context}`);
    const match = combined.match(detectionConfig.timePattern);
    if (!match) continue;

    const time = match[0].replace(/\s+/g, " ").toUpperCase();
    const knownShowtimeControl = /(?:^|\s)(?:showtime|show-time|show_time)(?:\s|$)/i.test(element.attributes.class || "") || "data-showtime" in element.attributes;
    const actionableTag = element.tag === "A" || element.tag === "BUTTON" || /^(button|link)$/i.test(element.attributes.role || "") || knownShowtimeControl;
    const bookingHref = Boolean(element.href && /(buytickets|seat|booking|book)/i.test(element.href));
    const bookingText = detectionConfig.bookingTextPattern.test(combined);
    const enabled = !element.disabled && (actionableTag || bookingHref || bookingText);
    const signals: string[] = ["visible showtime text"];
    if (actionableTag) signals.push("actionable control");
    if (bookingHref) signals.push("booking URL");
    if (bookingText) signals.push("booking action text");
    if (!element.disabled) signals.push("enabled state");

    const format = combined.match(/\b(IMAX|4DX|MX4D|DOLBY|SCREENX|2D|3D)\b/i)?.[0].toUpperCase();
    const language = combined.match(/\b(Telugu|Hindi|English|Tamil|Malayalam|Kannada)\b/i)?.[0];
    candidates.push({ time, movieName: element.movieName, format, language, bookingUrl: bookingHref ? element.href : undefined, enabled, signals });
  }

  const unique = new Map<string, Showtime>();
  for (const item of candidates) {
    const key = `${item.movieName || ""}|${item.time}|${item.format || ""}|${item.language || ""}`;
    const prior = unique.get(key);
    if (!prior || (!prior.enabled && item.enabled) || (!prior.bookingUrl && item.bookingUrl)) unique.set(key, item);
  }
  return [...unique.values()].sort((a, b) => a.time.localeCompare(b.time));
}

export function snapshotFromHtml(html: string, url = "https://in.bookmyshow.com/cinemas/HYD/allu-cinemas-kokapet/buytickets/ALUC/20260729"): PageSnapshot {
  const title = clean(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
  const elements: ElementSnapshot[] = [];
  const tagPattern = /<(a|button|div|li|span)([^>]*)>([\s\S]*?)<\/\1>/gi;
  for (const match of html.matchAll(tagPattern)) {
    const attributes = Object.fromEntries([...match[2].matchAll(/([\w:-]+)(?:=["']([^"']*)["'])?/g)].map((m) => [m[1].toLowerCase(), m[2] || ""]));
    const text = clean(match[3].replace(/<[^>]+>/g, " "));
    elements.push({
      tag: match[1].toUpperCase(),
      text,
      href: attributes.href ? new URL(attributes.href, url).toString() : undefined,
      disabled: "disabled" in attributes || attributes["aria-disabled"] === "true" || /\b(disabled|sold-out)\b/i.test(attributes.class || ""),
      visible: !/display\s*:\s*none|visibility\s*:\s*hidden/i.test(attributes.style || "") && attributes["aria-hidden"] !== "true",
      context: text,
      attributes
    });
  }
  const bodyText = clean(html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " "));
  return { title, bodyText, html, url, elements };
}
