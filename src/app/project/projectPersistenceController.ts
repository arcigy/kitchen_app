import { ProjectApiError } from "./projectApi";
import type { ProjectActions } from "./projectActions";
import type { ProjectRecoveryLease } from "./projectRecoveryLease";
import type { ProjectRecoveryStore } from "./projectRecoveryStore";
import type { ProjectRecoveryCapture, ProjectStateCodec } from "./projectStateCodec";
import {
  PROJECT_RECOVERY_SCHEMA_VERSION,
  type LastWorkspacePointerV1,
  type ProjectInteractionCheckpoint,
  type ProjectRecoveryEnvelopeV1,
  type ProjectRecoveryScope,
  type ProjectRecoveryWorkspace
} from "./projectRecoveryTypes";

const DEFAULT_LOCAL_DELAY_MS = 250;
const DEFAULT_INTERACTION_DELAY_MS = 150;
const DEFAULT_INTERACTION_MAX_MS = 500;
const DEFAULT_SERVER_IDLE_MS = 30_000;
const DEFAULT_SERVER_MAX_MS = 120_000;
const DEFAULT_OBSERVE_MS = 100;
const SERVER_RETRY_DELAYS_MS = [5_000, 15_000, 30_000, 60_000] as const;

type TimerHandle = ReturnType<typeof globalThis.setTimeout>;

export type ProjectPersistenceController = {
  start(): void;
  stop(options?: { flush?: boolean }): Promise<void>;
  switchScope(scope: ProjectRecoveryScope, lease: ProjectRecoveryLease, options?: { saveInitialState?: boolean }): Promise<void>;
  isPrimaryWriter(): boolean;
  takeOver(): boolean;
  markDomainChanged(): void;
  markWorkspaceChanged(): void;
  checkpointInteraction(checkpoint: ProjectInteractionCheckpoint | null): void;
  flushLocal(): Promise<void>;
  saveServer(): Promise<void>;
};

