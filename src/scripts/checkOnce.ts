import { BrowserManager } from "../monitor/browser.js";
import { fetchPage } from "../monitor/fetchPage.js";
import { detectAvailability } from "../monitor/detectAvailability.js";

const browser = new BrowserManager();
try {
  const result = detectAvailability(await fetchPage(browser));
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.status === "ERROR" ? 1 : 0;
} finally {
  await browser.close();
}
