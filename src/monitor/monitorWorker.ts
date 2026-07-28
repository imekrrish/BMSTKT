import { setTimeout as delay } from "node:timers/promises";
import { config } from "../server/config.js";
import { sendBlockedWarning } from "../server/email.js";
import { isBrandNewDayOpen, sendCinemaSummaryEmail } from "../server/summaryEmail.js";
import { logger } from "../server/logger.js";
import type { StateStore } from "../server/stateStore.js";
import { BrowserManager } from "./browser.js";
import { detectAvailability } from "./detectAvailability.js";
import { fetchPage } from "./fetchPage.js";
import type { MonitorResult } from "./monitorTypes.js";

export class MonitorWorker {
  private timer?: NodeJS.Timeout;
  private running = false;
  private stopped = false;
  readonly browser = new BrowserManager();

  constructor(private store: StateStore) {}

  start(immediate = true) {
    this.stopped = false;
    void this.store.patch({ monitoringEnabled: true });
    this.schedule(immediate ? 500 : this.store.get().checkIntervalSeconds * 1000);
  }

  async stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    await this.store.patch({ monitoringEnabled: false, currentStatus: "PAUSED", nextCheckAt: undefined });
  }

  async shutdown() {
    await this.stop();
    const deadline = Date.now() + 15_000;
    while (this.running && Date.now() < deadline) await delay(100);
    await this.browser.close();
  }

  async checkNow(source: "scheduled" | "manual" = "manual"): Promise<MonitorResult | null> {
    if (this.running) return null;
    this.running = true;
    const started = Date.now();
    await this.store.patch({ checking: true, currentStatus: "CHECKING", lastAttemptedCheck: new Date().toISOString() });
    let result: MonitorResult;
    try {
      const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Check exceeded the 55 second execution limit")), 55_000));
      const snapshot = await Promise.race([fetchPage(this.browser), timeout]);
      result = detectAvailability(snapshot);
      result.durationMs = Date.now() - started;
    } catch (error: any) {
      result = {
        status: "ERROR", checkedAt: new Date().toISOString(), showtimes: [],
        reason: error?.message || String(error), fingerprint: `error-${Date.now()}`, durationMs: Date.now() - started
      };
    }
    await this.store.record(result);
    await this.notify(result);
    this.running = false;
    logger.info({ source, status: result.status, durationMs: result.durationMs, showtimes: result.showtimes.length }, "Monitoring check complete");
    if (source === "scheduled" && !this.stopped) this.schedule(this.nextDelay(result));
    return result;
  }

  private async notify(result: MonitorResult) {
    const state = this.store.get();
    const bndImmediate = isBrandNewDayOpen(result) && !state.notificationFingerprints.includes(result.fingerprint);
    const lastSummary = state.notificationHistory.find((item) => item.kind === "summary" || item.kind === "availability");
    const summaryDue = !lastSummary || Date.now() - new Date(lastSummary.sentAt).getTime() >= config.SUMMARY_EMAIL_INTERVAL_MINUTES * 60_000;
    const parsedCinemaPage = (result.status === "AVAILABLE" || result.status === "NOT_AVAILABLE") && Boolean(result.movieNames?.length || result.showtimes.length);
    if ((bndImmediate || summaryDue) && parsedCinemaPage && config.EMAIL_TO) {
      try {
        const delivery = await sendCinemaSummaryEmail(result);
        await this.store.recordNotification({
          fingerprint: bndImmediate ? result.fingerprint : `summary-${Date.now()}`,
          sentAt: new Date().toISOString(),
          kind: bndImmediate ? "availability" : "summary",
          recipient: config.EMAIL_TO,
          dryRun: delivery.dryRun
        });
      } catch (error) { logger.error({ err: error }, "Cinema summary email failed"); }
    }
    if (result.status === "BLOCKED" && config.ADMIN_WARNING_EMAIL_ENABLED && config.EMAIL_TO) {
      const key = `blocked:${result.reason}`;
      if (!this.store.get().notificationHistory.some((item) => item.fingerprint === key)) {
        try {
          const delivery = await sendBlockedWarning(result.reason || "Unknown block");
          await this.store.recordNotification({ fingerprint: key, sentAt: new Date().toISOString(), kind: "blocked-warning", recipient: config.EMAIL_TO, dryRun: delivery.dryRun });
        } catch (error) { logger.error({ err: error }, "Blocked warning email failed"); }
      }
    }
  }
  private nextDelay(result: MonitorResult) {
    if (result.status !== "ERROR") return this.store.get().checkIntervalSeconds * 1000;
    const failures = this.store.get().consecutiveFailures;
    return Math.min(300, this.store.get().checkIntervalSeconds * 2 ** Math.min(failures, 3)) * 1000;
  }

  private schedule(ms: number) {
    if (this.timer) clearTimeout(this.timer);
    const nextCheckAt = new Date(Date.now() + ms).toISOString();
    void this.store.patch({ nextCheckAt });
    this.timer = setTimeout(() => void this.checkNow("scheduled"), ms);
  }
}
