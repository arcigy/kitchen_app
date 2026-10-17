import { addDays, buildCrmExportPayload, localDate, payloadSha256 } from "./crm-export-aggregation";
import { CRM_EXPORT_TIME_ZONE, type CrmExportPayload, type CrmSourceRows } from "./crm-export-types";

export type StoredCrmBatch = { batchId: string; payload: CrmExportPayload; attempts: number };

export type CrmExportOutbox = {
  /** Stores a new batch as pending; an identical batch ID is kept as it is. */
  store(payload: CrmExportPayload, sha256: string): Promise<void>;
  due(): Promise<StoredCrmBatch[]>;
  markDelivered(batchId: string, at: Date): Promise<void>;
  markFailed(batchId: string, error: string): Promise<void>;
  /** Latest `date_to` of a delivered batch, or null. */
  lastDeliveredDateTo(): Promise<string | null>;
};

export type CrmExportSource = {
  readRows(clientKeys: readonly string[], fromInclusive: Date, toExclusive: Date): Promise<CrmSourceRows>;
};

export type OdooIngestResult = { ok: boolean; state?: string; unmatched?: string[]; error?: string };

export type CrmExportTickDeps = {
  now: Date;
  environment: string;
  clientKeys: readonly string[];
  source: CrmExportSource;
  outbox: CrmExportOutbox;
  deliver(payload: CrmExportPayload): Promise<OdooIngestResult>;
  alert?(message: string): Promise<void>;
};

const DAILY_WINDOW_DAYS = 7;
const FULL_WINDOW_DAYS = 35;
const ALERT_AFTER_ATTEMPTS = 24;
const EARLIEST_LOCAL_RUN = "02:30";

const localTimeFormat = new Intl.DateTimeFormat("en-GB", { timeZone: CRM_EXPORT_TIME_ZONE, hour: "2-digit", minute: "2-digit", hour12: false });
const localWeekdayFormat = new Intl.DateTimeFormat("en-US", { timeZone: CRM_EXPORT_TIME_ZONE, weekday: "short" });

/** UTC instant window that safely contains the local calendar days of a batch and its 30-day lookback. */
export function sourceWindow(dateFrom: string, dateTo: string): { from: Date; to: Date } {
  const monthStart = `${dateFrom.slice(0, 7)}-01`;
  const earliest = [addDays(dateFrom, -31), addDays(monthStart, -31)].sort()[0];
  return { from: new Date(`${addDays(earliest, -1)}T00:00:00Z`), to: new Date(`${addDays(dateTo, 2)}T00:00:00Z`) };
}

export async function buildCrmBatch(deps: Pick<CrmExportTickDeps, "environment" | "clientKeys" | "source">, dateFrom: string, dateTo: string, now: Date): Promise<CrmExportPayload> {
  const window = sourceWindow(dateFrom, dateTo);
  const rows = await deps.source.readRows(deps.clientKeys, window.from, window.to);
  return buildCrmExportPayload({ rows, clientKeys: deps.clientKeys, dateFrom, dateTo, environment: deps.environment, generatedAt: now });
}

/**
 * One scheduler tick: after 02:30 local time it builds yesterday's batch once (the last 7 days, or the
 * last 35 days after a gap and every Monday to self-heal), then delivers every pending batch.
 */
export async function runCrmExportTick(deps: CrmExportTickDeps): Promise<{ built: string | null; delivered: string[]; failed: string[] }> {
  let built: string | null = null;
  const today = localDate(deps.now.toISOString());
  const yesterday = addDays(today, -1);
  if (localTimeFormat.format(deps.now) >= EARLIEST_LOCAL_RUN) {
    const lastDelivered = await deps.outbox.lastDeliveredDateTo();
    if (lastDelivered !== yesterday) {
      const caughtUp = lastDelivered !== null && lastDelivered >= addDays(yesterday, -1);
      const isMonday = localWeekdayFormat.format(deps.now) === "Mon";
      const days = caughtUp && !isMonday ? DAILY_WINDOW_DAYS : FULL_WINDOW_DAYS;
      const payload = await buildCrmBatch(deps, addDays(yesterday, -(days - 1)), yesterday, deps.now);
      await deps.outbox.store(payload, payloadSha256(payload));
      built = payload.batch_id;
    }
  }

  const delivered: string[] = [];
  const failed: string[] = [];
  for (const batch of await deps.outbox.due()) {
    try {
      const result = await deps.deliver(batch.payload);
      if (!result.ok) throw new Error(result.error ?? `Odoo rejected the batch (${result.state ?? "unknown"}).`);
      await deps.outbox.markDelivered(batch.batchId, deps.now);
      delivered.push(batch.batchId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await deps.outbox.markFailed(batch.batchId, message);
      failed.push(batch.batchId);
      if (batch.attempts + 1 === ALERT_AFTER_ATTEMPTS) {
        await deps.alert?.(`CRM export ${batch.batchId} has failed ${ALERT_AFTER_ATTEMPTS} times: ${message}`).catch(() => undefined);
      }
    }
  }
  return { built, delivered, failed };
}
