import { randomUUID } from "node:crypto";
import type { ClientContext } from "../client/client-context";
import { withSchemaClient } from "../database/postgres-client";
import {
  USER_ACTIVITY_TRACKER_LIMIT,
  UserActivityTrackerLimitError,
  type UserActivityDailyOutboxPayload,
  type UserActivityIntervalOutboxPayload,
  type UserActivityOutboxPayload,
  type UserActivityPresenceOutboxPayload,
  type UserActivityPresenceState,
  type UserActivityRepository
} from "./user-activity-types";

type PresenceRow = {
  state: UserActivityPresenceState;
  active_interval_id: string | null;
  last_accounted_at: Date | string;
  last_seen_at: Date | string;
  local_date: Date | string;
  time_zone: string;
};

type ExpiredPresenceRow = PresenceRow & {
  client_id: string;
  user_id: string;
};

type DailyRow = {
  activity_date: Date | string;
  time_zone: string;
  first_active_at: Date | string | null;
  last_active_at: Date | string | null;
  active_seconds: number | string;
  session_count: number | string;
  updated_at: Date | string;
};

type IntervalRow = {
  interval_id: string;
  activity_date: Date | string;
  time_zone: string;
  started_at: Date | string;
  ended_at: Date | string;
  active_seconds: number | string;
  updated_at: Date | string;
};

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toLocalDate(value: Date | string): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function finiteInteger(value: number | string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
}

function presencePayload(
  context: ClientContext,
  state: UserActivityPresenceState,
  lastSeenAt: string,
  updatedAt: string
): UserActivityPresenceOutboxPayload {
  return {
    kind: "presence",
    external_key: `presence:${context.clientId}:${context.userId}`,
    client_external_id: context.clientId,
    user_external_id: context.userId,
    state,
    last_seen_at: lastSeenAt,
    source_updated_at: updatedAt
  };
}

function dailyPayload(context: ClientContext, row: DailyRow): UserActivityDailyOutboxPayload {
  return {
    kind: "daily",
    external_key: `daily:${context.clientId}:${context.userId}:${toLocalDate(row.activity_date)}`,
    client_external_id: context.clientId,
    user_external_id: context.userId,
    activity_date: toLocalDate(row.activity_date),
    time_zone: row.time_zone,
    first_active_at: row.first_active_at ? toIso(row.first_active_at) : null,
    last_active_at: row.last_active_at ? toIso(row.last_active_at) : null,
    active_seconds: finiteInteger(row.active_seconds),
    session_count: finiteInteger(row.session_count),
    source_updated_at: toIso(row.updated_at)
  };
}

function intervalPayload(context: ClientContext, row: IntervalRow): UserActivityIntervalOutboxPayload {
  return {
    kind: "interval",
    external_key: `interval:${row.interval_id}`,
    client_external_id: context.clientId,
    user_external_id: context.userId,
    interval_id: row.interval_id,
    activity_date: toLocalDate(row.activity_date),
    time_zone: row.time_zone,
    started_at: toIso(row.started_at),
    ended_at: toIso(row.ended_at),
    active_seconds: finiteInteger(row.active_seconds),
    source_updated_at: toIso(row.updated_at)
  };
}

async function upsertOutbox(
  client: { query(queryText: string, values?: unknown[]): Promise<unknown> },
  payload: UserActivityOutboxPayload,
  updatedAt: string
): Promise<void> {
  await client.query(
    `INSERT INTO arcigy_user_activity_outbox (
       external_key, item_kind, client_id, user_id, payload, status,
       attempts, available_at, lease_token, leased_until, last_error, created_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5::jsonb, 'pending', 0, $6, NULL, NULL, NULL, $6, $6)
     ON CONFLICT (external_key) DO UPDATE SET
       item_kind = EXCLUDED.item_kind,
       payload = EXCLUDED.payload,
       status = 'pending',
       attempts = 0,
       available_at = EXCLUDED.available_at,
       lease_token = NULL,
       leased_until = NULL,
       last_error = NULL,
       sent_at = NULL,
       updated_at = EXCLUDED.updated_at`,
    [
      payload.external_key,
      payload.kind,
      payload.client_external_id,
      payload.user_external_id,
      JSON.stringify(payload),
      updatedAt
    ]
  );
}

