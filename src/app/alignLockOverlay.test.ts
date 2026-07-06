import { describe, expect, it, vi } from "vitest";
import type { AlignLock } from "./localTypes";
import { alignLockIsVisibleForTargets, toggleAlignLockOverlayState } from "./alignLockOverlay";

const lock = (id: string, locked = false): AlignLock => ({
  id,
  locked,
  a: { targetKind: "module", targetId: "a", lineRole: "edge", moduleSide: "right" },
  b: { targetKind: "module", targetId: "b", lineRole: "edge", moduleSide: "left" },
  pointMm: { x: 0, z: 0 }
});

describe("align lock overlay", () => {
  it("locks an unlocked lock on the first overlay toggle", () => {
    const locks = [lock("lock-1", false)];
    const onToggle = vi.fn();

    expect(toggleAlignLockOverlayState({ getLocks: () => locks, lockId: "lock-1", onToggle })).toBe(true);

    expect(locks[0]?.locked).toBe(true);
    expect(onToggle).toHaveBeenCalledExactlyOnceWith(locks[0]);
  });

  it("toggles the current state lock object after lock snapshots are replaced", () => {
    const staleLock = lock("lock-1", false);
    const currentLocks = [lock("lock-1", false)];
    const onToggle = vi.fn();

    expect(toggleAlignLockOverlayState({ getLocks: () => currentLocks, lockId: staleLock.id, onToggle })).toBe(true);

    expect(staleLock.locked).toBe(false);
    expect(currentLocks[0]?.locked).toBe(true);
    expect(onToggle).toHaveBeenCalledExactlyOnceWith(currentLocks[0]);
  });

  it("shows a lock only when one of its two objects is selected", () => {
    const item = lock("lock-1", false);

    expect(alignLockIsVisibleForTargets(item, [])).toBe(false);
    expect(alignLockIsVisibleForTargets(item, [{ targetKind: "module", targetId: "a" }])).toBe(true);
    expect(alignLockIsVisibleForTargets(item, [{ targetKind: "module", targetId: "b" }])).toBe(true);
    expect(alignLockIsVisibleForTargets(item, [{ targetKind: "module", targetId: "other" }])).toBe(false);
    expect(alignLockIsVisibleForTargets(item, [{ targetKind: "wall", targetId: "a" }])).toBe(false);
  });
});
