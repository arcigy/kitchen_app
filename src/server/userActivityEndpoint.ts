import type http from "node:http";
import type { ClientContext } from "../core/client/client-context";
import { resolveUserActivityTrackingConfig, type UserActivityTrackingConfig } from "../core/user-activity/user-activity-config";
import {
  UserActivityTrackerLimitError,
  type UserActivityPulse,
  type UserActivityRepository
} from "../core/user-activity/user-activity-types";
import { clientSessionHeaderFromRequest } from "./requestAuthentication";

const CONFIG_PATH = "/api/user-activity/config";
const PULSE_PATH = "/api/user-activity/pulse";
const PULSE_KEYS = ["localDate", "sequence", "state", "timeZone", "trackerId"] as const;
const TRACKER_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LOCAL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const pulseStates = new Set(["active", "hidden", "idle"]);

type UserActivityEndpointDependencies = {
  getContext(cookie: string | string[] | undefined): Promise<ClientContext>;
  readJsonBody(req: http.IncomingMessage): Promise<unknown>;
  sendJson(res: http.ServerResponse, status: number, data: unknown): void;
  repository: UserActivityRepository;
  resolveConfig?: (clientId: string) => UserActivityTrackingConfig;
  now?: () => Date;
};

class InvalidUserActivityPulseError extends Error {}

function validLocalDate(value: string): boolean {
  if (!LOCAL_DATE_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validTimeZone(value: string): boolean {
  if (!value || value.length > 80) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export function parseUserActivityPulse(value: unknown): UserActivityPulse {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new InvalidUserActivityPulseError();
  }
  const body = value as Record<string, unknown>;
  const keys = Object.keys(body).sort();
  if (keys.length !== PULSE_KEYS.length || keys.some((key, index) => key !== PULSE_KEYS[index])) {
    throw new InvalidUserActivityPulseError();
  }
  if (
    typeof body.trackerId !== "string"
    || !TRACKER_ID_RE.test(body.trackerId)
    || typeof body.sequence !== "number"
    || !Number.isSafeInteger(body.sequence)
    || body.sequence < 1
    || typeof body.state !== "string"
    || !pulseStates.has(body.state)
    || typeof body.localDate !== "string"
    || !validLocalDate(body.localDate)
    || typeof body.timeZone !== "string"
    || !validTimeZone(body.timeZone)
  ) {
    throw new InvalidUserActivityPulseError();
  }
  return {
    trackerId: body.trackerId,
    sequence: body.sequence,
    state: body.state as UserActivityPulse["state"],
    localDate: body.localDate,
    timeZone: body.timeZone
  };
}

export async function handleUserActivityApi(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
  deps: UserActivityEndpointDependencies
): Promise<boolean> {
  if (url.pathname !== CONFIG_PATH && url.pathname !== PULSE_PATH) return false;
  const context = await deps.getContext(clientSessionHeaderFromRequest(req));
  const config = (deps.resolveConfig ?? resolveUserActivityTrackingConfig)(context.clientId);

  if (req.method === "GET" && url.pathname === CONFIG_PATH) {
    deps.sendJson(res, 200, {
      ok: true,
      enabled: config.enabled,
      heartbeatIntervalMs: config.heartbeatIntervalMs,
      idleThresholdMs: config.idleThresholdMs,
      offlineThresholdMs: config.offlineThresholdMs,
      disclosure: config.disclosure
    });
    return true;
  }
  if (req.method !== "POST" || url.pathname !== PULSE_PATH) return false;
  if (!config.enabled) {
    deps.sendJson(res, 404, { ok: false, error: "Not found" });
    return true;
  }

  let pulse: UserActivityPulse;
  try {
    pulse = parseUserActivityPulse(await deps.readJsonBody(req));
  } catch (error) {
    if (!(error instanceof InvalidUserActivityPulseError)) throw error;
    deps.sendJson(res, 400, { ok: false, error: "Invalid user activity pulse." });
    return true;
  }

  try {
    const receipt = await deps.repository.recordPulse(context, pulse, (deps.now ?? (() => new Date()))(), config);
    deps.sendJson(res, 202, { ok: true, ...receipt });
  } catch (error) {
    if (!(error instanceof UserActivityTrackerLimitError)) throw error;
    deps.sendJson(res, 429, { ok: false, error: error.message });
  }
  return true;
}