export function createProjectPersistenceController(args: {
  actions: ProjectActions;
  codec: ProjectStateCodec;
  store: ProjectRecoveryStore;
  lease: ProjectRecoveryLease;
  scope: ProjectRecoveryScope;
  getWorkspace(): ProjectRecoveryWorkspace;
  writeWorkspacePointer(pointer: LastWorkspacePointerV1): void;
  getObservedToken?(): string;
  setInteractionCheckpoint?(checkpoint: ProjectInteractionCheckpoint | null): void;
  appVersion?: string | null;
  saveInitialState?: boolean;
  initialSequence?: number;
  initialCreatedAt?: string;
  now?: () => number;
  setTimeout?: typeof globalThis.setTimeout;
  clearTimeout?: typeof globalThis.clearTimeout;
  setInterval?: typeof globalThis.setInterval;
  clearInterval?: typeof globalThis.clearInterval;
  localDelayMs?: number;
  interactionDelayMs?: number;
  interactionMaxMs?: number;
  serverIdleMs?: number;
  serverMaxMs?: number;
  observeMs?: number;
  onConflict?(error: ProjectApiError): void;
  onLocalError?(error: unknown): void;
  onSaveError?(error: unknown): void;
  onWriterStateChanged?(primary: boolean): void;
}): ProjectPersistenceController {
  const now = args.now ?? Date.now;
  const setTimeoutFn = args.setTimeout ?? globalThis.setTimeout;
  const clearTimeoutFn = args.clearTimeout ?? globalThis.clearTimeout;
  const setIntervalFn = args.setInterval ?? globalThis.setInterval;
  const clearIntervalFn = args.clearInterval ?? globalThis.clearInterval;
  const localDelayMs = args.localDelayMs ?? DEFAULT_LOCAL_DELAY_MS;
  const interactionDelayMs = args.interactionDelayMs ?? DEFAULT_INTERACTION_DELAY_MS;
  const interactionMaxMs = args.interactionMaxMs ?? DEFAULT_INTERACTION_MAX_MS;
  const serverIdleMs = args.serverIdleMs ?? DEFAULT_SERVER_IDLE_MS;
  const serverMaxMs = args.serverMaxMs ?? DEFAULT_SERVER_MAX_MS;
  const observeMs = args.observeMs ?? DEFAULT_OBSERVE_MS;
  let started = false;
  let scope = args.scope;
  let lease = args.lease;
  let sequence = args.initialSequence ?? 0;
  let createdAt = args.initialCreatedAt ?? new Date(now()).toISOString();
  let localTimer: TimerHandle | null = null;
  let serverTimer: TimerHandle | null = null;
  let observerTimer: ReturnType<typeof setIntervalFn> | null = null;
  let dirtySince: number | null = null;
  let interactionDirtySince: number | null = null;
  let dirtyGeneration = 0;
  let persistedGeneration = -1;
  let serverSavedGeneration = -1;
  let localInFlight: Promise<void> | null = null;
  let serverInFlight: Promise<void> | null = null;
  let retryIndex = 0;
  let serverSyncBlocked = false;
  let lastObservedToken: string | null = null;
  let lastWriterState: boolean | null = null;
  let switchingScope = false;

  const emitWriterState = () => {
    const primary = lease.isOwner();
    if (primary === lastWriterState) return;
    lastWriterState = primary;
    args.onWriterStateChanged?.(primary);
  };

  const clearLocalTimer = () => {
    if (localTimer === null) return;
    clearTimeoutFn(localTimer);
    localTimer = null;
  };

  const clearServerTimer = () => {
    if (serverTimer === null) return;
    clearTimeoutFn(serverTimer);
    serverTimer = null;
  };

  const scheduleLocal = (interaction: boolean) => {
    clearLocalTimer();
    const current = now();
    if (interaction && interactionDirtySince === null) interactionDirtySince = current;
    const delay = interaction
      ? Math.max(0, Math.min(interactionDelayMs, interactionMaxMs - (current - (interactionDirtySince ?? current))))
      : localDelayMs;
    localTimer = setTimeoutFn(() => {
      localTimer = null;
      void flushLocal().catch((error: unknown) => args.onLocalError?.(error));
    }, delay);
  };

  const scheduleServer = (delayOverride?: number) => {
    clearServerTimer();
    if (serverSyncBlocked || !args.actions.getState().currentProject || !lease.isOwner()) return;
    const current = now();
    const maxDelay = dirtySince === null ? serverIdleMs : Math.max(0, serverMaxMs - (current - dirtySince));
    const delay = delayOverride ?? Math.min(serverIdleMs, maxDelay);
    serverTimer = setTimeoutFn(() => {
      serverTimer = null;
      void saveServer();
    }, Math.max(0, delay));
  };

  const markChanged = (interaction: boolean) => {
    if (!started || switchingScope) return;
    if (dirtySince === null) dirtySince = now();
    dirtyGeneration += 1;
    scheduleLocal(interaction);
    scheduleServer();
  };

  const scheduleInitialCheckpoint = (saveInitialState: boolean) => {
    dirtyGeneration += 1;
    scheduleLocal(false);
    if (!saveInitialState) return;
    dirtySince = now();
    scheduleServer();
  };

  const buildEnvelope = (capture: ProjectRecoveryCapture): ProjectRecoveryEnvelopeV1 => {
    const workspace = args.getWorkspace();
    const updatedAt = new Date(now()).toISOString();
    sequence += 1;
    return {
      schemaVersion: PROJECT_RECOVERY_SCHEMA_VERSION,
      appVersion: args.appVersion ?? null,
      scope,
      baseServerRevision: args.actions.getState().saveRevision,
      sequence,
      writer: { ownerId: lease.ownerId, fencingToken: lease.fencingToken() },
      createdAt,
      updatedAt,
      appState: capture.appState,
      workspace,
      interaction: capture.interaction,
      historyTail: capture.historyTail
    };
  };

  const flushLocal = async () => {
    if (!started || switchingScope || !lease.isOwner()) return;
    if (localInFlight) {
      await localInFlight;
      if (persistedGeneration < dirtyGeneration) return flushLocal();
      return;
    }
    const generation = dirtyGeneration;
    localInFlight = (async () => {
      const envelope = buildEnvelope(args.codec.captureRecovery());
      if (!envelope.writer || envelope.writer.fencingToken <= 0) return;
      args.writeWorkspacePointer({
        version: 1,
        clientId: scope.clientId,
        userId: scope.userId,
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
        updatedAt: envelope.updatedAt
      });
      await args.store.writeActive(envelope);
      persistedGeneration = Math.max(persistedGeneration, generation);
      interactionDirtySince = null;
    })().finally(() => {
      localInFlight = null;
    });
    await localInFlight;
  };

  const isRevisionConflict = (error: unknown): error is ProjectApiError =>
    error instanceof ProjectApiError && error.status === 409 && error.code === "PROJECT_SAVE_REVISION_CONFLICT";

  const saveServer = async () => {
    if (serverSyncBlocked || !started || switchingScope || !lease.isOwner() || !args.actions.getState().currentProject) return;
    if (serverInFlight) {
      await serverInFlight;
      if (serverSavedGeneration < dirtyGeneration) scheduleServer(0);
      return;
    }
    clearServerTimer();
    const generation = dirtyGeneration;
    const saveWriter = { ownerId: lease.ownerId, fencingToken: lease.fencingToken() };
    if (saveWriter.fencingToken <= 0) return;
    serverInFlight = (async () => {
      try {
        await flushLocal();
        if (!lease.isOwner() || lease.fencingToken() !== saveWriter.fencingToken) return;
        await args.actions.save({ background: true });
        serverSavedGeneration = generation;
        retryIndex = 0;
        if (serverSavedGeneration >= dirtyGeneration) dirtySince = null;
        // Update the draft base revision after the authoritative write. The
        // local envelope remains useful for an immediate refresh.
        await flushLocal();
      } catch (error) {
        if (isRevisionConflict(error)) {
          await args.store.archiveActive(scope, "revision-conflict", saveWriter);
          serverSyncBlocked = true;
          dirtySince = null;
          args.onConflict?.(error);
          return;
        }
        args.onSaveError?.(error);
        const delay = SERVER_RETRY_DELAYS_MS[Math.min(retryIndex, SERVER_RETRY_DELAYS_MS.length - 1)]!;
        retryIndex = Math.min(retryIndex + 1, SERVER_RETRY_DELAYS_MS.length - 1);
        scheduleServer(delay);
      }
    })().finally(() => {
      serverInFlight = null;
      if (serverSavedGeneration < dirtyGeneration && serverTimer === null) scheduleServer();
    });
    await serverInFlight;
  };

  const handleVisibility = () => {
    if (typeof document !== "undefined" && document.visibilityState !== "hidden") return;
    void flushLocal().catch((error: unknown) => args.onLocalError?.(error));
  };
  const handlePageHide = () => {
    void flushLocal().catch((error: unknown) => args.onLocalError?.(error));
    // A normal refresh or navigation must not leave the replacement page
    // read-only until the crash-expiry timeout elapses.
    lease.release();
  };

  return {
    start() {
      if (started) return;
      started = true;
      lease.start();
      emitWriterState();
      if (args.getObservedToken) {
        lastObservedToken = args.getObservedToken();
        observerTimer = setIntervalFn(() => {
          emitWriterState();
          const token = args.getObservedToken?.() ?? null;
          if (token !== null && token !== lastObservedToken) {
            lastObservedToken = token;
            markChanged(true);
          }
        }, observeMs);
      }
      if (typeof document !== "undefined") document.addEventListener("visibilitychange", handleVisibility);
      if (typeof window !== "undefined") window.addEventListener("pagehide", handlePageHide);
      scheduleInitialCheckpoint(args.saveInitialState === true);
    },
    async stop(options = {}) {
      if (!started) return;
      try {
        if (options.flush !== false) await flushLocal();
      } finally {
        started = false;
        clearLocalTimer();
        clearServerTimer();
        if (observerTimer !== null) {
          clearIntervalFn(observerTimer);
          observerTimer = null;
        }
        if (typeof document !== "undefined") document.removeEventListener("visibilitychange", handleVisibility);
        if (typeof window !== "undefined") window.removeEventListener("pagehide", handlePageHide);
        lease.stop();
      }
    },
    async switchScope(nextScope, nextLease, options = {}) {
      if (
        scope.clientId === nextScope.clientId
        && scope.userId === nextScope.userId
        && scope.workspaceId === nextScope.workspaceId
        && scope.projectId === nextScope.projectId
      ) return;
      switchingScope = true;
      clearLocalTimer();
      clearServerTimer();
      lease.stop();
      if (localInFlight) await localInFlight;
      if (serverInFlight) await serverInFlight;
      scope = nextScope;
      lease = nextLease;
      sequence = 0;
      createdAt = new Date(now()).toISOString();
      dirtySince = null;
      interactionDirtySince = null;
      dirtyGeneration = 0;
      persistedGeneration = -1;
      serverSavedGeneration = -1;
      retryIndex = 0;
      serverSyncBlocked = false;
      lastWriterState = null;
      switchingScope = false;
      if (started) {
        lease.start();
        emitWriterState();
        scheduleInitialCheckpoint(options.saveInitialState === true);
      }
    },
    isPrimaryWriter: () => lease.isOwner(),
    takeOver() {
      const acquired = lease.acquire(true);
      emitWriterState();
      if (acquired) markChanged(false);
      return acquired;
    },
    markDomainChanged: () => markChanged(false),
    markWorkspaceChanged: () => markChanged(false),
    checkpointInteraction(checkpoint) {
      args.setInteractionCheckpoint?.(checkpoint);
      markChanged(true);
    },
    flushLocal,
    saveServer
  };
}
