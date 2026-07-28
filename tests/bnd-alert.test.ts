import { describe, expect, it } from "vitest";
import type { MonitorResult } from "../src/monitor/monitorTypes.js";
import { isBrandNewDayListed, isBrandNewDayOpen } from "../src/server/summaryEmail.js";

const base: Omit<MonitorResult, "showtimes"> = {
  status: "AVAILABLE",
  checkedAt: "2026-07-28T10:00:00.000Z",
  movieName: "The Odyssey (A)",
  movieNames: ["The Odyssey (A)", "Spider-Man: Brand New Day (UA13+)"],
  fingerprint: "fixture"
};

describe("Brand New Day immediate alert", () => {
  it("detects a listing before tickets open", () => {
    const result = { ...base, showtimes: [{ movieName: "Spider-Man: Brand New Day (UA13+)", time: "11:30 AM", enabled: false }] };
    expect(isBrandNewDayListed(result)).toBe(true);
    expect(isBrandNewDayOpen(result)).toBe(false);
  });

  it("does not use another movie's enabled showtime", () => {
    expect(isBrandNewDayOpen({
      ...base,
      showtimes: [
        { movieName: "The Odyssey (A)", time: "08:45 AM", enabled: true },
        { movieName: "Spider-Man: Brand New Day (UA13+)", time: "11:30 AM", enabled: false }
      ]
    })).toBe(false);
  });

  it("alerts when a Brand New Day showtime itself is enabled", () => {
    expect(isBrandNewDayOpen({
      ...base,
      showtimes: [{ movieName: "Spider-Man: Brand New Day (UA13+)", time: "11:30 AM", enabled: true }]
    })).toBe(true);
  });
});
