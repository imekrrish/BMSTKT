export const detectionConfig = {
  timePattern: /\b(?:0?[1-9]|1[0-2]):[0-5]\d\s*(?:AM|PM)\b/i,
  bookingTextPattern: /\b(book(?:\s+tickets?)?|proceed|buy tickets?|select seats?)\b/i,
  blockedPatterns: [
    /captcha/i, /access denied/i, /temporarily blocked/i, /verify you are human/i,
    /unusual traffic/i, /cloudflare/i, /request blocked/i, /rate limit/i
  ],
  unavailablePatterns: [/no shows/i, /coming soon/i, /sales? not started/i, /booking.*not.*open/i],
  showtimeSelectors: [
    "[data-showtime]", "[data-testid*='show']", "[class*='showtime']", "[class*='show-time']",
    "a[href*='buytickets']", "a[href*='seat']", "button"
  ],
  contextSelectors: ["[class*='show']", "[class*='cinema']", "[class*='venue']", "main", "section"],
  disabledAttributes: ["disabled", "aria-disabled"],
  movieSelectors: ["h1", "[data-testid*='movie']", "[class*='movie-name']", "[class*='title']"],
  cinemaSelectors: ["[data-testid*='cinema']", "[class*='cinema-name']", "[class*='venue-name']", "h2"]
} as const;
