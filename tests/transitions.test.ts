import { describe, expect, it } from "vitest";
import { shouldNotifyAvailability } from "../src/monitor/transitions.js";
import type { MonitorResult } from "../src/monitor/monitorTypes.js";

const result = (status: MonitorResult["status"], times: string[], fingerprint = times.join(",")): MonitorResult => ({
  status, checkedAt: new Date().toISOString(), showtimes: times.map((time) => ({ time, enabled: true })), fingerprint
});
describe("notification state transitions", () => {
  it("alerts on unavailable to available", () => expect(shouldNotifyAvailability(result("NOT_AVAILABLE", []), result("AVAILABLE", ["7 PM"], "a"), new Set())).toBe(true));
  it("does not alert for an unchanged notified fingerprint", () => expect(shouldNotifyAvailability(result("AVAILABLE", ["7 PM"], "a"), result("AVAILABLE", ["7 PM"], "a"), new Set(["a"]))).toBe(false));
  it("alerts for a newly added showtime", () => expect(shouldNotifyAvailability(result("AVAILABLE", ["7 PM"], "a"), result("AVAILABLE", ["7 PM", "10 PM"], "b"), new Set(["a"]))).toBe(true));
  it.each(["BLOCKED", "PAGE_CHANGED", "ERROR", "NOT_AVAILABLE"] as const)("never alerts for %s", (status) => expect(shouldNotifyAvailability(undefined, result(status, ["7 PM"], "x"), new Set())).toBe(false));
});
