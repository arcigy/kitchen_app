import { projectRecoveryScopeKey, type ProjectRecoveryScope } from "./projectRecoveryTypes";

const LEASE_PREFIX = "arcigy.kitchen.projectRecoveryLease.v1:";
const DEFAULT_LEASE_MS = 6_000;
const DEFAULT_HEARTBEAT_MS = 2_000;

type LeaseRecord = {
  version: 1;
  ownerId: string;
  expiresAt: number;
  fencingToken: number;
};

type LeaseStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function readLease(storage: LeaseStorage, key: string): LeaseRecord | null {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const lease = JSON.parse(raw) as Partial<LeaseRecord>;
    if (lease.version !== 1 || typeof lease.ownerId !== "string" || typeof lease.expiresAt !== "number") return null;
    return {
      version: 1,
      ownerId: lease.ownerId,
      expiresAt: lease.expiresAt,
      fencingToken: typeof lease.fencingToken === "number" && Number.isSafeInteger(lease.fencingToken)
        ? Math.max(0, lease.fencingToken)
        : 0
    };
  } catch {
    return null;
  }
}

export type ProjectRecoveryLease = {
  readonly ownerId: string;
  fencingToken(): number;
  isOwner(): boolean;
  acquire(force?: boolean): boolean;
  release(): void;
  start(): void;
  stop(): void;
};

export function createProjectRecoveryLease(args: {
  scope: ProjectRecoveryScope;
  storage?: LeaseStorage;
  now?: () => number;
  setInterval?: typeof globalThis.setInterval;
  clearInterval?: typeof globalThis.clearInterval;
  ownerId?: string;
  leaseMs?: number;
  heartbeatMs?: number;
}): ProjectRecoveryLease {
  const storage = args.storage ?? window.localStorage;
  const now = args.now ?? Date.now;
  const setIntervalFn = args.setInterval ?? globalThis.setInterval;
  const clearIntervalFn = args.clearInterval ?? globalThis.clearInterval;
  const leaseMs = args.leaseMs ?? DEFAULT_LEASE_MS;
  const heartbeatMs = args.heartbeatMs ?? DEFAULT_HEARTBEAT_MS;
  const key = `${LEASE_PREFIX}${projectRecoveryScopeKey(args.scope)}`;
  const ownerId = args.ownerId ?? crypto.randomUUID();
  let timer: ReturnType<typeof setIntervalFn> | null = null;

  const isOwner = () => {
    const lease = readLease(storage, key);
    return lease?.ownerId === ownerId && lease.expiresAt > now();
  };

  const acquire = (force = false) => {
    const current = readLease(storage, key);
    if (!force && current && current.ownerId !== ownerId && current.expiresAt > now()) return false;
    const fencingToken = current?.ownerId === ownerId
      ? current.fencingToken
      : (current?.fencingToken ?? 0) + 1;
    const next: LeaseRecord = { version: 1, ownerId, expiresAt: now() + leaseMs, fencingToken };
    try {
      storage.setItem(key, JSON.stringify(next));
      return readLease(storage, key)?.ownerId === ownerId;
    } catch {
      return false;
    }
  };

  const release = () => {
    const current = readLease(storage, key);
    if (!current || current.ownerId !== ownerId) return;
    try {
      storage.setItem(key, JSON.stringify({ ...current, expiresAt: 0 } satisfies LeaseRecord));
    } catch {
      // Best effort only.
    }
  };

  return {
    ownerId,
    fencingToken() {
      const current = readLease(storage, key);
      return current?.ownerId === ownerId ? current.fencingToken : 0;
    },
    isOwner,
    acquire,
    release,
    start() {
      if (timer !== null) return;
      acquire();
      timer = setIntervalFn(() => {
        if (isOwner()) acquire(true);
        else acquire(false);
      }, heartbeatMs);
    },
    stop() {
      if (timer !== null) {
        clearIntervalFn(timer);
        timer = null;
      }
      release();
    }
  };
}
