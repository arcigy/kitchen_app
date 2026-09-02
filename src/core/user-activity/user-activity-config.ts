import type { UserActivityRecordOptions } from "./user-activity-types";

const DEFAULT_HEARTBEAT_INTERVAL_MS = 30_000;
const DEFAULT_IDLE_THRESHOLD_MS = 5 * 60_000;
const DEFAULT_OFFLINE_THRESHOLD_MS = 90_000;
const DEFAULT_MAX_CREDITABLE_GAP_MS = 45_000;

export type UserActivityTrackingConfig = UserActivityRecordOptions & {
  enabled: boolean;
  heartbeatIntervalMs: number;
  idleThresholdMs: number;
  disclosure: string;
};

export type UserActivityReconciliationConfig = UserActivityRecordOptions & {
  enabled: boolean;
  intervalMs: number;
};

function boundedInteger(
  raw: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  if (!raw?.trim()) return fallback;
  const value = Number(raw);
  return Number.isInteger(value) && value >= minimum && value <= maximum ? value : fallback;
}

function configuredClients(env: NodeJS.ProcessEnv): Set<string> {
  return new Set(
    (env.ARCIGY_USER_ACTIVITY_TRACKING_CLIENTS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  );
}

export function resolveUserActivityTrackingConfig(
  clientId: string,
  env: NodeJS.ProcessEnv = process.env
): UserActivityTrackingConfig {
  const heartbeatIntervalMs = boundedInteger(
    env.ARCIGY_USER_ACTIVITY_HEARTBEAT_MS,
    DEFAULT_HEARTBEAT_INTERVAL_MS,
    15_000,
    60_000
  );
  const idleThresholdMs = boundedInteger(
    env.ARCIGY_USER_ACTIVITY_IDLE_MS,
    DEFAULT_IDLE_THRESHOLD_MS,
    60_000,
    30 * 60_000
  );
  const offlineThresholdMs = boundedInteger(
    env.ARCIGY_USER_ACTIVITY_OFFLINE_MS,
    Math.max(DEFAULT_OFFLINE_THRESHOLD_MS, heartbeatIntervalMs * 2),
    heartbeatIntervalMs * 2,
    5 * 60_000
  );
  const maxCreditableGapMs = Math.min(
    offlineThresholdMs,
    boundedInteger(
      env.ARCIGY_USER_ACTIVITY_MAX_CREDIT_MS,
      Math.max(DEFAULT_MAX_CREDITABLE_GAP_MS, heartbeatIntervalMs),
      heartbeatIntervalMs,
      90_000
    )
  );
  const enabled = env.ARCIGY_USER_ACTIVITY_TRACKING_ENABLED === "true"
    && configuredClients(env).has(clientId);

  return {
    enabled,
    heartbeatIntervalMs,
    idleThresholdMs,
    offlineThresholdMs,
    maxCreditableGapMs,
    disclosure: "Arcigy records foreground activity and idle intervals for this signed-in account. It does not capture typed text, pointer coordinates, screenshots, project contents, or customer data."
  };
}

export function resolveUserActivityReconciliationConfig(
  env: NodeJS.ProcessEnv = process.env
): UserActivityReconciliationConfig {
  const clients = configuredClients(env);
  const representativeClient = clients.values().next().value ?? "";
  const tracking = resolveUserActivityTrackingConfig(representativeClient, env);
  return {
    enabled: tracking.enabled && clients.size > 0,
    intervalMs: tracking.heartbeatIntervalMs,
    offlineThresholdMs: tracking.offlineThresholdMs,
    maxCreditableGapMs: tracking.maxCreditableGapMs
  };
}
