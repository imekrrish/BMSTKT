import nodemailer from "nodemailer";
import { formatInTimeZone } from "date-fns-tz";
import { config } from "./config.js";
import { logger } from "./logger.js";
import type { MonitorResult } from "../monitor/monitorTypes.js";

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const recipient = () => config.EMAIL_TO;
export const maskedRecipient = () => {
  const [name, domain] = recipient().split("@");
  return domain ? `${name.slice(0, 2)}***@${domain}` : "Not configured";
};

async function deliver(subject: string, text: string, html: string) {
  if (!recipient() || !config.EMAIL_FROM) throw new Error("EMAIL_TO and EMAIL_FROM must be configured");
  if (config.DRY_RUN) {
    logger.info({ subject, to: maskedRecipient() }, "DRY_RUN: email would be sent");
    return { dryRun: true };
  }
  if (config.RESEND_API_KEY) {
    const response = await fetch(config.RESEND_API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: config.EMAIL_FROM, to: [recipient()], subject, text, html })
    });
    if (!response.ok) throw new Error(`Resend returned ${response.status}: ${(await response.text()).slice(0, 300)}`);
    return { dryRun: false };
  }
  if (config.SMTP_HOST) {
    const transporter = nodemailer.createTransport({
      host: config.SMTP_HOST, port: config.SMTP_PORT, secure: config.SMTP_SECURE,
      auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASS } : undefined
    });
    await transporter.sendMail({ from: config.EMAIL_FROM, to: recipient(), subject, text, html });
    return { dryRun: false };
  }
  throw new Error("Configure SMTP_HOST or RESEND_API_KEY");
}

export async function sendAvailabilityEmail(result: MonitorResult) {
  const times = result.showtimes.filter((s) => s.enabled).map((s) => `${s.time}${s.format ? ` · ${s.format}` : ""}${s.language ? ` · ${s.language}` : ""}`);
  const detectedAt = formatInTimeZone(new Date(result.checkedAt), config.TIMEZONE, "dd MMMM yyyy, hh:mm:ss a zzz");
  const signals = result.signals?.join(", ") || "enabled showtime and actionable booking control";
  const movie = result.movieName || "Premiere";
  const text = `Tickets appear to be available\n\nMovie: ${movie}\nCinema: Allu Cinemas, Kokapet\nDate: 29 July 2026\nShowtimes: ${times.join(", ")}\nDetected: ${detectedAt}\nSignals: ${signals}\n\nBook now: ${config.TARGET_URL}\n\nAvailability may change quickly.`;
  const html = `<!doctype html><html><body style="margin:0;background:#0b0b0c;color:#f6f3ee;font-family:Arial,sans-serif"><div style="max-width:600px;margin:auto;padding:40px 24px"><p style="color:#e34b4b;font-weight:bold;letter-spacing:.12em">PREMIERE WATCH</p><h1>Tickets appear to be available</h1><p style="color:#aaa">Availability may change quickly.</p><div style="background:#171719;border:1px solid #29292c;border-radius:14px;padding:22px;margin:24px 0"><p><b>Movie</b><br>${escapeHtml(movie)}</p><p><b>Cinema</b><br>Allu Cinemas, Kokapet</p><p><b>Date</b><br>29 July 2026</p><p><b>Showtimes</b><br>${times.map(escapeHtml).join("<br>")}</p><p><b>Detected</b><br>${escapeHtml(detectedAt)}</p><p><b>Detector signals</b><br>${escapeHtml(signals)}</p></div><a href="${escapeHtml(config.TARGET_URL)}" style="display:block;text-align:center;background:#d83b3b;color:white;padding:16px;border-radius:10px;text-decoration:none;font-weight:bold">Book Now</a><p style="font-size:12px;color:#777;word-break:break-all;margin-top:24px">${escapeHtml(config.TARGET_URL)}</p></div></body></html>`;
  return deliver("🎟️ Allu Cinemas Premiere Tickets Are Open", text, html);
}

export function sendTestEmail() {
  return deliver("Premiere Watch test email", "Your Premiere Watch email configuration is working.", "<div style=\"font-family:Arial\"><h2>Premiere Watch</h2><p>Your email configuration is working.</p></div>");
}

export function sendBlockedWarning(reason: string) {
  return deliver("Premiere Watch needs attention", `The public page check was blocked.\n\n${reason}\n\nThe monitor will retry normally and will not attempt to bypass access protection.`, `<h2>Premiere Watch needs attention</h2><p>The public page check was blocked.</p><p>${escapeHtml(reason)}</p><p>The monitor will retry normally and will not attempt to bypass access protection.</p>`);
}
