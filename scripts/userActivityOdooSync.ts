import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { resolveDatabaseConfig, type ArcigyDatabaseConfig } from "../src/core/database/database-config";
import { withSchemaClient } from "../src/core/database/postgres-client";
import { createPostgresUserActivityRepository } from "../src/core/user-activity/user-activity-postgres-repository";
import {
  USER_ACTIVITY_MAX_CREDITABLE_GAP_MS,
  type UserActivityOutboxPayload
} from "../src/core/user-activity/user-activity-types";
import { fetchExternalText } from "../src/server/external-http";

type UserActivityOdooSyncConfig = {
  database: ArcigyDatabaseConfig;
  environment: "develop" | "main";
  odooUrl: string;
  odooDatabase?: string;
  odooApiKey: string;
  batchSize: number;
  maxBatches: number;
  leaseMs: number;
  maxCreditableGapMs: number;
};

export type LeasedUserActivityBatch = {
  token: string;
  items: UserActivityOutboxPayload[];
  attempts: number;
};

type SyncDependencies = {
  reconcile(config: UserActivityOdooSyncConfig, now: Date): Promise<number>;
  lease(config: UserActivityOdooSyncConfig, now: Date): Promise<LeasedUserActivityBatch | null>;
  send(config: UserActivityOdooSyncConfig, payload: ReturnType<typeof buildOdooActivityBatch>): Promise<void>;
  markSent(config: UserActivityOdooSyncConfig, batch: LeasedUserActivityBatch, now: Date): Promise<void>;
  markFailed(config: UserActivityOdooSyncConfig, batch: LeasedUserActivityBatch, now: Date, error: unknown): Promise<void>;
  now(): Date;
};

const allowedKeysByKind = {
  presence: ["client_external_id", "external_key", "kind", "last_seen_at", "source_updated_at", "state", "user_external_id"],
  daily: ["active_seconds", "activity_date", "client_external_id", "external_key", "first_active_at", "kind", "last_active_at", "session_count", "source_updated_at", "time_zone", "user_external_id"],
  interval: ["active_seconds", "activity_date", "client_external_id", "ended_at", "external_key", "interval_id", "kind", "source_updated_at", "started_at", "time_zone", "user_external_id"]
} as const;

function requiredEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function boundedInteger(raw: string | undefined, fallback: number, minimum: number, maximum: number): number {
  if (!raw?.trim()) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`Expected an integer between ${minimum} and ${maximum}.`);
  }
  return value;
}

function normalizedBaseUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
    throw new Error("ARCIGY_ODOO_URL must use HTTPS, except for loopback development.");
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

