export type MonitorStatus = "AVAILABLE" | "NOT_AVAILABLE" | "BLOCKED" | "PAGE_CHANGED" | "ERROR";

export type Showtime = {
  time: string;
  movieName?: string;
  format?: string;
  language?: string;
  bookingUrl?: string;
  enabled: boolean;
  signals?: string[];
};

export type MonitorResult = {
  status: MonitorStatus;
  checkedAt: string;
  movieName?: string;
  movieNames?: string[];
  cinemaName?: string;
  showtimes: Showtime[];
  pageTitle?: string;
  reason?: string;
  fingerprint: string;
  signals?: string[];
  durationMs?: number;
};

export type HistoryEntry = MonitorResult & { id: string };

export type NotificationEntry = {
  fingerprint: string;
  sentAt: string;
  kind: "availability" | "summary" | "test" | "blocked-warning";
  recipient: string;
  dryRun?: boolean;
};

export type MonitorState = {
  currentStatus: MonitorStatus | "CHECKING" | "PAUSED";
  lastSuccessfulCheck?: string;
  lastAttemptedCheck?: string;
  lastResult?: MonitorResult;
  lastError?: string;
  lastBlockedReason?: string;
  consecutiveFailures: number;
  notificationFingerprints: string[];
  notificationHistory: NotificationEntry[];
  history: HistoryEntry[];
  monitoringEnabled: boolean;
  checkIntervalSeconds: number;
  startedAt: string;
  nextCheckAt?: string;
  checking: boolean;
};
