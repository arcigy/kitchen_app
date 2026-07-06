import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { AlignPickedLine } from "./localTypes";
import type { AlignLock } from "../layout/appState";
import {
  addUnlockedAlignLockAfterAlign,
  findBlockingAlignLock,
  getLockedModuleNeighborIdsForSide,
  isProtectedAlignModule,
  resolveModuleSideFromBox,
  toggleAlignLock
} from "./alignLocks";

const moduleLine = (id: string, x: number): AlignPickedLine => ({
  p: new THREE.Vector3(x, 0, 0),
  dir: new THREE.Vector3(0, 0, 1),
  segA: new THREE.Vector3(x, 0, -0.3),
  segB: new THREE.Vector3(x, 0, 0.3),
  label: id,
  targetKind: "module",
  lineRole: "edge",
  instanceId: id
});

describe("align locks", () => {
  it("creates an unlocked lock from aligned module edges and toggles it", () => {
    const store: { alignLocks: AlignLock[]; alignLockCounter: number } = { alignLocks: [], alignLockCounter: 1 };
    const lock = addUnlockedAlignLockAfterAlign(store, moduleLine("m1", 0.5), moduleLine("m2", 0.5), {
      resolveModuleSide: (id) => (id === "m1" ? "right" : "left")
    });

    expect(lock?.locked).toBe(false);
    expect(lock?.a.moduleSide).toBe("right");
    expect(lock?.b.moduleSide).toBe("left");
    expect(lock?.a.targetId).toBe("m1");
    expect(lock?.b.targetId).toBe("m2");
    expect(toggleAlignLock(store.alignLocks, "align-lock-1")).toBe(true);
    expect(store.alignLocks[0]?.locked).toBe(true);
  });

  it("treats the moved-to-anchor endpoint as protected and stronger than the anchor", () => {
    const store: { alignLocks: AlignLock[]; alignLockCounter: number } = { alignLocks: [], alignLockCounter: 1 };
    addUnlockedAlignLockAfterAlign(store, moduleLine("anchor", 0.5), moduleLine("moved", 0.5), {
      resolveModuleSide: (id) => (id === "anchor" ? "right" : "left")
    });
    toggleAlignLock(store.alignLocks, "align-lock-1");

    expect(isProtectedAlignModule(store.alignLocks, "moved")).toBe(true);
    expect(isProtectedAlignModule(store.alignLocks, "anchor")).toBe(false);
    expect(getLockedModuleNeighborIdsForSide(store.alignLocks, "anchor", "right")).toEqual([]);
    expect(getLockedModuleNeighborIdsForSide(store.alignLocks, "moved", "left")).toEqual(["anchor"]);
  });

  it("blocks a locked module edge from being aligned to another reference", () => {
    const store: { alignLocks: AlignLock[]; alignLockCounter: number } = { alignLocks: [], alignLockCounter: 1 };
    addUnlockedAlignLockAfterAlign(store, moduleLine("m1", 0.5), moduleLine("m2", 0.5), {
      resolveModuleSide: (id) => (id === "m1" ? "right" : "left")
    });
    toggleAlignLock(store.alignLocks, "align-lock-1");

    const blocking = findBlockingAlignLock(store.alignLocks, moduleLine("m3", 2), moduleLine("m2", 0.5), {
      resolveModuleSide: (id) => (id === "m2" ? "left" : "right")
    });

    expect(blocking?.id).toBe("align-lock-1");
  });

  it("blocks aligning another edge of an object that already participates in a locked joint", () => {
    const store: { alignLocks: AlignLock[]; alignLockCounter: number } = { alignLocks: [], alignLockCounter: 1 };
    addUnlockedAlignLockAfterAlign(store, moduleLine("m1", 0.5), moduleLine("m2", 0.5), {
      resolveModuleSide: (id) => (id === "m1" ? "right" : "left")
    });
    toggleAlignLock(store.alignLocks, "align-lock-1");

    const blocking = findBlockingAlignLock(store.alignLocks, moduleLine("m3", 2), moduleLine("m2", 1.1), {
      resolveModuleSide: (id) => (id === "m2" ? "right" : "left")
    });

    expect(blocking?.id).toBe("align-lock-1");
  });

  it("resolves the closest module box side for a picked edge", () => {
    const box = new THREE.Box3(new THREE.Vector3(-0.5, 0, -0.3), new THREE.Vector3(0.5, 0.8, 0.3));

    expect(resolveModuleSideFromBox(moduleLine("m1", 0.5), box)).toBe("right");
  });
});
