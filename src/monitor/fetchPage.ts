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
        const titleCandidates = [...document.querySelectorAll("h1, h2, h3, h4, strong, a, span, div")];
        const inferMovieName = (control: Element) => {
          const box = control.getBoundingClientRect();
          const centerY = box.top + box.height / 2;
          const candidates = titleCandidates.map((element) => {
            const text = (element.textContent || "").replace(/\s+/g, " ").trim();
            const rect = element.getBoundingClientRect();
            return { text, rect, distanceY: Math.abs(rect.top + rect.height / 2 - centerY), distanceX: Math.abs(box.left - rect.right) };
          }).filter(({ text, rect, distanceY }) =>
            text.length >= 3 && text.length <= 100 && distanceY < 55 && rect.right <= box.left + 30 &&
            !/\b(?:0?[1-9]|1[0-2]):[0-5]\d\s*(?:AM|PM)\b/i.test(text) &&
            !/^(?:English|Telugu|Hindi|Tamil|Malayalam|Kannada|2D|3D|IMAX|Available|Fast Filling)$/i.test(text) &&
            !/Allu Cinemas|Kokapet|Dolby Cinema|Barco Laser|subtitles language|select price|select show/i.test(text) &&
            /[A-Za-z]/.test(text)
          ).sort((a, b) => a.distanceY - b.distanceY || a.distanceX - b.distanceX);
          return candidates[0]?.text;
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
            attributes: attrs,
            movieName: /\b(?:0?[1-9]|1[0-2]):[0-5]\d\s*(?:AM|PM)\b/i.test((el.textContent || "") + " " + (parent?.textContent || "")) ? inferMovieName(el) : undefined
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
          movieName: elements.find((element) => element.movieName)?.movieName,
          movieNames: [...new Set(elements.map((element) => element.movieName).filter((name): name is string => Boolean(name)))],
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