async function reconcilePostgresUserActivity(
  args: { connectionString: string; schema: string },
  receivedAt: Date,
  options: { maxCreditableGapMs: number }
): Promise<number> {
  return withSchemaClient(args.connectionString, args.schema, async (client) => {
    const receivedAtIso = receivedAt.toISOString();
    const nowMs = receivedAt.getTime();
    await client.query("BEGIN");
    try {
      const expiredResult = await client.query<ExpiredPresenceRow>(
        `SELECT p.client_id, p.user_id, p.state, p.active_interval_id,
                p.last_accounted_at, p.last_seen_at, p.local_date, p.time_zone
         FROM arcigy_user_activity_presence p
         WHERE p.state <> 'offline'
           AND NOT EXISTS (
             SELECT 1
             FROM arcigy_user_activity_trackers t
             WHERE t.client_id = p.client_id
               AND t.user_id = p.user_id
               AND t.lease_expires_at > $1
           )
         ORDER BY p.updated_at
         FOR UPDATE SKIP LOCKED
         LIMIT 500`,
        [receivedAtIso]
      );

      let reconciled = 0;
      for (const presence of expiredResult.rows) {
        const liveTrackerResult = await client.query<{ live: boolean }>(
          `SELECT EXISTS (
             SELECT 1
             FROM arcigy_user_activity_trackers
             WHERE client_id = $1 AND user_id = $2 AND lease_expires_at > $3
           ) AS live`,
          [presence.client_id, presence.user_id, receivedAtIso]
        );
        if (liveTrackerResult.rows[0]?.live) continue;
        const context: ClientContext = {
          clientId: presence.client_id,
          userId: presence.user_id,
          role: "viewer"
        };
        let effectiveEnd = toIso(presence.last_accounted_at);
        if (presence.state === "active") {
          const lastAccountedMs = Date.parse(effectiveEnd);
          const creditedSeconds = Math.floor(Math.max(
            0,
            Math.min(options.maxCreditableGapMs, nowMs - lastAccountedMs)
          ) / 1_000);
          effectiveEnd = new Date(lastAccountedMs + creditedSeconds * 1_000).toISOString();
          if (creditedSeconds > 0) {
            const dailyResult = await client.query<DailyRow>(
              `UPDATE arcigy_user_activity_daily
               SET last_active_at = $4,
                   active_seconds = active_seconds + $5,
                   updated_at = $6
               WHERE client_id = $1 AND user_id = $2 AND activity_date = $3::date
               RETURNING activity_date, time_zone, first_active_at, last_active_at,
                         active_seconds, session_count, updated_at`,
              [
                context.clientId,
                context.userId,
                toLocalDate(presence.local_date),
                effectiveEnd,
                creditedSeconds,
                receivedAtIso
              ]
            );
            const day = dailyResult.rows[0];
            if (day) await upsertOutbox(client, dailyPayload(context, day), receivedAtIso);
          }
          if (presence.active_interval_id) {
            const intervalResult = await client.query<IntervalRow>(
              `UPDATE arcigy_user_activity_intervals
               SET ended_at = $4,
                   active_seconds = active_seconds + $5,
                   updated_at = $6
               WHERE client_id = $1 AND user_id = $2 AND interval_id = $3
               RETURNING interval_id, activity_date, time_zone, started_at, ended_at,
                         active_seconds, updated_at`,
              [
                context.clientId,
                context.userId,
                presence.active_interval_id,
                effectiveEnd,
                creditedSeconds,
                receivedAtIso
              ]
            );
            const interval = intervalResult.rows[0];
            if (interval) await upsertOutbox(client, intervalPayload(context, interval), receivedAtIso);
          }
        }

        await client.query(
          `UPDATE arcigy_user_activity_presence
           SET state = 'offline', active_interval_id = NULL,
               last_accounted_at = $3, updated_at = $4
           WHERE client_id = $1 AND user_id = $2`,
          [context.clientId, context.userId, effectiveEnd, receivedAtIso]
        );
        await upsertOutbox(
          client,
          presencePayload(context, "offline", toIso(presence.last_seen_at), receivedAtIso),
          receivedAtIso
        );
        reconciled += 1;
      }
      await client.query("COMMIT");
      return reconciled;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export function createPostgresUserActivityRepository(args: {
  connectionString: string;
  schema: string;
}): UserActivityRepository {
  return {
    reconcileExpired(receivedAt, options) {
      return reconcilePostgresUserActivity(args, receivedAt, options);
    },

    async recordPulse(context, pulse, receivedAt, options) {
      return withSchemaClient(args.connectionString, args.schema, async (client) => {
        const receivedAtIso = receivedAt.toISOString();
        const nowMs = receivedAt.getTime();
        await client.query("BEGIN");
        try {
          const presenceResult = await client.query<PresenceRow>(
            `SELECT state, active_interval_id, last_accounted_at, last_seen_at, local_date, time_zone
             FROM arcigy_user_activity_presence
             WHERE client_id = $1 AND user_id = $2
             FOR UPDATE`,
            [context.clientId, context.userId]
          );
          const presence = presenceResult.rows[0];
          const trackerResult = await client.query<{ sequence: number | string }>(
            `SELECT sequence
             FROM arcigy_user_activity_trackers
             WHERE client_id = $1 AND user_id = $2 AND tracker_id = $3`,
            [context.clientId, context.userId, pulse.trackerId]
          );
          const existingSequence = trackerResult.rows[0] ? finiteInteger(trackerResult.rows[0].sequence) : null;
          if (existingSequence !== null && pulse.sequence <= existingSequence) {
            const dailyResult = await client.query<DailyRow>(
              `SELECT activity_date, time_zone, first_active_at, last_active_at, active_seconds, session_count, updated_at
               FROM arcigy_user_activity_daily
               WHERE client_id = $1 AND user_id = $2 AND activity_date = $3::date`,
              [context.clientId, context.userId, pulse.localDate]
            );
            await client.query("COMMIT");
            return {
              accepted: false,
              state: presence?.state ?? "offline",
              activeSecondsToday: dailyResult.rows[0] ? finiteInteger(dailyResult.rows[0].active_seconds) : 0,
              receivedAt: receivedAtIso
            };
          }

          if (existingSequence === null) {
            await client.query(
              `DELETE FROM arcigy_user_activity_trackers
               WHERE client_id = $1 AND user_id = $2 AND lease_expires_at < $3::timestamptz - interval '24 hours'`,
              [context.clientId, context.userId, receivedAtIso]
            );
            const liveCountResult = await client.query<{ count: number | string }>(
              `SELECT count(*) AS count
               FROM arcigy_user_activity_trackers
               WHERE client_id = $1 AND user_id = $2 AND lease_expires_at > $3`,
              [context.clientId, context.userId, receivedAtIso]
            );
            if (finiteInteger(liveCountResult.rows[0]?.count ?? 0) >= USER_ACTIVITY_TRACKER_LIMIT) {
              throw new UserActivityTrackerLimitError();
            }
          }

          let creditedDaily: DailyRow | null = null;
          let creditedInterval: IntervalRow | null = null;
          if (presence?.state === "active") {
            const creditedSeconds = Math.floor(Math.max(
              0,
              Math.min(options.maxCreditableGapMs, nowMs - Date.parse(toIso(presence.last_accounted_at)))
            ) / 1_000);
            if (creditedSeconds > 0) {
              const creditedDailyResult = await client.query<DailyRow>(
                `INSERT INTO arcigy_user_activity_daily (
                   client_id, user_id, activity_date, time_zone, first_active_at, last_active_at,
                   active_seconds, session_count, created_at, updated_at
                 ) VALUES ($1, $2, $3::date, $4, $5, $6, $7, 1, $6, $6)
                 ON CONFLICT (client_id, user_id, activity_date) DO UPDATE SET
                   time_zone = EXCLUDED.time_zone,
                   last_active_at = EXCLUDED.last_active_at,
                   active_seconds = arcigy_user_activity_daily.active_seconds + EXCLUDED.active_seconds,
                   updated_at = EXCLUDED.updated_at
                 RETURNING activity_date, time_zone, first_active_at, last_active_at,
                           active_seconds, session_count, updated_at`,
                [
                  context.clientId,
                  context.userId,
                  toLocalDate(presence.local_date),
                  presence.time_zone,
                  toIso(presence.last_accounted_at),
                  receivedAtIso,
                  creditedSeconds
                ]
              );
              creditedDaily = creditedDailyResult.rows[0] ?? null;
              if (presence.active_interval_id) {
                const intervalResult = await client.query<IntervalRow>(
                  `UPDATE arcigy_user_activity_intervals
                   SET ended_at = $4,
                       active_seconds = active_seconds + $5,
                       updated_at = $4
                   WHERE client_id = $1 AND user_id = $2 AND interval_id = $3
                   RETURNING interval_id, activity_date, time_zone, started_at, ended_at,
                             active_seconds, updated_at`,
                  [context.clientId, context.userId, presence.active_interval_id, receivedAtIso, creditedSeconds]
                );
                creditedInterval = intervalResult.rows[0] ?? null;
              }
            }
          }

          await client.query(
            `INSERT INTO arcigy_user_activity_trackers (
               client_id, user_id, tracker_id, sequence, state, local_date, time_zone,
               last_seen_at, lease_expires_at, created_at, updated_at
             ) VALUES ($1, $2, $3, $4, $5, $6::date, $7, $8, $9, $8, $8)
             ON CONFLICT (client_id, user_id, tracker_id) DO UPDATE SET
               sequence = EXCLUDED.sequence,
               state = EXCLUDED.state,
               local_date = EXCLUDED.local_date,
               time_zone = EXCLUDED.time_zone,
               last_seen_at = EXCLUDED.last_seen_at,
               lease_expires_at = EXCLUDED.lease_expires_at,
               updated_at = EXCLUDED.updated_at`,
            [
              context.clientId,
              context.userId,
              pulse.trackerId,
              pulse.sequence,
              pulse.state,
              pulse.localDate,
              pulse.timeZone,
              receivedAtIso,
              new Date(nowMs + options.offlineThresholdMs).toISOString()
            ]
          );

          const liveResult = await client.query<{ active: boolean; live: boolean }>(
            `SELECT
               COALESCE(bool_or(state = 'active'), false) AS active,
               count(*) > 0 AS live
             FROM arcigy_user_activity_trackers
             WHERE client_id = $1 AND user_id = $2 AND lease_expires_at > $3`,
            [context.clientId, context.userId, receivedAtIso]
          );
          const live = liveResult.rows[0];
          const nextState: UserActivityPresenceState = live?.active ? "active" : live?.live ? "idle" : "offline";
          const dateChangedWhileActive = presence?.state === "active"
            && nextState === "active"
            && (toLocalDate(presence.local_date) !== pulse.localDate || presence.time_zone !== pulse.timeZone);
          let activeIntervalId = presence?.active_interval_id ?? null;
          let newInterval: IntervalRow | null = null;
          let openedDaily: DailyRow | null = null;

          if ((presence?.state !== "active" && nextState === "active") || dateChangedWhileActive) {
            activeIntervalId = randomUUID();
            const intervalResult = await client.query<IntervalRow>(
              `INSERT INTO arcigy_user_activity_intervals (
                 interval_id, client_id, user_id, activity_date, time_zone,
                 started_at, ended_at, active_seconds, created_at, updated_at
               ) VALUES ($1, $2, $3, $4::date, $5, $6, $6, 0, $6, $6)
               RETURNING interval_id, activity_date, time_zone, started_at, ended_at,
                         active_seconds, updated_at`,
              [activeIntervalId, context.clientId, context.userId, pulse.localDate, pulse.timeZone, receivedAtIso]
            );
            newInterval = intervalResult.rows[0] ?? null;
            const dailyResult = await client.query<DailyRow>(
              `INSERT INTO arcigy_user_activity_daily (
                 client_id, user_id, activity_date, time_zone, first_active_at, last_active_at,
                 active_seconds, session_count, created_at, updated_at
               ) VALUES ($1, $2, $3::date, $4, $5, $5, 0, 1, $5, $5)
               ON CONFLICT (client_id, user_id, activity_date) DO UPDATE SET
                 time_zone = EXCLUDED.time_zone,
                 first_active_at = COALESCE(arcigy_user_activity_daily.first_active_at, EXCLUDED.first_active_at),
                 last_active_at = EXCLUDED.last_active_at,
                 session_count = arcigy_user_activity_daily.session_count + 1,
                 updated_at = EXCLUDED.updated_at
               RETURNING activity_date, time_zone, first_active_at, last_active_at,
                         active_seconds, session_count, updated_at`,
              [context.clientId, context.userId, pulse.localDate, pulse.timeZone, receivedAtIso]
            );
            openedDaily = dailyResult.rows[0] ?? null;
          } else if (presence?.state === "active" && nextState !== "active") {
            activeIntervalId = null;
          }

          await client.query(
            `INSERT INTO arcigy_user_activity_presence (
               client_id, user_id, state, active_interval_id, last_accounted_at,
               last_seen_at, local_date, time_zone, created_at, updated_at
             ) VALUES ($1, $2, $3, $4, $5, $5, $6::date, $7, $5, $5)
             ON CONFLICT (client_id, user_id) DO UPDATE SET
               state = EXCLUDED.state,
               active_interval_id = EXCLUDED.active_interval_id,
               last_accounted_at = EXCLUDED.last_accounted_at,
               last_seen_at = EXCLUDED.last_seen_at,
               local_date = EXCLUDED.local_date,
               time_zone = EXCLUDED.time_zone,
               updated_at = EXCLUDED.updated_at`,
            [
              context.clientId,
              context.userId,
              nextState,
              activeIntervalId,
              receivedAtIso,
              pulse.localDate,
              pulse.timeZone
            ]
          );

          if (creditedDaily) await upsertOutbox(client, dailyPayload(context, creditedDaily), receivedAtIso);
          if (openedDaily) await upsertOutbox(client, dailyPayload(context, openedDaily), receivedAtIso);
          if (creditedInterval) await upsertOutbox(client, intervalPayload(context, creditedInterval), receivedAtIso);
          if (newInterval) await upsertOutbox(client, intervalPayload(context, newInterval), receivedAtIso);
          await upsertOutbox(
            client,
            presencePayload(context, nextState, receivedAtIso, receivedAtIso),
            receivedAtIso
          );

          const todayResult = await client.query<DailyRow>(
            `SELECT activity_date, time_zone, first_active_at, last_active_at, active_seconds, session_count, updated_at
             FROM arcigy_user_activity_daily
             WHERE client_id = $1 AND user_id = $2 AND activity_date = $3::date`,
            [context.clientId, context.userId, pulse.localDate]
          );
          await client.query("COMMIT");
          return {
            accepted: true,
            state: nextState,
            activeSecondsToday: todayResult.rows[0] ? finiteInteger(todayResult.rows[0].active_seconds) : 0,
            receivedAt: receivedAtIso
          };
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        }
      });
    }
  };
}
