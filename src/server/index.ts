import { resolve } from "node:path";
import cookieParser from "cookie-parser";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { config } from "./config.js";
import { issueSession, isAuthenticated, passwordMatches, requireAuth } from "./auth.js";
import { sendTestEmail, maskedRecipient } from "./email.js";
import { logger } from "./logger.js";
import { StateStore } from "./stateStore.js";
import { MonitorWorker } from "../monitor/monitorWorker.js";

const store = new StateStore();
await store.init();
const worker = new MonitorWorker(store);
const app = express();
app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(pinoHttp({ logger }));
app.use(express.json({ limit: "20kb" }));
app.use(cookieParser());
app.use("/api", rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: "draft-7", legacyHeaders: false }));
const controlsLimiter = rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: "draft-7", legacyHeaders: false });

app.get("/api/health", (_req, res) => {
  const state = store.get();
  res.status(state.consecutiveFailures >= 10 ? 503 : 200).json({ ok: state.consecutiveFailures < 10, status: state.currentStatus, uptimeSeconds: Math.floor(process.uptime()) });
});
app.get("/api/auth", (req, res) => res.json({ required: config.authEnabled, authenticated: isAuthenticated(req) }));
app.post("/api/login", controlsLimiter, (req, res) => {
  if (!config.authEnabled || passwordMatches(req.body?.password)) {
    issueSession(res);
    res.json({ ok: true });
  } else res.status(401).json({ error: "Incorrect password" });
});
app.post("/api/logout", (_req, res) => { res.clearCookie("pw_session"); res.json({ ok: true }); });
app.get("/api/status", requireAuth, (_req, res) => {
  const state = store.get();
  res.json({ ...state, targetUrl: config.TARGET_URL, targetCinema: config.TARGET_CINEMA, targetDate: config.TARGET_DATE, emailRecipient: maskedRecipient(), uptimeSeconds: Math.floor(process.uptime()) });
});
app.get("/api/history", requireAuth, (_req, res) => res.json(store.get().history));
app.post("/api/check-now", requireAuth, controlsLimiter, async (_req, res) => {
  const result = await worker.checkNow("manual");
  if (!result) res.status(409).json({ error: "A check is already running" });
  else res.json(result);
});
app.post("/api/test-email", requireAuth, controlsLimiter, async (_req, res, next) => {
  try {
    const delivery = await sendTestEmail();
    await store.recordNotification({ fingerprint: `test-${Date.now()}`, sentAt: new Date().toISOString(), kind: "test", recipient: config.EMAIL_TO, dryRun: delivery.dryRun });
    res.json({ ok: true, dryRun: delivery.dryRun });
  } catch (error) { next(error); }
});
app.post("/api/monitor/start", requireAuth, controlsLimiter, (_req, res) => { worker.start(true); res.json({ ok: true }); });
app.post("/api/monitor/stop", requireAuth, controlsLimiter, async (_req, res) => { await worker.stop(); res.json({ ok: true }); });
app.patch("/api/settings", requireAuth, controlsLimiter, async (req, res) => {
  const interval = Number(req.body?.checkIntervalSeconds);
  if (!Number.isInteger(interval) || interval < 30 || interval > 3600) return res.status(400).json({ error: "checkIntervalSeconds must be an integer between 30 and 3600" });
  await store.patch({ checkIntervalSeconds: interval });
  res.json({ ok: true, checkIntervalSeconds: interval });
});

const clientDir = resolve("dist/client");
if (config.NODE_ENV === "production") {
  app.use(express.static(clientDir, { maxAge: "1h", index: false }));
  app.get("*", (_req, res) => res.sendFile(resolve(clientDir, "index.html")));
}
app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  void _next;
  logger.error({ err: error }, "Request failed");
  res.status(500).json({ error: error?.message || "Internal server error" });
});

const server = app.listen(config.PORT, () => {
  logger.info({ port: config.PORT, intervalSeconds: store.get().checkIntervalSeconds, dataPath: config.dataPath }, "Premiere Watch started");
  if (store.get().monitoringEnabled) worker.start(true);
});
let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Graceful shutdown started");
  server.close();
  await worker.shutdown();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("unhandledRejection", (error) => logger.fatal({ err: error }, "Unhandled rejection"));
process.on("uncaughtException", (error) => { logger.fatal({ err: error }, "Uncaught exception"); void shutdown("uncaughtException"); });
