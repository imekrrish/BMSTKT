import { formatInTimeZone } from "date-fns-tz";
import { config } from "./config.js";
import type { MonitorResult } from "../monitor/monitorTypes.js";

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => (
  { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]!
));

export function isBrandNewDayOpen(result: MonitorResult) {
  const pattern = new RegExp(config.ALERT_MOVIE_PATTERN, "i");
  return result.showtimes.some((show) => show.enabled && pattern.test(show.movieName || ""));
}

export async function sendCinemaSummaryEmail(result: MonitorResult) {
  if (!config.RESEND_API_KEY) throw new Error("RESEND_API_KEY must be configured");
  if (!config.EMAIL_FROM || !config.EMAIL_TO) throw new Error("EMAIL_FROM and EMAIL_TO must be configured");
  const movies = result.movieNames?.length ? result.movieNames : [result.movieName || "No movie title detected"];
  const movie = movies.join(", ");
  const available = result.showtimes.filter((show) => show.enabled);
  const pattern = new RegExp(config.ALERT_MOVIE_PATTERN, "i");
  const bndListed = movies.some((name) => pattern.test(name)) || result.showtimes.some((show) => pattern.test(show.movieName || ""));
  const bndOpen = isBrandNewDayOpen(result);
  const bndStatus = bndOpen ? "OPEN - bookable shows detected" : bndListed ? "Listed, but no bookable shows detected" : "Not listed on this page";
  const shows = available.length
    ? available.map((show) => `${show.movieName || movie}: ${show.time}${show.format ? ` - ${show.format}` : ""}${show.language ? ` - ${show.language}` : ""}`)
    : ["No enabled showtimes detected"];
  const checked = formatInTimeZone(new Date(result.checkedAt), config.TIMEZONE, "dd MMMM yyyy, hh:mm:ss a zzz");
  const subject = bndOpen ? "Spider-Man: Brand New Day tickets are OPEN" : `Allu Cinemas - ${config.SUMMARY_EMAIL_INTERVAL_MINUTES} minute availability summary`;
  const text = `Spider-Man: Brand New Day: ${bndStatus}\nOfficial release: 31 July 2026\n\nMovies listed:\n${movies.join("\n")}\n\nAvailable shows:\n${shows.join("\n")}\n\nStatus: ${result.status}\nChecked: ${checked}\n${result.reason || ""}\n\n${config.TARGET_URL}`;
  const html = `<div style="max-width:620px;margin:auto;background:#111;color:#f5f2ed;padding:30px;font-family:Arial,sans-serif"><p style="color:#ef5757;font-weight:bold">PREMIERE WATCH</p><h1>Allu Cinemas availability</h1><div style="background:#1a1a1c;border-radius:12px;padding:18px"><h2>Spider-Man: Brand New Day</h2><p><b>${escapeHtml(bndStatus)}</b></p><p>Official release: 31 July 2026</p></div><h3>Movies listed</h3><ul>${movies.map((name) => `<li>${escapeHtml(name)}</li>`).join("")}</ul><h3>Available shows</h3><ul>${shows.map((show) => `<li>${escapeHtml(show)}</li>`).join("")}</ul><p>Status: <b>${result.status}</b><br>Checked: ${escapeHtml(checked)}</p><a href="${escapeHtml(config.TARGET_URL)}" style="display:block;text-align:center;background:#d94444;color:#fff;padding:14px;border-radius:9px;text-decoration:none">Open BookMyShow</a></div>`;
  if (config.DRY_RUN) return { dryRun: true };
  const response = await fetch(config.RESEND_API_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: config.EMAIL_FROM, to: [config.EMAIL_TO], subject, text, html })
  });
  if (!response.ok) throw new Error(`Resend returned ${response.status}: ${(await response.text()).slice(0, 300)}`);
  return { dryRun: false };
}
