import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ClientContext } from "../client/client-context";
import { resolveClientStoragePath } from "../storage/storage-path-resolver";
import { createEmptySupplierBridgeTenantState, type SupplierBridgeTenantState } from "./supplier-bridge-types";
import {
  createSupplierBridgeRepositoryFromStateStore,
  type SupplierBridgeRepository,
  type SupplierBridgeTenantStateStore
} from "./supplier-bridge-repository";
import { validateSupplierBridgeTenantState } from "./supplier-bridge-validation";

const writeQueues = new Map<string, Promise<void>>();

function contextForTenant(tenantId: string): ClientContext {
  return { clientId: tenantId, userId: "supplier-bridge-file-repository", role: "owner" };
}

function statePath(projectRoot: string, tenantId: string): string {
  return path.join(resolveClientStoragePath(projectRoot, contextForTenant(tenantId)), "supplier-bridge", "state.json");
}

async function readState(filePath: string): Promise<SupplierBridgeTenantState> {
  try {
    return validateSupplierBridgeTenantState(JSON.parse(await readFile(filePath, "utf-8")) as unknown);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") {
      return createEmptySupplierBridgeTenantState();
    }
    throw error;
  }
}

async function withWriteLock<T>(filePath: string, operation: () => Promise<T>): Promise<T> {
  const previous = writeQueues.get(filePath) ?? Promise.resolve();
  const ready = previous.catch(() => undefined);
  let release: () => void = () => undefined;
  const barrier = new Promise<void>((resolve) => { release = resolve; });
  const queued = ready.then(() => barrier);
  writeQueues.set(filePath, queued);
  await ready;
  try {
    return await operation();
  } finally {
    release();
    if (writeQueues.get(filePath) === queued) writeQueues.delete(filePath);
  }
}

export function createFileSupplierBridgeRepository(projectRoot: string): SupplierBridgeRepository {
  const root = path.resolve(projectRoot);
  const store: SupplierBridgeTenantStateStore = {
    async read(tenantId) {
      return structuredClone(await readState(statePath(root, tenantId)));
    },
    async update(tenantId, mutation) {
      const filePath = statePath(root, tenantId);
      return withWriteLock(filePath, async () => {
        const state = await readState(filePath);
        const result = await mutation(state);
        const validated = validateSupplierBridgeTenantState(state);
        await mkdir(path.dirname(filePath), { recursive: true });
        await writeFile(filePath, JSON.stringify(validated, null, 2), "utf-8");
        return structuredClone(result);
      });
    }
  };
  return createSupplierBridgeRepositoryFromStateStore(store);
}
