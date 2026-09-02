import type { ClientContext } from "../client/client-context";

export const USER_ACTIVITY_TRACKER_LIMIT = 8;
export const USER_ACTIVITY_MAX_CREDITABLE_GAP_MS = 45_000;

export class UserActivityTrackerLimitError extends Error {
  constructor() {
    super("Too many active browser activity trackers for this user.");
    this.name = "UserActivityTrackerLimitError";
  }
}

export type UserActivityPulseState = "active" | "hidden" | "idle";
export type UserActivityPresenceState = "active" | "idle" | "offline";

export type UserActivityPulse = {
  trackerId: string;
  sequence: number;
  state: UserActivityPulseState;
  localDate: string;
  timeZone: string;
};

export type UserActivityRecordOptions = {
  offlineThresholdMs: number;
  maxCreditableGapMs: number;
};

export type UserActivityReceipt = {
  accepted: boolean;
  state: UserActivityPresenceState;
  activeSecondsToday: number;
  receivedAt: string;
};

export type UserActivityPresenceOutboxPayload = {
  kind: "presence";
  external_key: string;
  client_external_id: string;
  user_external_id: string;
  state: UserActivityPresenceState;
  last_seen_at: string;
  source_updated_at: string;
};

export type UserActivityDailyOutboxPayload = {
  kind: "daily";
  external_key: string;
  client_external_id: string;
  user_external_id: string;
  activity_date: string;
  time_zone: string;
  first_active_at: string | null;
  last_active_at: string | null;
  active_seconds: number;
  session_count: number;
  source_updated_at: string;
};

export type UserActivityIntervalOutboxPayload = {
  kind: "interval";
  external_key: string;
  client_external_id: string;
  user_external_id: string;
  interval_id: string;
  activity_date: string;
  time_zone: string;
  started_at: string;
  ended_at: string;
  active_seconds: number;
  source_updated_at: string;
};

export type UserActivityOutboxPayload =
  | UserActivityPresenceOutboxPayload
  | UserActivityDailyOutboxPayload
  | UserActivityIntervalOutboxPayload;

export type UserActivityRepository = {
  recordPulse(
    context: ClientContext,
    pulse: UserActivityPulse,
    receivedAt: Date,
    options: UserActivityRecordOptions
  ): Promise<UserActivityReceipt>;
  reconcileExpired(receivedAt: Date, options: UserActivityRecordOptions): Promise<number>;
};

export type UserActivityIntervalSnapshot = {
  intervalId: string;
  clientId: string;
  userId: string;
  localDate: string;
  timeZone: string;
  startedAt: string;
  endedAt: string;
  activeMilliseconds: number;
};

export type UserActivityDailySnapshot = {
  clientId: string;
  userId: string;
  localDate: string;
  timeZone: string;
  firstActiveAt: string | null;
  lastActiveAt: string | null;
  activeMilliseconds: number;
  sessionCount: number;
};

export type UserActivitySnapshot = {
  presence: Array<{
    clientId: string;
    userId: string;
    state: UserActivityPresenceState;
    lastSeenAt: string;
  }>;
  intervals: UserActivityIntervalSnapshot[];
  daily: UserActivityDailySnapshot[];
  outbox: UserActivityOutboxPayload[];
};
