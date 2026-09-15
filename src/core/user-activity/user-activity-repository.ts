import { randomUUID } from "node:crypto";
import type { ClientContext } from "../client/client-context";
import {
  USER_ACTIVITY_TRACKER_LIMIT,
  UserActivityTrackerLimitError,
  type UserActivityDailySnapshot,
  type UserActivityIntervalSnapshot,
  type UserActivityOutboxPayload,
  type UserActivityPresenceState,
  type UserActivityPulse,
  type UserActivityRepository,
  type UserActivitySnapshot
} from "./user-activity-types";

type TrackerState = UserActivityPulse & {
  clientId: string;
  userId: string;
  lastSeenAt: string;
  leaseExpiresAt: string;
};

type PresenceState = {
  clientId: string;
  userId: string;
  state: UserActivityPresenceState;
  activeIntervalId: string | null;
  lastAccountedAt: string;
  lastSeenAt: string;
  localDate: string;
  timeZone: string;
};

function userKey(context: Pick<ClientContext, "clientId" | "userId">): string {
  return `${context.clientId}\u0000${context.userId}`;
}

function trackerKey(context: Pick<ClientContext, "clientId" | "userId">, trackerId: string): string {
  return `${userKey(context)}\u0000${trackerId}`;
}

function dailyKey(context: Pick<ClientContext, "clientId" | "userId">, localDate: string): string {
  return `${userKey(context)}\u0000${localDate}`;
}

function derivedPresenceState(
  trackers: Iterable<TrackerState>,
  context: Pick<ClientContext, "clientId" | "userId">,
  nowMs: number
): UserActivityPresenceState {
  let hasLiveTracker = false;
  for (const tracker of trackers) {
    if (tracker.clientId !== context.clientId || tracker.userId !== context.userId) continue;
    if (Date.parse(tracker.leaseExpiresAt) <= nowMs) continue;
    hasLiveTracker = true;
    if (tracker.state === "active") return "active";
  }
  return hasLiveTracker ? "idle" : "offline";
}

function presencePayload(presence: PresenceState, updatedAt: string): UserActivityOutboxPayload {
  return {
    kind: "presence",
    external_key: `presence:${presence.clientId}:${presence.userId}`,
    client_external_id: presence.clientId,
    user_external_id: presence.userId,
    state: presence.state,
    last_seen_at: presence.lastSeenAt,
    source_updated_at: updatedAt
  };
}

function dailyPayload(daily: UserActivityDailySnapshot, updatedAt: string): UserActivityOutboxPayload {
  return {
    kind: "daily",
    external_key: `daily:${daily.clientId}:${daily.userId}:${daily.localDate}`,
    client_external_id: daily.clientId,
    user_external_id: daily.userId,
    activity_date: daily.localDate,
    time_zone: daily.timeZone,
    first_active_at: daily.firstActiveAt,
    last_active_at: daily.lastActiveAt,
    active_seconds: Math.floor(daily.activeMilliseconds / 1_000),
    session_count: daily.sessionCount,
    source_updated_at: updatedAt
  };
}

function intervalPayload(interval: UserActivityIntervalSnapshot, updatedAt: string): UserActivityOutboxPayload {
  return {
    kind: "interval",
    external_key: `interval:${interval.intervalId}`,
    client_external_id: interval.clientId,
    user_external_id: interval.userId,
    interval_id: interval.intervalId,
    activity_date: interval.localDate,
    time_zone: interval.timeZone,
    started_at: interval.startedAt,
    ended_at: interval.endedAt,
    active_seconds: Math.floor(interval.activeMilliseconds / 1_000),
    source_updated_at: updatedAt
  };
}

export type InMemoryUserActivityRepository = UserActivityRepository & {
  snapshot(): UserActivitySnapshot;
};

