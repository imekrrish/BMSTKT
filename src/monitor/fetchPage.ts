import type { Page } from "playwright";
import { config } from "../server/config.js";
import { BrowserManager } from "./browser.js";
import type { PageSnapshot } from "./extractShowtimes.js";
import { detectionConfig } from "./selectors.js";

export async function fetchPage(manager: BrowserManager): Promise<PageSnapshot> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    let page: Page | undefined;
    try {
      const browser = attempt === 0 ? await manager.get() : await manager.recreate();
      const context = await browser.newContext({
        locale: "en-IN",
        timezoneId: config.TIMEZONE,
        viewport: { width: 1440, height: 1000 },
        userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        javaScriptEnabled: true
      });
      page = await context.newPage();
      page.setDefaultNavigationTimeout(35_000);
      await page.route("**/*", async (route) => {
        const type = route.request().resourceType();
        if (type === "font" || type === "media") await route.abort();
        else await route.continue();
      });
      await page.goto(config.TARGET_URL, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
      await page.waitForTimeout(2_000);
      const snapshot = await page.evaluate(({ selectors }) => {
        const isVisible = (el: Element) => {
          const style = getComputedStyle(el);
          const box = el.getBoundingClientRect();
          return style.display !== "none" && style.visibility !== "hidden" && box.width > 0 && box.height > 0;
        };
        const nodes = [...document.querySelectorAll(selectors.join(","))].slice(0, 1500);
        const elements = nodes.map((el) => {
          const parent = el.closest("[class*='show'], [class*='cinema'], [class*='venue'], li, section") || el.parentElement;
          const attrs: Record<string, string> = {};
          for (const attr of el.attributes) attrs[attr.name] = attr.value;
          return {
            tag: el.tagName,
            text: (el.textContent || "").trim(),
            href: el instanceof HTMLAnchorElement ? el.href : undefined,
            disabled: el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true" || /\b(disabled|sold-out)\b/i.test(el.className || ""),
            visible: isVisible(el),
            context: (parent?.textContent || "").trim().slice(0, 500),
            attributes: attrs
          };
        });
        const firstText = (items: string[]) => {
          for (const selector of items) {
            const value = document.querySelector(selector)?.textContent?.trim();
            if (value) return value;
          }
        };
        return {
          title: document.title, bodyText: document.body?.innerText || "", html: document.documentElement.outerHTML,
          url: location.href, elements,
          movieName: firstText(["h1", "[data-testid*='movie']", "[class*='movie-name']"]),
          movieNames: [...new Set([...document.querySelectorAll("h1, h2, h3, [data-testid*='movie'], [class*='movie-name'], [class*='film-name']")].map((element) => (element.textContent || "").trim()).filter((text) => text.length >= 2 && text.length <= 120 && !/allu cinemas|kokapet|showtime|date/i.test(text)))].slice(0, 30),
          cinemaName: firstText(["[data-testid*='cinema']", "[class*='cinema-name']", "[class*='venue-name']", "h2"])
        };
      }, { selectors: [...detectionConfig.showtimeSelectors, ...detectionConfig.movieSelectors, ...detectionConfig.cinemaSelectors] });
      await page.context().close();
      return snapshot;
    } catch (error) {
      lastError = error;
      await page?.context().close().catch(() => undefined);
    }
  }
  throw lastError;
}
