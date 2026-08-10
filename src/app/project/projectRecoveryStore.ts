import { validateProjectAppState } from "../../core/project-save/project-app-state-validation";
import type { ProjectMetadata } from "../../core/project/project-types";
import {
  isProjectRecoveryEnvelopeV1,
  projectRecoveryProjectKey,
  projectRecoveryScopeKey,
  type LastWorkspacePointerV1,
  type ProjectRecoveryArchiveV1,
  type ProjectRecoveryEnvelopeV1,
  type ProjectRecoveryScope,
  type ProjectRecoveryWriter
} from "./projectRecoveryTypes";

const RECOVERY_DB_NAME = "arcigy-kitchen-project-recovery";
const RECOVERY_DB_VERSION = 2;
const ACTIVE_STORE = "active-drafts";
const ARCHIVE_STORE = "conflict-archives";
const LAST_WORKSPACE_KEY = "arcigy.kitchen.lastWorkspace.v1";
const MAX_ARCHIVES_PER_PROJECT = 3;
const MAX_RECOVERY_BYTES = 100 * 1024 * 1024;
const MAX_ARCHIVE_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type ActiveDraftRecord = {
  key: string;
  projectKey: string;
  bytes: number;
  envelope: ProjectRecoveryEnvelopeV1;
};

type ArchiveRecord = ProjectRecoveryArchiveV1 & {
  projectKey: string;
  bytes: number;
};

export type RecoverableProjectSummary = {
  project: ProjectMetadata;
  scope: ProjectRecoveryScope;
  updatedAt: string;
};

export type ProjectRecoveryStore = {
  readActive(scope: ProjectRecoveryScope): Promise<ProjectRecoveryEnvelopeV1 | null>;
  writeActive(envelope: ProjectRecoveryEnvelopeV1): Promise<void>;
  deleteActive(scope: ProjectRecoveryScope): Promise<void>;
  archiveActive(
    scope: ProjectRecoveryScope,
    reason: ProjectRecoveryArchiveV1["reason"],
    expectedWriter?: ProjectRecoveryWriter
  ): Promise<ProjectRecoveryArchiveV1 | null>;
  listArchives(scope: Pick<ProjectRecoveryScope, "clientId" | "userId" | "projectId">): Promise<ProjectRecoveryArchiveV1[]>;
  listRecoverableProjects(clientId: string, userId: string): Promise<RecoverableProjectSummary[]>;
  clearProject(clientId: string, userId: string, projectId: string): Promise<void>;
  clearAll(): Promise<void>;
};

function requestResult<T>(request: IDBRequest<T>): Promise<T | null> {
  return new Promise((resolve) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Project recovery transaction failed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Project recovery transaction was aborted."));
  });
}

function openRecoveryDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (database: IDBDatabase | null) => {
      if (settled) {
        database?.close();
        return;
      }
      settled = true;
      resolve(database);
    };
    try {
      const request = indexedDB.open(RECOVERY_DB_NAME, RECOVERY_DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(ACTIVE_STORE)) database.createObjectStore(ACTIVE_STORE, { keyPath: "key" });
        if (!database.objectStoreNames.contains(ARCHIVE_STORE)) database.createObjectStore(ARCHIVE_STORE, { keyPath: "archiveId" });
      };
      request.onsuccess = () => finish(request.result);
      request.onerror = () => finish(null);
      request.onblocked = () => finish(null);
    } catch {
      finish(null);
    }
  });
}

function serializedBytes(value: unknown): number {
  return new Blob([JSON.stringify(value)]).size;
}

function trimEnvelopeForStorage(source: ProjectRecoveryEnvelopeV1): ProjectRecoveryEnvelopeV1 {
  const envelope = structuredClone(source);
  const preview = envelope.appState.projectPreview;
  if (preview?.imageDataUrl && serializedBytes(envelope) > MAX_RECOVERY_BYTES / 2) {
    delete envelope.appState.projectPreview;
  }
  while (envelope.historyTail.length > 0 && serializedBytes(envelope) > MAX_RECOVERY_BYTES) {
    envelope.historyTail.shift();
  }
  return envelope;
}

function validateEnvelope(envelope: ProjectRecoveryEnvelopeV1): void {
  if (!isProjectRecoveryEnvelopeV1(envelope)) throw new Error("Project recovery draft has an unsupported schema.");
  validateProjectAppState(envelope.appState);
  if (envelope.workspace.kind === "project" && !envelope.workspace.project) {
    throw new Error("Project recovery draft is missing project metadata.");
  }
  if (envelope.workspace.project && envelope.workspace.project.projectId !== envelope.scope.projectId) {
    throw new Error("Project recovery metadata does not match its scope.");
  }
  if (envelope.workspace.project && envelope.workspace.project.clientId !== envelope.scope.clientId) {
    throw new Error("Project recovery tenant does not match its scope.");
  }
}

export function recoveryEnvelopeMatchesWriter(
  envelope: ProjectRecoveryEnvelopeV1,
  expectedWriter: ProjectRecoveryWriter
): boolean {
  return envelope.writer?.ownerId === expectedWriter.ownerId
    && envelope.writer.fencingToken === expectedWriter.fencingToken;
}

