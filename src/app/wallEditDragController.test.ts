import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import type { WallEditHud } from "./measureTools";
import type { WallInstance } from "./localTypes";
import {
  applyWallEditDragEndpointUpdate,
  calculateWallMoveDragEndpoints,
  finishWallEditHudDragPointerUp,
  restoreWallEditDragEndpointSnapshot,
  updateWallEditHudDragPointerMove
} from "./wallEditDragController";

function wallEditHud(overrides: Partial<WallEditHud> = {}): WallEditHud {
  const div = () => ({}) as HTMLDivElement;
  const input = () => ({}) as HTMLInputElement;
  return {
    root: div(),
    label: div(),
    input: input(),
    lenLine: div(),
    lenExtA: div(),
    lenExtB: div(),
    offsetLabel: div(),
    offsetInput: input(),
    offsetLine: div(),
    offsetTickA: div(),
    offsetTickB: div(),
    handleA: div(),
    handleB: div(),
    handleMid: div(),
    offsetRefWallId: null,
    drag: null,
    ...overrides
  };
}

function drag(pointerId = 7, wallId = "w1", overrides: Partial<NonNullable<WallEditHud["drag"]>> = {}): NonNullable<WallEditHud["drag"]> {
  return {
    wallId,
    kind: "move",
    pointerId,
    startWorld: new THREE.Vector3(),
    startA: { x: 0, z: 0 },
    startB: { x: 1000, z: 0 },
    connectedA: [],
    connectedB: [],
    ...overrides
  };
}

function wall(id = "w1"): WallInstance {
  return {
    id,
    params: {
      aMm: { x: 0, z: 0 },
      bMm: { x: 1000, z: 0 },
      thicknessMm: 150,
      heightMm: 2600,
      materialId: "default",
      justification: "center",
      exteriorSign: 1
    },
    heightMm: 2600,
    root: new THREE.Group(),
    mesh: new THREE.Mesh(),
    outline: new THREE.LineSegments()
  };
}

