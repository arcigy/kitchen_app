import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  collectLineMoveKeypoints,
  collectModuleMoveKeypoints,
  collectMoveObjectSnapResults,
  collectOpeningMoveKeypointsForWall,
  constrainMoveDeltaToAxis,
  moveWallAxisInfo,
  moveObjectSnapKey,
  isOpeningMoveWithinSmartSnapBounds,
  openingMoveBoundsForWall,
  openingSmartSnapRevealMm,
  pointOnMoveWallCenterline,
  prepareMoveDeltaForSnapMode,
  roundMoveDeltaToMillimeters,
  snapBindingWallId,
  worldPointFromMm
} from "./pointerMoveSnapHelpers";

describe("pointer move snap helpers", () => {
  it("extracts wall ids only from wall snap bindings", () => {
    expect(snapBindingWallId({ type: "wallEndpoint", wallId: "wall-1", endpoint: "a" })).toBe("wall-1");
    expect(snapBindingWallId({ type: "wallCenterline", wallId: "wall-2", t: 0.5 })).toBe("wall-2");
    expect(snapBindingWallId({ type: "moduleVertex", instanceId: "module-1", vertexIndex: 0 })).toBeNull();
    expect(snapBindingWallId(null)).toBeNull();
  });

  it("keeps the current opening reveal clamp rules", () => {
    expect(openingSmartSnapRevealMm({ widthMm: 400, frameWidthMm: 18 })).toBe(50);
    expect(openingSmartSnapRevealMm({ widthMm: 400, frameWidthMm: 96 })).toBe(96);
    expect(openingSmartSnapRevealMm({ widthMm: 400, frameWidthMm: 200 })).toBe(140);
    expect(openingSmartSnapRevealMm({ widthMm: 800 })).toBe(50);
    expect(openingSmartSnapRevealMm({ widthMm: 2000 })).toBe(120);
  });

  it("converts millimeter floor points to world points", () => {
    expect(worldPointFromMm({ x: 1250, z: -500 })).toEqual(new THREE.Vector3(1.25, 0, -0.5));
  });

  it("computes move wall axis info using the current meter conversion", () => {
    const axis = moveWallAxisInfo({ id: "wall-1", params: { aMm: { x: 0, z: 0 }, bMm: { x: 3000, z: 4000 } } });

    expect(axis?.a).toEqual(new THREE.Vector3(0, 0, 0));
    expect(axis?.b).toEqual(new THREE.Vector3(3, 0, 4));
    expect(axis?.lengthM).toBe(5);
    expect(axis?.lengthMm).toBe(5000);
    expect(axis?.dir.x).toBeCloseTo(0.6);
    expect(axis?.dir.z).toBeCloseTo(0.8);
  });

  it("returns null wall axis data for degenerate walls", () => {
    expect(moveWallAxisInfo({ id: "wall-1", params: { aMm: { x: 0, z: 0 }, bMm: { x: 0, z: 0 } } })).toBeNull();
  });

  it("finds points on the wall centerline", () => {
    const point = pointOnMoveWallCenterline(
      { id: "wall-1", params: { aMm: { x: 0, z: 0 }, bMm: { x: 2000, z: 0 } } },
      1.25
    );

    expect(point?.point).toEqual(new THREE.Vector3(1.25, 0, 0));
    expect(point?.dir).toEqual(new THREE.Vector3(1, 0, 0));
  });

  it("computes opening move bounds for a wall using current rounding", () => {
    const bounds = openingMoveBoundsForWall(
      { wallId: "wall-1", centerMm: 1000, widthMm: 800 },
      new THREE.Vector3(0.254, 0, 0),
      { id: "wall-1", params: { aMm: { x: 0, z: 0 }, bMm: { x: 2000, z: 0 } } }
    );

    expect(bounds).toEqual({
      centerMm: 1254,
      leftMm: 854,
      rightMm: 1654,
      lengthMm: 2000,
      revealMm: 50
    });
  });

  it("returns null opening bounds when no host wall can be used", () => {
    expect(openingMoveBoundsForWall({ wallId: null, centerMm: 1000, widthMm: 800 }, new THREE.Vector3(), null)).toBeNull();
    expect(
      openingMoveBoundsForWall(
        { wallId: "wall-1", centerMm: 1000, widthMm: 800 },
        new THREE.Vector3(),
        { id: "wall-1", params: { aMm: { x: 0, z: 0 }, bMm: { x: 0, z: 0 } } }
      )
    ).toBeNull();
  });

  it("validates opening move bounds with the current reveal and tolerance rules", () => {
    expect(
      isOpeningMoveWithinSmartSnapBounds(
        { widthMm: 800 },
        { centerMm: 1000, leftMm: 50, rightMm: 850, lengthMm: 2000, revealMm: 50 }
      )
    ).toBe(true);
    expect(
      isOpeningMoveWithinSmartSnapBounds(
        { widthMm: 800 },
        { centerMm: 1000, leftMm: 48, rightMm: 848, lengthMm: 2000, revealMm: 50 }
      )
    ).toBe(false);
    expect(
      isOpeningMoveWithinSmartSnapBounds(
        { widthMm: 800 },
        { centerMm: 1000, leftMm: 49, rightMm: 849, lengthMm: 2000, revealMm: 50 }
      )
    ).toBe(true);
    expect(
      isOpeningMoveWithinSmartSnapBounds(
        { widthMm: 2000 },
        { centerMm: 1000, leftMm: 0, rightMm: 2000, lengthMm: 2000, revealMm: 50 }
      )
    ).toBe(false);
  });

  it("caps opening reveal validation by available side space", () => {
    expect(
      isOpeningMoveWithinSmartSnapBounds(
        { widthMm: 1900 },
        { centerMm: 1000, leftMm: 49, rightMm: 1949, lengthMm: 2000, revealMm: 140 }
      )
    ).toBe(true);
  });

  it("collects opening keypoints for left edge, center, and right edge", () => {
    const keypoints = collectOpeningMoveKeypointsForWall(
      { wallId: "wall-1", centerMm: 1000, widthMm: 400 },
      new THREE.Vector3(0.2, 0, 0),
      "window w1",
      { id: "wall-1", params: { aMm: { x: 0, z: 0 }, bMm: { x: 2000, z: 0 } } }
    );

    expect(keypoints.map((point) => point.label)).toEqual(["window w1 left end", "window w1 center", "window w1 right end"]);
    expect(keypoints.map((point) => point.hostWallId)).toEqual(["wall-1", "wall-1", "wall-1"]);
    expect(keypoints.map((point) => point.point)).toEqual([
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(1.2, 0, 0),
      new THREE.Vector3(1.4, 0, 0)
    ]);
    for (const keypoint of keypoints) expect(keypoint.axis).toEqual(new THREE.Vector3(1, 0, 0));
  });

  it("collects line keypoints for start, end, and middle", () => {
    const keypoints = collectLineMoveKeypoints(
      { aMm: { x: 0, z: 1000 }, bMm: { x: 2000, z: 1000 } },
      new THREE.Vector3(0.25, 0, -0.5),
      "wall w1"
    );

    expect(keypoints.map((point) => point.label)).toEqual(["wall w1 start", "wall w1 end", "wall w1 middle"]);
    expect(keypoints.map((point) => point.point)).toEqual([
      new THREE.Vector3(0.25, 0, 0.5),
      new THREE.Vector3(2.25, 0, 0.5),
      new THREE.Vector3(1.25, 0, 0.5)
    ]);
  });

  it("collects module keypoints using current local box, rotation, position, and delta rules", () => {
    const keypoints = collectModuleMoveKeypoints(
      new THREE.Box3(new THREE.Vector3(-1, 0, -2), new THREE.Vector3(3, 2, 4)),
      { pos: new THREE.Vector3(10, 5, 20), rotY: 0 },
      new THREE.Vector3(0.5, 0, -1),
      "module m1"
    );

    expect(keypoints.map((point) => point.label)).toEqual([
      "module m1 point 1",
      "module m1 point 2",
      "module m1 point 3",
      "module m1 point 4",
      "module m1 point 5",
      "module m1 point 6",
      "module m1 point 7",
      "module m1 point 8",
      "module m1 point 9"
    ]);
    expect(keypoints.map((point) => point.point)).toEqual([
      new THREE.Vector3(9.5, 0, 17),
      new THREE.Vector3(13.5, 0, 17),
      new THREE.Vector3(13.5, 0, 23),
      new THREE.Vector3(9.5, 0, 23),
      new THREE.Vector3(11.5, 0, 17),
      new THREE.Vector3(13.5, 0, 20),
      new THREE.Vector3(11.5, 0, 23),
      new THREE.Vector3(9.5, 0, 20),
      new THREE.Vector3(11.5, 0, 20)
    ]);
  });

  it("builds the current move object snap dedupe key", () => {
    expect(
      moveObjectSnapKey({
        kind: "endpoint",
        point: new THREE.Vector3(1.2344, 0, -2.3456),
        owner: "wall",
        binding: { type: "wallEndpoint", wallId: "wall-1", endpoint: "b" }
      })
    ).toBe('endpoint|1234|-2346|wall|{"type":"wallEndpoint","wallId":"wall-1","endpoint":"b"}');
  });

  it("collects move object snap results with current cycle clamp and dedupe behavior", () => {
    const calls: Array<number | undefined> = [];
    const snaps = collectMoveObjectSnapResults((cycleIndex) => {
      calls.push(cycleIndex);
      if (cycleIndex == null) {
        return {
          kind: "endpoint",
          point: new THREE.Vector3(1, 0, 2),
          owner: "wall",
          binding: { type: "wallEndpoint", wallId: "wall-1", endpoint: "a" },
          cycleCount: 20
        };
      }
      if (cycleIndex === 1) {
        return {
          kind: "corner",
          point: new THREE.Vector3(3, 0, 4),
          owner: "module",
          binding: { type: "moduleVertex", instanceId: "module-1", vertexIndex: 0 }
        };
      }
      if (cycleIndex === 2) {
        return { kind: "none", point: new THREE.Vector3() };
      }
      return {
        kind: "endpoint",
        point: new THREE.Vector3(1, 0, 2),
        owner: "wall",
        binding: { type: "wallEndpoint", wallId: "wall-1", endpoint: "a" }
      };
    });

    expect(calls).toEqual([undefined, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    expect(snaps.map((snap) => snap.kind)).toEqual(["endpoint", "corner"]);
  });

  it("does not cycle move object snap results when the first snap is none", () => {
    const calls: Array<number | undefined> = [];

    expect(collectMoveObjectSnapResults((cycleIndex) => {
      calls.push(cycleIndex);
      return { kind: "none", point: new THREE.Vector3() };
    })).toEqual([]);
    expect(calls).toEqual([undefined]);
  });

  it("rounds move deltas to millimeters only when snap is disabled", () => {
    const delta = new THREE.Vector3(1.23456, 7, -2.34567);

    expect(roundMoveDeltaToMillimeters(delta)).toEqual(new THREE.Vector3(1.235, 7, -2.346));
    expect(prepareMoveDeltaForSnapMode(delta, true)).toEqual(new THREE.Vector3(1.235, 7, -2.346));
    expect(prepareMoveDeltaForSnapMode(delta, false)).toBe(delta);
  });

  it("constrains move delta to dominant world axis without a wall", () => {
    expect(constrainMoveDeltaToAxis(new THREE.Vector3(3, 0, 2), null)).toEqual(new THREE.Vector3(3, 0, 0));
    expect(constrainMoveDeltaToAxis(new THREE.Vector3(2, 0, -3), null)).toEqual(new THREE.Vector3(0, 0, -3));
  });

  it("constrains move delta along or across the selected wall axis", () => {
    const wall = { aMm: { x: 0, z: 0 }, bMm: { x: 1000, z: 1000 } };
    const along = constrainMoveDeltaToAxis(new THREE.Vector3(3, 0, 2), wall);
    const across = constrainMoveDeltaToAxis(new THREE.Vector3(2, 0, -3), wall);

    expect(along.x).toBeCloseTo(2.5);
    expect(along.z).toBeCloseTo(2.5);
    expect(across.x).toBeCloseTo(2.5);
    expect(across.z).toBeCloseTo(-2.5);
  });

  it("returns a clone for tiny move deltas", () => {
    const delta = new THREE.Vector3(0, 0, 0);
    const result = constrainMoveDeltaToAxis(delta, null);

    expect(result).toEqual(delta);
    expect(result).not.toBe(delta);
  });
});
