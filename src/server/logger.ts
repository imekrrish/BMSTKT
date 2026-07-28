import pino from "pino";
import { config } from "./config.js";

export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  base: { service: "premiere-watch" },
  redact: ["req.headers.authorization", "req.headers.cookie", "smtp.pass", "resendApiKey"],
  transport: config.NODE_ENV === "development" ? { target: "pino/file", options: { destination: 1 } } : undefined
});
