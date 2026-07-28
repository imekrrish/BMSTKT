import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { HistoryEntry, MonitorResult, MonitorState, NotificationEntry } from "../monitor/monitorTypes.js";
import { config } from "./config.js";
import { logger } from "./logger.js";

const stateFile = join(config.dataPath, "premiere-watch-state.json");
const initialState = (): MonitorState => ({
  currentStatus: "NOT_AVAILABLE",
  consecutiveFailures: 0,
  notificationFingerprints: [],
  notificationHistory: [],
  history: [],
  monitoringEnabled: true,
  checkIntervalSeconds: config.CHECK_INTERVAL_SECONDS,
  startedAt: new Date().toISOString(),
  checking: false
});

export class StateStore {
  private state = initialState();
  private writeQueue = Promise.resolve();

  async init() {
    await mkdir(config.dataPath, { recursive: true });
    try {
      this.state = { ...initialState(), ...JSON.parse(await readFile(stateFile, "utf8")), checking: false, startedAt: new Date().toISOString() };
    } catch (error: any) {
      if (error.code !== "ENOENT") logger.warn({ err: error }, "State file could not be loaded; starting fresh");
      await this.persist();
    }
  }

  get(): MonitorState { return structuredClone(this.state); }

  async patch(update: Partial<MonitorState>) {
    this.state = { ...this.state, ...update };
    await this.persist();
  }

  async record(result: MonitorResult) {
    const success = result.status === "AVAILABLE" || result.status === "NOT_AVAILABLE" || result.status === "PAGE_CHANGED";
    const entry: HistoryEntry = { ...result, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}` };
    this.state = {
      ...this.state,
      currentStatus: result.status,
      checking: false,
      lastResult: result,
      lastAttemptedCheck: result.checkedAt,
      lastSuccessfulCheck: success ? result.checkedAt : this.state.lastSuccessfulCheck,
      lastError: result.status === "ERROR" ? result.reason : undefined,
      lastBlockedReason: result.status === "BLOCKED" ? result.reason : this.state.lastBlockedReason,
      consecutiveFailures: result.status === "ERROR" ? this.state.consecutiveFailures + 1 : 0,
      history: [entry, ...this.state.history].slice(0, 100)
    };
    await this.persist();
  }

  hasNotified(fingerprint: string) { return this.state.notificationFingerprints.includes(fingerprint); }

  async recordNotification(entry: NotificationEntry) {
    this.state.notificationHistory = [entry, ...this.state.notificationHistory].slice(0, 100);
    if (entry.kind === "availability" && !this.state.notificationFingerprints.includes(entry.fingerprint)) {
      this.state.notificationFingerprints = [...this.state.notificationFingerprints, entry.fingerprint].slice(-1000);
    }
    await this.persist();
  }

  private persist() {
    const data = JSON.stringify(this.state, null, 2);
    this.writeQueue = this.writeQueue.then(async () => {
      const temp = `${stateFile}.tmp`;
      await writeFile(temp, data, { mode: 0o600 });
      await rename(temp, stateFile);
    });
    return this.writeQueue;
  }
}
