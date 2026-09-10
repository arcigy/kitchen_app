import { resolveUserActivityReconciliationConfig } from "../core/user-activity/user-activity-config";
import type { UserActivityRepository } from "../core/user-activity/user-activity-types";

type ReconciliationDependencies = {
  now(): Date;
  setInterval(callback: () => void, intervalMs: number): { unref?: () => void };
  clearInterval(handle: { unref?: () => void }): void;
  reportFailure(): void;
};

const defaultDependencies: ReconciliationDependencies = {
  now: () => new Date(),
  setInterval: (callback, intervalMs) => setInterval(callback, intervalMs),
  clearInterval: (handle) => clearInterval(handle as NodeJS.Timeout),
  reportFailure: () => console.error("[user-activity] offline reconciliation failed.")
};

export function startUserActivityReconciliation(
  repository: UserActivityRepository,
  env: NodeJS.ProcessEnv = process.env,
  dependencies: ReconciliationDependencies = defaultDependencies
): () => void {
  const config = resolveUserActivityReconciliationConfig(env);
  if (!config.enabled) return () => undefined;
  let running = false;
  const reconcile = async (): Promise<void> => {
    if (running) return;
    running = true;
    try {
      await repository.reconcileExpired(dependencies.now(), config);
    } catch {
      dependencies.reportFailure();
    } finally {
      running = false;
    }
  };
  const handle = dependencies.setInterval(() => { void reconcile(); }, config.intervalMs);
  handle.unref?.();
  void reconcile();
  return () => dependencies.clearInterval(handle);
}
