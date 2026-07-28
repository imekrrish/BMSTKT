import { describe, expect, it } from "vitest";
import { availabilityFingerprint } from "../src/monitor/fingerprints.js";

describe("fingerprints", () => {
  it("is stable regardless of ordering", () => {
    const a = [{ time: "07:00 PM", enabled: true }, { time: "04:00 PM", format: "2D", enabled: true }];
    expect(availabilityFingerprint(a)).toBe(availabilityFingerprint([...a].reverse()));
  });
  it("changes when a new enabled showtime appears", () => {
    expect(availabilityFingerprint([{ time: "07:00 PM", enabled: true }])).not.toBe(availabilityFingerprint([{ time: "07:00 PM", enabled: true }, { time: "10:00 PM", enabled: true }]));
  });
  it("ignores disabled showtimes", () => {
    expect(availabilityFingerprint([{ time: "07:00 PM", enabled: true }])).toBe(availabilityFingerprint([{ time: "07:00 PM", enabled: true }, { time: "10:00 PM", enabled: false }]));
  });
});
