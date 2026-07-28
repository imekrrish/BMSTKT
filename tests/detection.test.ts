import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { detectAvailability } from "../src/monitor/detectAvailability.js";
import { snapshotFromHtml } from "../src/monitor/extractShowtimes.js";

const fixture = (name: string) => snapshotFromHtml(readFileSync(resolve("tests/fixtures", name), "utf8"));
describe("availability detection", () => {
  it("recognizes a successful unavailable page", () => expect(detectAvailability(fixture("no-shows.html")).status).toBe("NOT_AVAILABLE"));
  it("detects bookable shows in target context", () => {
    const result = detectAvailability(fixture("shows-available.html"));
    expect(result.status).toBe("AVAILABLE");
    expect(result.showtimes[0]).toMatchObject({ time: "07:00 PM", enabled: true });
  });
  it("does not treat disabled shows as available", () => {
    const result = detectAvailability(fixture("disabled-showtimes.html"));
    expect(result.status).toBe("NOT_AVAILABLE");
    expect(result.showtimes[0].enabled).toBe(false);
  });
  it("extracts multiple shows and excludes disabled controls", () => {
    const result = detectAvailability(fixture("multiple-showtimes.html"));
    expect(result.status).toBe("AVAILABLE");
    expect(result.showtimes.filter((s) => s.enabled)).toHaveLength(2);
  });
  it("returns PAGE_CHANGED for an unrecognizable page", () => expect(detectAvailability(fixture("unexpected-layout.html")).status).toBe("PAGE_CHANGED"));
  it("returns BLOCKED before availability evaluation", () => expect(detectAvailability(fixture("access-blocked.html")).status).toBe("BLOCKED"));
});