describe("wall edit drag controller", () => {
  it("calculates moved wall endpoints from drag start and current hit point", () => {
    expect(
      calculateWallMoveDragEndpoints(
        drag(7, "w1", {
          startWorld: new THREE.Vector3(1, 0, 2),
          startA: { x: 100, z: 200 },
          startB: { x: 1100, z: 200 }
        }),
        new THREE.Vector3(1.2344, 0, 1.8765)
      )
    ).toEqual({
      nextA: { x: 334, z: 77 },
      nextB: { x: 1334, z: 77 }
    });
  });

  it("applies wall edit drag endpoint updates to connected walls and returns touched ids", () => {
    const target = wall("w1");
    const connectedA = wall("w2");
    const connectedB = wall("w3");
    const missing = wall("w4");
    const snapshot = drag(7, "w1", {
      connectedA: [{ wallId: "w2", which: "b" }, { wallId: "missing", which: "a" }],
      connectedB: [{ wallId: "w3", which: "a" }]
    });

    const touched = applyWallEditDragEndpointUpdate({
      drag: snapshot,
      nextA: { x: 10, z: 20 },
      nextB: { x: 30, z: 40 },
      wall: target,
      walls: [target, connectedA, connectedB, missing]
    });

    expect(target.params.aMm).toEqual({ x: 10, z: 20 });
    expect(target.params.bMm).toEqual({ x: 30, z: 40 });
    expect(connectedA.params.bMm).toEqual({ x: 10, z: 20 });
    expect(connectedB.params.aMm).toEqual({ x: 30, z: 40 });
    expect(Array.from(touched)).toEqual(["w1", "w2", "w3"]);
  });

  it("restores moved wall endpoint snapshots to connected walls", () => {
    const target = wall("w1");
    const connectedA = wall("w2");
    const connectedB = wall("w3");
    const snapshot = drag(7, "w1", {
      connectedA: [{ wallId: "w2", which: "a" }],
      connectedB: [{ wallId: "w3", which: "b" }],
      startA: { x: 100, z: 200 },
      startB: { x: 1100, z: 200 }
    });
    target.params.aMm = { x: 9, z: 9 };
    target.params.bMm = { x: 9, z: 9 };
    connectedA.params.aMm = { x: 9, z: 9 };
    connectedB.params.bMm = { x: 9, z: 9 };

    restoreWallEditDragEndpointSnapshot({ drag: snapshot, wall: target, walls: [target, connectedA, connectedB] });

    expect(target.params.aMm).toEqual({ x: 100, z: 200 });
    expect(target.params.bMm).toEqual({ x: 1100, z: 200 });
    expect(connectedA.params.aMm).toEqual({ x: 100, z: 200 });
    expect(connectedB.params.bMm).toEqual({ x: 1100, z: 200 });
  });

  it("restores only the active endpoint snapshot for endpoint drags", () => {
    const target = wall("w1");
    const connectedA = wall("w2");
    const connectedB = wall("w3");
    const snapshot = drag(7, "w1", {
      kind: "a",
      connectedA: [{ wallId: "w2", which: "b" }],
      connectedB: [{ wallId: "w3", which: "a" }],
      startA: { x: 100, z: 200 },
      startB: { x: 1100, z: 200 }
    });
    target.params.aMm = { x: 9, z: 9 };
    target.params.bMm = { x: 99, z: 99 };
    connectedA.params.bMm = { x: 9, z: 9 };
    connectedB.params.aMm = { x: 9, z: 9 };

    restoreWallEditDragEndpointSnapshot({ drag: snapshot, wall: target, walls: [target, connectedA, connectedB] });

    expect(target.params.aMm).toEqual({ x: 100, z: 200 });
    expect(target.params.bMm).toEqual({ x: 99, z: 99 });
    expect(connectedA.params.bMm).toEqual({ x: 100, z: 200 });
    expect(connectedB.params.aMm).toEqual({ x: 9, z: 9 });
  });

  it("updates moved wall drag and rebuilds touched walls before plan mesh", () => {
    const target = wall("w1");
    const connected = wall("w2");
    const rebuildWall = vi.fn();
    const rebuildWallPlanMesh = vi.fn();

    updateWallEditHudDragPointerMove({
      drag: drag(7, "w1", {
        connectedA: [{ wallId: "w2", which: "a" }],
        startWorld: new THREE.Vector3(1, 0, 1),
        startA: { x: 100, z: 100 },
        startB: { x: 1100, z: 100 }
      }),
      fromMmPoint: (point) => new THREE.Vector3(point.x / 1000, 0, point.z / 1000),
      hasModuleWallOverlap: () => false,
      hitPoint: new THREE.Vector3(1.25, 0, 1.5),
      rebuildWall,
      rebuildWallPlanMesh,
      shiftKey: false,
      snapAxisXZ: (_anchor, point) => point,
      snapPoint2D: (point) => ({ kind: "none", point }),
      toMmPoint: (point) => ({ x: Math.round(point.x * 1000), z: Math.round(point.z * 1000) }),
      wall: target,
      walls: [target, connected]
    });

    expect(target.params.aMm).toEqual({ x: 350, z: 600 });
    expect(target.params.bMm).toEqual({ x: 1350, z: 600 });
    expect(connected.params.aMm).toEqual({ x: 350, z: 600 });
    expect(rebuildWall).toHaveBeenCalledWith(target);
    expect(rebuildWall).toHaveBeenCalledWith(connected);
    expect(rebuildWallPlanMesh).toHaveBeenCalledOnce();
  });

  it("restores moved wall drag and rebuilds all walls when modules overlap walls", () => {
    const target = wall("w1");
    const connected = wall("w2");
    const untouched = wall("w3");
    const rebuildWall = vi.fn();
    const rebuildWallPlanMesh = vi.fn();

    updateWallEditHudDragPointerMove({
      drag: drag(7, "w1", {
        connectedA: [{ wallId: "w2", which: "a" }],
        startWorld: new THREE.Vector3(1, 0, 1),
        startA: { x: 100, z: 100 },
        startB: { x: 1100, z: 100 }
      }),
      fromMmPoint: (point) => new THREE.Vector3(point.x / 1000, 0, point.z / 1000),
      hasModuleWallOverlap: () => true,
      hitPoint: new THREE.Vector3(1.25, 0, 1.5),
      rebuildWall,
      rebuildWallPlanMesh,
      shiftKey: false,
      snapAxisXZ: (_anchor, point) => point,
      snapPoint2D: (point) => ({ kind: "none", point }),
      toMmPoint: (point) => ({ x: Math.round(point.x * 1000), z: Math.round(point.z * 1000) }),
      wall: target,
      walls: [target, connected, untouched]
    });

    expect(target.params.aMm).toEqual({ x: 100, z: 100 });
    expect(target.params.bMm).toEqual({ x: 1100, z: 100 });
    expect(connected.params.aMm).toEqual({ x: 100, z: 100 });
    expect(rebuildWall).toHaveBeenCalledWith(untouched);
    expect(rebuildWallPlanMesh).toHaveBeenCalledTimes(2);
  });

  it("updates endpoint drag with axis snap when there is no point snap and shift is not pressed", () => {
    const target = wall("w1");
    const connected = wall("w2");
    const snapAxisXZ = vi.fn((_anchor: THREE.Vector3, _point: THREE.Vector3) => new THREE.Vector3(2, 0, 3));

    updateWallEditHudDragPointerMove({
      drag: drag(7, "w1", {
        kind: "a",
        connectedA: [{ wallId: "w2", which: "b" }],
        startA: { x: 0, z: 0 },
        startB: { x: 1000, z: 0 }
      }),
      fromMmPoint: (point) => new THREE.Vector3(point.x / 1000, 0, point.z / 1000),
      hasModuleWallOverlap: () => false,
      hitPoint: new THREE.Vector3(1.5, 0, 2.5),
      rebuildWall: vi.fn(),
      rebuildWallPlanMesh: vi.fn(),
      shiftKey: false,
      snapAxisXZ,
      snapPoint2D: (point) => ({ kind: "none", point }),
      toMmPoint: (point) => ({ x: Math.round(point.x * 1000), z: Math.round(point.z * 1000) }),
      wall: target,
      walls: [target, connected]
    });

    expect(snapAxisXZ).toHaveBeenCalledOnce();
    expect(target.params.aMm).toEqual({ x: 2000, z: 3000 });
    expect(connected.params.bMm).toEqual({ x: 2000, z: 3000 });
    expect(target.params.bMm).toEqual({ x: 1000, z: 0 });
  });

  it("updates endpoint drag with snapped point without axis snap", () => {
    const target = wall("w1");
    const snapAxisXZ = vi.fn((_anchor: THREE.Vector3, point: THREE.Vector3) => point);

    updateWallEditHudDragPointerMove({
      drag: drag(7, "w1", {
        kind: "b",
        startA: { x: 0, z: 0 },
        startB: { x: 1000, z: 0 }
      }),
      fromMmPoint: (point) => new THREE.Vector3(point.x / 1000, 0, point.z / 1000),
      hasModuleWallOverlap: () => false,
      hitPoint: new THREE.Vector3(1.5, 0, 2.5),
      rebuildWall: vi.fn(),
      rebuildWallPlanMesh: vi.fn(),
      shiftKey: false,
      snapAxisXZ,
      snapPoint2D: () => ({ kind: "endpoint", point: new THREE.Vector3(4, 0, 5) }),
      toMmPoint: (point) => ({ x: Math.round(point.x * 1000), z: Math.round(point.z * 1000) }),
      wall: target,
      walls: [target]
    });

    expect(snapAxisXZ).not.toHaveBeenCalled();
    expect(target.params.aMm).toEqual({ x: 0, z: 0 });
    expect(target.params.bMm).toEqual({ x: 4000, z: 5000 });
  });

  it("finishes wall edit drag, auto-joins endpoints, commits, and releases capture", () => {
    const hud = wallEditHud({ drag: drag() });
    const autoJoinAtMmPoint = vi.fn();
    const rebuildWallPlanMesh = vi.fn();
    const mountProps = vi.fn();
    const commitHistory = vi.fn();
    const releasePointerCapture = vi.fn();

    const handled = finishWallEditHudDragPointerUp({
      autoJoinAtMmPoint,
      commitHistory,
      mountProps,
      pointerId: 7,
      rebuildWallPlanMesh,
      releasePointerCapture,
      wallEditHud: hud,
      walls: [wall()]
    });

    expect(handled).toBe(true);
    expect(hud.drag).toBeNull();
    expect(autoJoinAtMmPoint).toHaveBeenNthCalledWith(1, { x: 0, z: 0 });
    expect(autoJoinAtMmPoint).toHaveBeenNthCalledWith(2, { x: 1000, z: 0 });
    expect(rebuildWallPlanMesh).toHaveBeenCalledOnce();
    expect(mountProps).toHaveBeenCalledOnce();
    expect(commitHistory).toHaveBeenCalledOnce();
    expect(releasePointerCapture).toHaveBeenCalledExactlyOnceWith(7);
  });

  it("keeps current commit and refresh behavior when dragged wall is missing", () => {
    const hud = wallEditHud({ drag: drag(7, "missing") });
    const autoJoinAtMmPoint = vi.fn();
    const rebuildWallPlanMesh = vi.fn();
    const mountProps = vi.fn();
    const commitHistory = vi.fn();
    const releasePointerCapture = vi.fn();

    const handled = finishWallEditHudDragPointerUp({
      autoJoinAtMmPoint,
      commitHistory,
      mountProps,
      pointerId: 7,
      rebuildWallPlanMesh,
      releasePointerCapture,
      wallEditHud: hud,
      walls: [wall()]
    });

    expect(handled).toBe(true);
    expect(hud.drag).toBeNull();
    expect(autoJoinAtMmPoint).not.toHaveBeenCalled();
    expect(rebuildWallPlanMesh).toHaveBeenCalledOnce();
    expect(mountProps).toHaveBeenCalledOnce();
    expect(commitHistory).toHaveBeenCalledOnce();
    expect(releasePointerCapture).toHaveBeenCalledExactlyOnceWith(7);
  });

  it("does not finish wall edit drag for missing or mismatched pointerup", () => {
    const hud = wallEditHud({ drag: drag(7) });
    const autoJoinAtMmPoint = vi.fn();
    const rebuildWallPlanMesh = vi.fn();
    const mountProps = vi.fn();
    const commitHistory = vi.fn();
    const releasePointerCapture = vi.fn();
    const baseArgs = {
      autoJoinAtMmPoint,
      commitHistory,
      mountProps,
      rebuildWallPlanMesh,
      releasePointerCapture,
      walls: [wall()]
    };

    expect(finishWallEditHudDragPointerUp({ ...baseArgs, pointerId: 8, wallEditHud: hud })).toBe(false);
    expect(hud.drag).not.toBeNull();
    hud.drag = null;
    expect(finishWallEditHudDragPointerUp({ ...baseArgs, pointerId: 7, wallEditHud: hud })).toBe(false);

    expect(autoJoinAtMmPoint).not.toHaveBeenCalled();
    expect(rebuildWallPlanMesh).not.toHaveBeenCalled();
    expect(mountProps).not.toHaveBeenCalled();
    expect(commitHistory).not.toHaveBeenCalled();
    expect(releasePointerCapture).not.toHaveBeenCalled();
  });
});