export function userActivityOdooSyncConfigFromEnv(env: NodeJS.ProcessEnv = process.env): UserActivityOdooSyncConfig {
  if (env.ARCIGY_USER_ACTIVITY_ODOO_SYNC_ENABLED !== "true") {
    throw new Error("ARCIGY_USER_ACTIVITY_ODOO_SYNC_ENABLED=true is required.");
  }
  const database = resolveDatabaseConfig(env);
  if (!database) throw new Error("PostgreSQL configuration is required for user activity Odoo sync.");
  const configuredEnvironment = env.ARCIGY_USER_ACTIVITY_ODOO_ENVIRONMENT?.trim();
  const environment = database.appEnv === "prod"
    ? "main"
    : database.appEnv === "dev"
      ? "develop"
      : configuredEnvironment;
  if (environment !== "develop" && environment !== "main") {
    throw new Error("ARCIGY_USER_ACTIVITY_ODOO_ENVIRONMENT must be develop or main outside a dev/prod database.");
  }
  if (database.appEnv === "prod" && configuredEnvironment && configuredEnvironment !== "main") {
    throw new Error("A production database can sync only to the main Odoo environment.");
  }
  if (database.appEnv === "dev" && configuredEnvironment && configuredEnvironment !== "develop") {
    throw new Error("A development database can sync only to the develop Odoo environment.");
  }
  return {
    database,
    environment,
    odooUrl: normalizedBaseUrl(requiredEnv(env, "ARCIGY_ODOO_URL")),
    odooDatabase: env.ARCIGY_ODOO_DATABASE?.trim() || undefined,
    odooApiKey: requiredEnv(env, "ARCIGY_ODOO_API_KEY"),
    batchSize: boundedInteger(env.ARCIGY_USER_ACTIVITY_ODOO_BATCH_SIZE, 200, 1, 500),
    maxBatches: boundedInteger(env.ARCIGY_USER_ACTIVITY_ODOO_MAX_BATCHES, 10, 1, 100),
    leaseMs: boundedInteger(env.ARCIGY_USER_ACTIVITY_ODOO_LEASE_MS, 120_000, 30_000, 10 * 60_000),
    maxCreditableGapMs: boundedInteger(
      env.ARCIGY_USER_ACTIVITY_MAX_CREDIT_MS,
      USER_ACTIVITY_MAX_CREDITABLE_GAP_MS,
      15_000,
      90_000
    )
  };
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function validIsoTimestamp(value: unknown): value is string {
  return typeof value === "string"
    && value.length <= 40
    && /^\d{4}-\d{2}-\d{2}T/.test(value)
    && Number.isFinite(Date.parse(value));
}

function validNonnegativeInteger(value: unknown, maximum: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= maximum;
}

function validatedOutboxPayload(value: unknown): UserActivityOutboxPayload {
  const parsed = typeof value === "string" ? JSON.parse(value) as unknown : value;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid activity outbox payload.");
  const record = parsed as Record<string, unknown>;
  if (record.kind !== "presence" && record.kind !== "daily" && record.kind !== "interval") {
    throw new Error("Invalid activity outbox kind.");
  }
  if (!exactKeys(record, allowedKeysByKind[record.kind])) throw new Error("Unexpected activity outbox fields.");
  for (const key of ["external_key", "client_external_id", "user_external_id", "source_updated_at"] as const) {
    if (typeof record[key] !== "string" || !record[key] || record[key].length > 300) {
      throw new Error(`Invalid activity outbox field ${key}.`);
    }
  }
  if (!validIsoTimestamp(record.source_updated_at)) throw new Error("Invalid activity source timestamp.");
  if (record.kind === "presence") {
    if (!["active", "idle", "offline"].includes(String(record.state)) || !validIsoTimestamp(record.last_seen_at)) {
      throw new Error("Invalid activity presence payload.");
    }
  } else {
    if (
      typeof record.activity_date !== "string"
      || !/^\d{4}-\d{2}-\d{2}$/.test(record.activity_date)
      || typeof record.time_zone !== "string"
      || !record.time_zone
      || record.time_zone.length > 80
      || !validNonnegativeInteger(record.active_seconds, 172_800)
    ) throw new Error("Invalid activity aggregate payload.");
    if (record.kind === "daily") {
      if (
        !validNonnegativeInteger(record.session_count, 10_000)
        || (record.first_active_at !== null && !validIsoTimestamp(record.first_active_at))
        || (record.last_active_at !== null && !validIsoTimestamp(record.last_active_at))
      ) throw new Error("Invalid activity daily payload.");
    } else if (
      typeof record.interval_id !== "string"
      || !record.interval_id
      || record.interval_id.length > 100
      || !validIsoTimestamp(record.started_at)
      || !validIsoTimestamp(record.ended_at)
      || Date.parse(record.ended_at) < Date.parse(record.started_at)
    ) {
      throw new Error("Invalid activity interval payload.");
    }
  }
  if (JSON.stringify(record).length > 16_384) throw new Error("Activity outbox payload is too large.");
  return record as UserActivityOutboxPayload;
}

export function buildOdooActivityBatch(
  items: readonly unknown[],
  sourceUpdatedAt: string,
  environment: "develop" | "main"
) {
  if (!items.length || items.length > 500) throw new Error("Activity Odoo batch must contain 1 to 500 items.");
  if (!validIsoTimestamp(sourceUpdatedAt)) throw new Error("Invalid activity batch timestamp.");
  const validated = items.map(validatedOutboxPayload);
  if (new Set(validated.map((item) => item.external_key)).size !== validated.length) {
    throw new Error("Activity Odoo batch contains duplicate external keys.");
  }
  return {
    payload: {
      environment,
      source_updated_at: sourceUpdatedAt,
      items: validated.map((item) => ({
        ...item,
        environment,
        external_key: `${environment}:${item.external_key}`
      }))
    }
  };
}

async function reconcile(config: UserActivityOdooSyncConfig, now: Date): Promise<number> {
  const repository = createPostgresUserActivityRepository(config.database);
  return repository.reconcileExpired(now, {
    offlineThresholdMs: config.leaseMs,
    maxCreditableGapMs: config.maxCreditableGapMs
  });
}

async function lease(config: UserActivityOdooSyncConfig, now: Date): Promise<LeasedUserActivityBatch | null> {
  return withSchemaClient(config.database.connectionString, config.database.schema, async (client) => {
    const token = randomUUID();
    const nowIso = now.toISOString();
    const leasedUntil = new Date(now.getTime() + config.leaseMs).toISOString();
    await client.query("BEGIN");
    try {
      await client.query(
        `UPDATE arcigy_user_activity_outbox
         SET status = 'pending', lease_token = NULL, leased_until = NULL, updated_at = $1
         WHERE status = 'leased' AND leased_until <= $1`,
        [nowIso]
      );
      const result = await client.query<{ payload: unknown; attempts: number | string }>(
        `WITH candidates AS (
           SELECT external_key
           FROM arcigy_user_activity_outbox
           WHERE status = 'pending' AND available_at <= $1
           ORDER BY available_at, created_at
           FOR UPDATE SKIP LOCKED
           LIMIT $2
         )
         UPDATE arcigy_user_activity_outbox outbox
         SET status = 'leased', lease_token = $3, leased_until = $4,
             attempts = attempts + 1, updated_at = $1
         FROM candidates
         WHERE outbox.external_key = candidates.external_key
         RETURNING outbox.payload, outbox.attempts`,
        [nowIso, config.batchSize, token, leasedUntil]
      );
      await client.query("COMMIT");
      if (!result.rows.length) return null;
      return {
        token,
        items: result.rows.map((row) => validatedOutboxPayload(row.payload)),
        attempts: Math.max(...result.rows.map((row) => Number(row.attempts) || 1))
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

async function send(config: UserActivityOdooSyncConfig, payload: ReturnType<typeof buildOdooActivityBatch>): Promise<void> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.odooApiKey}`,
    "Content-Type": "application/json; charset=utf-8",
    "User-Agent": "Arcigy-User-Activity-Sync/1.0"
  };
  if (config.odooDatabase) headers["X-Odoo-Database"] = config.odooDatabase;
  const { response, text } = await fetchExternalText(
    `${config.odooUrl}/json/2/arcigy.user.activity.presence/ingest_activity_batch`,
    { method: "POST", headers, body: JSON.stringify(payload) },
    { timeoutMs: 15_000, maxBytes: 1024 * 1024 }
  );
  if (!response.ok) throw new Error(`Odoo user activity ingest returned ${response.status}.`);
  let result: unknown;
  try {
    result = JSON.parse(text) as unknown;
  } catch {
    throw new Error("Odoo user activity ingest returned invalid JSON.");
  }
  if (!result || typeof result !== "object" || (result as { ok?: unknown }).ok !== true) {
    throw new Error("Odoo user activity ingest did not confirm the batch.");
  }
}

async function markSent(config: UserActivityOdooSyncConfig, batch: LeasedUserActivityBatch, now: Date): Promise<void> {
  await withSchemaClient(config.database.connectionString, config.database.schema, async (client) => {
    await client.query(
      `UPDATE arcigy_user_activity_outbox
       SET status = 'sent', lease_token = NULL, leased_until = NULL,
           last_error = NULL, sent_at = $2, updated_at = $2
       WHERE lease_token = $1 AND status = 'leased'`,
      [batch.token, now.toISOString()]
    );
  });
}

async function markFailed(
  config: UserActivityOdooSyncConfig,
  batch: LeasedUserActivityBatch,
  now: Date,
  error: unknown
): Promise<void> {
  const retrySeconds = Math.min(3600, 30 * 2 ** Math.min(7, Math.max(0, batch.attempts - 1)));
  const availableAt = new Date(now.getTime() + retrySeconds * 1_000).toISOString();
  const message = (error instanceof Error ? error.message : "Unknown Odoo ingest failure").slice(0, 500);
  await withSchemaClient(config.database.connectionString, config.database.schema, async (client) => {
    await client.query(
      `UPDATE arcigy_user_activity_outbox
       SET status = 'pending', lease_token = NULL, leased_until = NULL,
           available_at = $2, last_error = $3, updated_at = $4
       WHERE lease_token = $1 AND status = 'leased'`,
      [batch.token, availableAt, message, now.toISOString()]
    );
  });
}

const defaultDependencies: SyncDependencies = {
  reconcile,
  lease,
  send,
  markSent,
  markFailed,
  now: () => new Date()
};

export async function runUserActivityOdooSync(
  env: NodeJS.ProcessEnv = process.env,
  dependencies: SyncDependencies = defaultDependencies
) {
  const config = userActivityOdooSyncConfigFromEnv(env);
  const reconciled = await dependencies.reconcile(config, dependencies.now());
  let batches = 0;
  let sent = 0;
  for (; batches < config.maxBatches; batches += 1) {
    const batch = await dependencies.lease(config, dependencies.now());
    if (!batch) break;
    try {
      await dependencies.send(
        config,
        buildOdooActivityBatch(batch.items, dependencies.now().toISOString(), config.environment)
      );
      await dependencies.markSent(config, batch, dependencies.now());
      sent += batch.items.length;
    } catch (error) {
      await dependencies.markFailed(config, batch, dependencies.now(), error);
      throw error;
    }
  }
  return { ok: true as const, reconciled, batches, sent };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await runUserActivityOdooSync();
  console.log(JSON.stringify(result));
}
