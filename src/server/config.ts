import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

const booleanString = z.string().default("false").transform((value) => value.toLowerCase() === "true");
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  TARGET_URL: z.string().url().default("https://in.bookmyshow.com/cinemas/HYD/allu-cinemas-kokapet/buytickets/ALUC/20260729"),
  TARGET_CINEMA: z.string().min(1).default("Allu Cinemas Kokapet"),
  TARGET_DATE: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).default("2026-07-29"),
  CHECK_INTERVAL_SECONDS: z.coerce.number().int().min(30).max(3600).default(60),
  TIMEZONE: z.string().default("Asia/Kolkata"),
  SMTP_HOST: z.string().default(""),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: booleanString,
  SMTP_USER: z.string().default(""),
  SMTP_PASS: z.string().default(""),
  EMAIL_FROM: z.string().default(""),
  EMAIL_TO: z.string().default(""),
  RESEND_API_KEY: z.string().default(""),
  RESEND_API_URL: z.string().url().default("https://api.resend.com/emails"),
  SUMMARY_EMAIL_INTERVAL_MINUTES: z.coerce.number().int().min(1).max(1440).default(30),
  ALERT_MOVIE_PATTERN: z.string().default("spider-man|brand new day|bnd"),
  ALERT_MOVIE_RELEASE_DATE: z.string().default("2026-07-31"),
  DATA_PATH: z.string().default("/data"),
  DASHBOARD_PASSWORD: z.string().default(""),
  SESSION_SECRET: z.string().default(""),
  ADMIN_WARNING_EMAIL_ENABLED: z.string().default("true").transform((v) => v.toLowerCase() === "true"),
  DRY_RUN: booleanString
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid environment configuration:\n${parsed.error.issues.map((i) => `- ${i.path.join(".")}: ${i.message}`).join("\n")}`);
}
const raw = parsed.data;
const requestedDataPath = resolve(raw.DATA_PATH);
const dataPath = existsSync(requestedDataPath) ? requestedDataPath : resolve("data");

export const config = { ...raw, dataPath, authEnabled: Boolean(raw.DASHBOARD_PASSWORD) };
export type Config = typeof config;
