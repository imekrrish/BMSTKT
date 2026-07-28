export type Status = "AVAILABLE" | "NOT_AVAILABLE" | "BLOCKED" | "PAGE_CHANGED" | "ERROR" | "CHECKING" | "PAUSED";
export type Showtime = { time: string; format?: string; language?: string; bookingUrl?: string; enabled: boolean };
export type Result = { id?: string; status: Status; checkedAt: string; showtimes: Showtime[]; movieName?: string; cinemaName?: string; reason?: string; durationMs?: number };
export type State = {
  currentStatus: Status; lastSuccessfulCheck?: string; lastAttemptedCheck?: string; lastResult?: Result;
  lastError?: string; lastBlockedReason?: string; consecutiveFailures: number; notificationHistory: unknown[];
  history: Result[]; monitoringEnabled: boolean; checkIntervalSeconds: number; startedAt: string; nextCheckAt?: string;
  checking: boolean; targetUrl: string; targetCinema: string; targetDate: string; emailRecipient: string; uptimeSeconds: number;
};