async function getAll<T>(database: IDBDatabase, storeName: string): Promise<T[]> {
  const transaction = database.transaction(storeName, "readonly");
  const result = await requestResult(transaction.objectStore(storeName).getAll());
  return Array.isArray(result) ? result as T[] : [];
}

async function prune(database: IDBDatabase): Promise<void> {
  const now = Date.now();
  const active = await getAll<ActiveDraftRecord>(database, ACTIVE_STORE);
  const archives = await getAll<ArchiveRecord>(database, ARCHIVE_STORE);
  const keepArchiveIds = new Set<string>();
  const byProject = new Map<string, ArchiveRecord[]>();
  for (const archive of archives) {
    if (now - Date.parse(archive.archivedAt) > MAX_ARCHIVE_AGE_MS) continue;
    const list = byProject.get(archive.projectKey) ?? [];
    list.push(archive);
    byProject.set(archive.projectKey, list);
  }
  for (const list of byProject.values()) {
    list.sort((left, right) => Date.parse(right.archivedAt) - Date.parse(left.archivedAt));
    list.slice(0, MAX_ARCHIVES_PER_PROJECT).forEach((item) => keepArchiveIds.add(item.archiveId));
  }
  let totalBytes = active.reduce((sum, item) => sum + item.bytes, 0);
  const keptArchives = archives
    .filter((item) => keepArchiveIds.has(item.archiveId))
    .sort((left, right) => Date.parse(right.archivedAt) - Date.parse(left.archivedAt));
  const budgetedArchiveIds = new Set<string>();
  for (const archive of keptArchives) {
    if (totalBytes + archive.bytes > MAX_RECOVERY_BYTES) continue;
    totalBytes += archive.bytes;
    budgetedArchiveIds.add(archive.archiveId);
  }
  const deleteIds = archives.filter((item) => !budgetedArchiveIds.has(item.archiveId)).map((item) => item.archiveId);
  if (deleteIds.length === 0) return;
  const transaction = database.transaction(ARCHIVE_STORE, "readwrite");
  const store = transaction.objectStore(ARCHIVE_STORE);
  deleteIds.forEach((id) => store.delete(id));
  await transactionDone(transaction);
}