export function createInMemoryUserActivityRepository(): InMemoryUserActivityRepository {
  const trackers = new Map<string, TrackerState>();
  const presences = new Map<string, PresenceState>();
  const intervals = new Map<string, UserActivityIntervalSnapshot>();
  const daily = new Map<string, UserActivityDailySnapshot>();
  const outbox = new Map<string, UserActivityOutboxPayload>();

  const upsertOutbox = (payload: UserActivityOutboxPayload): void => {
    outbox.set(payload.external_key, payload);
  };

  return {
    async recordPulse(context, pulse, receivedAt, options) {
      const nowMs = receivedAt.getTime();
      const receivedAtIso = receivedAt.toISOString();
      const existingTracker = trackers.get(trackerKey(context, pulse.trackerId));
      const presence = presences.get(userKey(context));
      if (existingTracker && pulse.sequence <= existingTracker.sequence) {
        const existingDaily = daily.get(dailyKey(context, pulse.localDate));
        return {
          accepted: false,
          state: presence?.state ?? derivedPresenceState(trackers.values(), context, nowMs),
          activeSecondsToday: Math.floor((existingDaily?.activeMilliseconds ?? 0) / 1_000),
          receivedAt: receivedAtIso
        };
      }

      if (!existingTracker) {
        const liveTrackers = [...trackers.values()].filter((tracker) =>
          tracker.clientId === context.clientId
          && tracker.userId === context.userId
          && Date.parse(tracker.leaseExpiresAt) > nowMs
        );
        if (liveTrackers.length >= USER_ACTIVITY_TRACKER_LIMIT) {
          throw new UserActivityTrackerLimitError();
        }
      }

      let creditedMilliseconds = 0;
      let creditedDaily: UserActivityDailySnapshot | null = null;
      let creditedInterval: UserActivityIntervalSnapshot | null = null;
      if (presence?.state === "active") {
        creditedMilliseconds = Math.max(
          0,
          Math.min(options.maxCreditableGapMs, nowMs - Date.parse(presence.lastAccountedAt))
        );
        if (creditedMilliseconds > 0) {
          creditedDaily = daily.get(dailyKey(context, presence.localDate)) ?? {
            clientId: context.clientId,
            userId: context.userId,
            localDate: presence.localDate,
            timeZone: presence.timeZone,
            firstActiveAt: presence.lastAccountedAt,
            lastActiveAt: receivedAtIso,
            activeMilliseconds: 0,
            sessionCount: 1
          };
          creditedDaily.activeMilliseconds += creditedMilliseconds;
          creditedDaily.lastActiveAt = receivedAtIso;
          daily.set(dailyKey(context, presence.localDate), creditedDaily);
          if (presence.activeIntervalId) {
            creditedInterval = intervals.get(presence.activeIntervalId) ?? null;
            if (creditedInterval) {
              creditedInterval.endedAt = receivedAtIso;
              creditedInterval.activeMilliseconds += creditedMilliseconds;
            }
          }
        }
      }

      trackers.set(trackerKey(context, pulse.trackerId), {
        ...pulse,
        clientId: context.clientId,
        userId: context.userId,
        lastSeenAt: receivedAtIso,
        leaseExpiresAt: new Date(nowMs + options.offlineThresholdMs).toISOString()
      });
      const nextState = derivedPresenceState(trackers.values(), context, nowMs);
      const dateChangedWhileActive = presence?.state === "active"
        && nextState === "active"
        && (presence.localDate !== pulse.localDate || presence.timeZone !== pulse.timeZone);

      const nextPresence: PresenceState = presence ?? {
        clientId: context.clientId,
        userId: context.userId,
        state: nextState,
        activeIntervalId: null,
        lastAccountedAt: receivedAtIso,
        lastSeenAt: receivedAtIso,
        localDate: pulse.localDate,
        timeZone: pulse.timeZone
      };

      if ((presence?.state !== "active" && nextState === "active") || dateChangedWhileActive) {
        const intervalId = randomUUID();
        const interval: UserActivityIntervalSnapshot = {
          intervalId,
          clientId: context.clientId,
          userId: context.userId,
          localDate: pulse.localDate,
          timeZone: pulse.timeZone,
          startedAt: receivedAtIso,
          endedAt: receivedAtIso,
          activeMilliseconds: 0
        };
        intervals.set(intervalId, interval);
        nextPresence.activeIntervalId = intervalId;
        const nextDaily = daily.get(dailyKey(context, pulse.localDate)) ?? {
          clientId: context.clientId,
          userId: context.userId,
          localDate: pulse.localDate,
          timeZone: pulse.timeZone,
          firstActiveAt: receivedAtIso,
          lastActiveAt: receivedAtIso,
          activeMilliseconds: 0,
          sessionCount: 0
        };
        nextDaily.timeZone = pulse.timeZone;
        nextDaily.firstActiveAt ??= receivedAtIso;
        nextDaily.lastActiveAt = receivedAtIso;
        nextDaily.sessionCount += 1;
        daily.set(dailyKey(context, pulse.localDate), nextDaily);
        upsertOutbox(intervalPayload(interval, receivedAtIso));
        upsertOutbox(dailyPayload(nextDaily, receivedAtIso));
      } else if (presence?.state === "active" && nextState !== "active") {
        nextPresence.activeIntervalId = null;
      }

      nextPresence.state = nextState;
      nextPresence.lastAccountedAt = receivedAtIso;
      nextPresence.lastSeenAt = receivedAtIso;
      nextPresence.localDate = pulse.localDate;
      nextPresence.timeZone = pulse.timeZone;
      presences.set(userKey(context), nextPresence);

      if (creditedDaily) upsertOutbox(dailyPayload(creditedDaily, receivedAtIso));
      if (creditedInterval) upsertOutbox(intervalPayload(creditedInterval, receivedAtIso));
      upsertOutbox(presencePayload(nextPresence, receivedAtIso));

      const today = daily.get(dailyKey(context, pulse.localDate));
      return {
        accepted: true,
        state: nextState,
        activeSecondsToday: Math.floor((today?.activeMilliseconds ?? 0) / 1_000),
        receivedAt: receivedAtIso
      };
    },

    async reconcileExpired(receivedAt, options) {
      const nowMs = receivedAt.getTime();
      const updatedAt = receivedAt.toISOString();
      let reconciled = 0;
      for (const presence of presences.values()) {
        if (presence.state === "offline") continue;
        const context = { clientId: presence.clientId, userId: presence.userId };
        if (derivedPresenceState(trackers.values(), context, nowMs) !== "offline") continue;

        if (presence.state === "active") {
          const lastAccountedMs = Date.parse(presence.lastAccountedAt);
          const creditedMilliseconds = Math.max(
            0,
            Math.min(options.maxCreditableGapMs, nowMs - lastAccountedMs)
          );
          const effectiveEnd = new Date(lastAccountedMs + creditedMilliseconds).toISOString();
          const day = daily.get(dailyKey(context, presence.localDate));
          if (day && creditedMilliseconds > 0) {
            day.activeMilliseconds += creditedMilliseconds;
            day.lastActiveAt = effectiveEnd;
            upsertOutbox(dailyPayload(day, updatedAt));
          }
          const interval = presence.activeIntervalId
            ? intervals.get(presence.activeIntervalId)
            : undefined;
          if (interval) {
            interval.activeMilliseconds += creditedMilliseconds;
            interval.endedAt = effectiveEnd;
            upsertOutbox(intervalPayload(interval, updatedAt));
          }
          presence.lastAccountedAt = effectiveEnd;
        }
        presence.state = "offline";
        presence.activeIntervalId = null;
        upsertOutbox(presencePayload(presence, updatedAt));
        reconciled += 1;
      }
      return reconciled;
    },

    snapshot() {
      return {
        presence: [...presences.values()].map((presence) => ({
          clientId: presence.clientId,
          userId: presence.userId,
          state: presence.state,
          lastSeenAt: presence.lastSeenAt
        })),
        intervals: [...intervals.values()].map((interval) => ({ ...interval })),
        daily: [...daily.values()].map((item) => ({ ...item })),
        outbox: [...outbox.values()].map((payload) => ({ ...payload }))
      };
    }
  };
}
