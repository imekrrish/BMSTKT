import { chromium, type Browser } from "playwright";
import { logger } from "../server/logger.js";

export class BrowserManager {
  private browser?: Browser;

  async get(): Promise<Browser> {
    if (!this.browser?.isConnected()) {
      this.browser = await chromium.launch({ headless: true, args: ["--disable-dev-shm-usage", "--no-sandbox"] });
      this.browser.on("disconnected", () => { this.browser = undefined; });
      logger.info("Chromium browser started");
    }
    return this.browser;
  }

  async recreate() {
    await this.close();
    return this.get();
  }

  async close() {
    const browser = this.browser;
    this.browser = undefined;
    await browser?.close().catch(() => undefined);
  }
}
