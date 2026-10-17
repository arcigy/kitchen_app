import { resolveCrmExportConfig, type CrmExportConfig } from "../core/crm-export/crm-export-config";
import { createPostgresCrmExportOutbox, createPostgresCrmExportSource, withCrmExportLock } from "../core/crm-export/crm-export-postgres";
import { runCrmExportTick } from "../core/crm-export/crm-export-runner";
import { resolveDatabaseConfig } from "../core/database/database-config";
import { deliverCrmBatchToOdoo, sendCrmExportAlert } from "./crmExportDelivery";

const TICK_INTERVAL_MS = 60 * 60 * 1000;

type SchedulerDependencies = {
  now(): Date;
  setInterval(callback: () => void, intervalMs: number): { unref?: () => void };
  clearInterval(handle: { unref?: () => void }): void;
};

const defaultDependencies: SchedulerDependencies = {
  now: () => new Date(),
  setInterval: (callback, intervalMs) => setInterval(callback, intervalMs),
  clearInterval: (handle) => clearInterval(handle as NodeJS.Timeout)
};

/** One locked export run; used by the scheduler and the `crm:export` CLI. */
export async function runLockedCrmExport(config: CrmExportConfig, now: Date) {
  const database = resolveDatabaseConfig();
  if (!database) throw new Error("The CRM export needs the PostgreSQL project database.");
  return withCrmExportLock(database, () => runCrmExportTick({
    now,
    environment: config.environment,
    clientKeys: config.clientKeys,
    source: createPostgresCrmExportSource(database),
    outbox: createPostgresCrmExportOutbox(database),
    deliver: (payload) => deliverCrmBatchToOdoo(config, payload),
    alert: (message) => sendCrmExportAlert(config, message)
  }));
}

/**
 * Hourly tick in the worker: builds yesterday's batch once after 02:30 Bratislava time and retries
 * undelivered batches. Disabled unless ARCIGY_CRM_EXPORT_ENABLED=true.
 */
export function startCrmExportScheduler(
  env: NodeJS.ProcessEnv = process.env,
  dependencies: SchedulerDependencies = defaultDependencies
): () => void {
  const config = resolveCrmExportConfig(env);
  if (!config) return () => undefined;
  let running = false;
  const tick = async (): Promise<void> => {
    if (running) return;
    running = true;
    try {
      const result = await runLockedCrmExport(config, dependencies.now());
      if (result && (result.built || result.delivered.length || result.failed.length)) {
        console.log(`[crm-export] built=${result.built ?? "-"} delivered=${result.delivered.length} failed=${result.failed.length}`);
      }
    } catch (error) {
      console.error("[crm-export] tick failed", error instanceof Error ? error.message : error);
    } finally {
      running = false;
    }
  };
  const handle = dependencies.setInterval(() => { void tick(); }, TICK_INTERVAL_MS);
  handle.unref?.();
  void tick();
  return () => dependencies.clearInterval(handle);
}