export function createProjectRecoveryStore(): ProjectRecoveryStore {
  return {
    async readActive(scope) {
      const database = await openRecoveryDatabase();
      if (!database) return null;
      try {
        const transaction = database.transaction(ACTIVE_STORE, "readonly");
        const record = await requestResult(transaction.objectStore(ACTIVE_STORE).get(projectRecoveryScopeKey(scope))) as ActiveDraftRecord | null;
        if (!record || !isProjectRecoveryEnvelopeV1(record.envelope)) return null;
        try {
          validateEnvelope(record.envelope);
          return record.envelope;
        } catch {
          return null;
        }
      } finally {
        database.close();
      }
    },
    async writeActive(source) {
      const envelope = trimEnvelopeForStorage(source);
      validateEnvelope(envelope);
      const bytes = serializedBytes(envelope);
      if (bytes > MAX_RECOVERY_BYTES) throw new Error("Active project recovery draft exceeds the local recovery limit.");
      const database = await openRecoveryDatabase();
      if (!database) return;
      try {
        const activeDrafts = await getAll<ActiveDraftRecord>(database, ACTIVE_STORE);
        const activeBytes = activeDrafts
          .filter((record) => record.key !== projectRecoveryScopeKey(envelope.scope))
          .reduce((sum, record) => sum + record.bytes, bytes);
        if (activeBytes > MAX_RECOVERY_BYTES) {
          throw new Error("Project recovery storage is full. Existing active drafts were preserved.");
        }
        const transaction = database.transaction(ACTIVE_STORE, "readwrite");
        const done = transactionDone(transaction);
        const store = transaction.objectStore(ACTIVE_STORE);
        const key = projectRecoveryScopeKey(envelope.scope);
        const existing = await requestResult(store.get(key)) as ActiveDraftRecord | null;
        const existingFence = existing?.envelope.writer?.fencingToken ?? 0;
        const incomingFence = envelope.writer?.fencingToken ?? 0;
        if (
          existing
          && (existingFence > incomingFence || (existingFence === incomingFence && existing.envelope.sequence >= envelope.sequence))
        ) {
          await done;
          return;
        }
        store.put({
          key,
          projectKey: projectRecoveryProjectKey(envelope.scope),
          bytes,
          envelope
        } satisfies ActiveDraftRecord);
        await done;
        await prune(database);
      } finally {
        database.close();
      }
    },
    async deleteActive(scope) {
      const database = await openRecoveryDatabase();
      if (!database) return;
      try {
        const transaction = database.transaction(ACTIVE_STORE, "readwrite");
        transaction.objectStore(ACTIVE_STORE).delete(projectRecoveryScopeKey(scope));
        await transactionDone(transaction);
      } finally {
        database.close();
      }
    },
    async archiveActive(scope, reason, expectedWriter) {
      const database = await openRecoveryDatabase();
      if (!database) return null;
      try {
        const transaction = database.transaction([ACTIVE_STORE, ARCHIVE_STORE], "readwrite");
        const done = transactionDone(transaction);
        const activeStore = transaction.objectStore(ACTIVE_STORE);
        const active = await requestResult(activeStore.get(projectRecoveryScopeKey(scope))) as ActiveDraftRecord | null;
        if (
          !active
          || !isProjectRecoveryEnvelopeV1(active.envelope)
          || (expectedWriter && !recoveryEnvelopeMatchesWriter(active.envelope, expectedWriter))
        ) {
          await done;
          return null;
        }
        const archivedAt = new Date().toISOString();
        const archive: ProjectRecoveryArchiveV1 = {
          archiveId: `${projectRecoveryProjectKey(scope)}:${archivedAt}:${crypto.randomUUID()}`,
          reason,
          archivedAt,
          envelope: active.envelope
        };
        transaction.objectStore(ARCHIVE_STORE).put({
          ...archive,
          projectKey: projectRecoveryProjectKey(scope),
          bytes: serializedBytes(archive)
        } satisfies ArchiveRecord);
        activeStore.delete(projectRecoveryScopeKey(scope));
        await done;
        await prune(database);
        return archive;
      } finally {
        database.close();
      }
    },
    async listArchives(scope) {
      const database = await openRecoveryDatabase();
      if (!database) return [];
      try {
        return (await getAll<ArchiveRecord>(database, ARCHIVE_STORE))
          .filter((item) => item.projectKey === projectRecoveryProjectKey(scope))
          .sort((left, right) => Date.parse(right.archivedAt) - Date.parse(left.archivedAt))
          .map(({ projectKey: _projectKey, bytes: _bytes, ...archive }) => archive);
      } finally {
        database.close();
      }
    },
    async listRecoverableProjects(clientId, userId) {
      const database = await openRecoveryDatabase();
      if (!database) return [];
      try {
        return (await getAll<ActiveDraftRecord>(database, ACTIVE_STORE))
          .map((record) => record.envelope)
          .filter((envelope) => envelope.scope.clientId === clientId && envelope.scope.userId === userId && !!envelope.workspace.project)
          .map((envelope) => ({ project: envelope.workspace.project!, scope: envelope.scope, updatedAt: envelope.updatedAt }));
      } finally {
        database.close();
      }
    },
    async clearProject(clientId, userId, projectId) {
      const database = await openRecoveryDatabase();
      if (!database) return;
      try {
        const projectKey = projectRecoveryProjectKey({ clientId, userId, projectId });
        const active = await getAll<ActiveDraftRecord>(database, ACTIVE_STORE);
        const archives = await getAll<ArchiveRecord>(database, ARCHIVE_STORE);
        const transaction = database.transaction([ACTIVE_STORE, ARCHIVE_STORE], "readwrite");
        active.filter((item) => item.projectKey === projectKey).forEach((item) => transaction.objectStore(ACTIVE_STORE).delete(item.key));
        archives.filter((item) => item.projectKey === projectKey).forEach((item) => transaction.objectStore(ARCHIVE_STORE).delete(item.archiveId));
        await transactionDone(transaction);
      } finally {
        database.close();
      }
    },
    async clearAll() {
      const database = await openRecoveryDatabase();
      if (!database) return;
      try {
        const transaction = database.transaction([ACTIVE_STORE, ARCHIVE_STORE], "readwrite");
        transaction.objectStore(ACTIVE_STORE).clear();
        transaction.objectStore(ARCHIVE_STORE).clear();
        await transactionDone(transaction);
      } finally {
        database.close();
      }
    }
  };
}

export function readLastWorkspacePointer(clientId: string, userId: string, storage: Pick<Storage, "getItem"> = window.localStorage): LastWorkspacePointerV1 | null {
  try {
    const raw = storage.getItem(LAST_WORKSPACE_KEY);
    if (!raw) return null;
    const pointer = JSON.parse(raw) as Partial<LastWorkspacePointerV1>;
    if (pointer.version !== 1 || pointer.clientId !== clientId || pointer.userId !== userId || typeof pointer.workspaceId !== "string") return null;
    if (pointer.projectId !== null && typeof pointer.projectId !== "string") return null;
    if (typeof pointer.updatedAt !== "string" || !Number.isFinite(Date.parse(pointer.updatedAt))) return null;
    return pointer as LastWorkspacePointerV1;
  } catch {
    return null;
  }
}

export function writeLastWorkspacePointer(pointer: LastWorkspacePointerV1, storage: Pick<Storage, "setItem"> = window.localStorage): void {
  try {
    storage.setItem(LAST_WORKSPACE_KEY, JSON.stringify(pointer));
  } catch {
    // Local recovery remains best effort when browser storage is blocked.
  }
}

export function clearLastWorkspacePointer(storage: Pick<Storage, "removeItem"> = window.localStorage): void {
  try {
    storage.removeItem(LAST_WORKSPACE_KEY);
  } catch {
    // Best effort only.
  }
}

export async function clearProjectRecoveryForBrowser(): Promise<void> {
  clearLastWorkspacePointer();
  await createProjectRecoveryStore().clearAll();
}
