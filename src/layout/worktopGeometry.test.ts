import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import type { FloorBoundaryPoint, KitchenWorktopParams } from "./appState";
import {
  getKitchenWorktopAreaM2,
  getKitchenWorktopBoundsMm,
  getKitchenWorktopSegmentDepthMm,
  offsetKitchenWorktopPath,
  sanitizeKitchenWorktopPath
} from "./worktopGeometry";

const makeParams = (path: FloorBoundaryPoint[]): KitchenWorktopParams => ({
  path,
  justification: "back",
  mirrored: false,
  depthMm: 620,
  thicknessMm: 38,
  heightMm: 900,
  overhangSideMm: 20,
  materialId: ""
});

describe("worktop geometry", () => {
  it("keeps a collinear point when the path reverses direction", () => {
    const path = [
      { x: 0, z: 0 },
      { x: 2000, z: 0 },
      { x: 0, z: 0 }
    ];

    expect(sanitizeKitchenWorktopPath(path)).toEqual(path);
  });

  it("turns a horizontal outbound and return path into a back-to-back island", () => {
    const params = makeParams([
      { x: 0, z: 0 },
      { x: 2000, z: 0 },
      { x: 0, z: 0 }
    ]);

    expect(getKitchenWorktopBoundsMm(params)).toEqual({ widthMm: 2000, depthMm: 1240 });
    expect(getKitchenWorktopAreaM2(params)).toBeCloseTo(2.48, 6);
  });

  it("preserves the existing single-direction worktop depth", () => {
    const params = makeParams([
      { x: 0, z: 0 },
      { x: 2000, z: 0 }
    ]);

    expect(getKitchenWorktopBoundsMm(params)).toEqual({ widthMm: 2000, depthMm: 620 });
    expect(getKitchenWorktopAreaM2(params)).toBeCloseTo(1.24, 6);
  });

  it("keeps the outbound and return placement guides on the shared island centerline", () => {
    const path = [
      new Vector3(0, 0, 0),
      new Vector3(2, 0, 0),
      new Vector3(0, 0, 0)
    ];

    const guide = offsetKitchenWorktopPath(path, 0.02);

    expect(guide.map((point) => [point.x, point.z])).toEqual([
      [0, 0],
      [2, 0],
      [0, 0]
    ]);
  });

  it("supports a different persisted depth for each worktop wing", () => {
    const params = makeParams([
      { x: 0, z: 0 },
      { x: 2000, z: 0 },
      { x: 2000, z: 1500 }
    ]);
    params.segmentDepthsMm = [700, 500];

    expect(getKitchenWorktopSegmentDepthMm(params, 0)).toBe(700);
    expect(getKitchenWorktopSegmentDepthMm(params, 1)).toBe(500);
    expect(getKitchenWorktopAreaM2(params)).toBeGreaterThan(1.4);
  });
});
