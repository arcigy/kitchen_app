import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { resolvePlanBinding, type AssociativeMeasureContext } from "./measureAssociative";
import type { ColumnInstance, SectionInstance, WallInstance, WindowInstance } from "./localTypes";
import type { CustomFurnitureInstance } from "../layout/customFurnitureTypes";

const wall = (id: string, aMm = { x: 0, z: 0 }, bMm = { x: 4000, z: 0 }) =>
  ({
    id,
    params: {
      thicknessMm: 150,
      heightMm: 2600,
      materialId: "default",
      aMm,
      bMm
    }
  }) as WallInstance;

const baseContext = (patch: Partial<AssociativeMeasureContext> = {}): AssociativeMeasureContext => ({
  walls: [],
  instances: [],
  floors: [],
  columns: [],
  sections: [],
  windows: [],
  doors: [],
  customFurniture: [],
  worktops: [],
  measures: [],
  getModuleLocalBackCenter: () => new THREE.Vector3(),
  getKitchenWorktopPolygon: () => [],
  ...patch
});

describe("associative measure plan bindings", () => {
  it("resolves column center and edge bindings from current column params", () => {
    const column = {
      id: "c1",
      params: {
        name: "Column 1",
        shape: "rectangular",
        xMm: 1000,
        zMm: 2000,
        justifyX: "center",
        justifyY: "center",
        widthMm: 400,
        depthMm: 600,
        diameterMm: 400,
        heightMm: 2600,
        materialId: "default"
      }
    } as ColumnInstance;
    const ctx = baseContext({ columns: [column] });

    expect(resolvePlanBinding({ type: "columnCenter", columnId: "c1" }, ctx)).toMatchObject({ x: 1, z: 2 });
    expect(resolvePlanBinding({ type: "columnEdge", columnId: "c1", segmentIndex: 0, t: 0.5 }, ctx)).toMatchObject({ x: 1, z: 1.7 });
  });

  it("resolves section line bindings", () => {
    const section = {
      id: "s1",
      params: { name: "Section 1", aMm: { x: 500, z: 500 }, bMm: { x: 2500, z: 500 }, mirrored: false }
    } as SectionInstance;

    expect(resolvePlanBinding({ type: "sectionLine", sectionId: "s1", t: 0.25 }, baseContext({ sections: [section] }))).toMatchObject({
      x: 1,
      z: 0.5
    });
  });

  it("resolves opening endpoints from their host wall axis", () => {
    const windowInst = {
      id: "win1",
      params: {
        wall: "back",
        wallId: "w1",
        widthMm: 1000,
        heightMm: 1200,
        sillHeightMm: 900,
        centerMm: 2000,
        frameWidthMm: 80,
        offsetFromInteriorMm: 0,
        sashWidthMm: 60,
        sashProfileDepthMm: 50,
        frameProfileDepthMm: 70,
        swingDirection: "left",
        swingSide: "inward",
        swingAngleDeg: 0,
        handleType: "none",
        handleOffsetMm: 0,
        handleHeightMm: 0,
        materialId: "default"
      }
    } as WindowInstance;
    const ctx = baseContext({ walls: [wall("w1")], windows: [windowInst] });

    expect(resolvePlanBinding({ type: "openingEndpoint", openingKind: "window", openingId: "win1", endpoint: "right" }, ctx)).toMatchObject({
      x: 2.5,
      z: 0
    });
  });

  it("resolves custom furniture boundary edge bindings", () => {
    const furniture = {
      id: "cf1",
      params: {
        name: "Custom",
        baseConstraint: "projectBase",
        baseOffsetMm: 0,
        topConstraint: "absolute",
        topOffsetMm: 1000,
        boundary: [
          { x: 1000, z: 1000 },
          { x: 2000, z: 1000 },
          { x: 2000, z: 1800 }
        ],
        boards: []
      }
    } as unknown as CustomFurnitureInstance;

    expect(
      resolvePlanBinding({ type: "customFurnitureEdge", furnitureId: "cf1", segmentIndex: 0, t: 0.5 }, baseContext({ customFurniture: [furniture] }))
    ).toMatchObject({ x: 1.5, z: 1 });
  });
});
