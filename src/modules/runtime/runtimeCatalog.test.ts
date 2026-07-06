import { describe, expect, it } from "vitest";
import { Box3, type Mesh, type MeshStandardMaterial } from "three";
import { getSystemSeedCatalog } from "../../core/catalog/catalog-repository";
import { makeDefaultKitchenContext } from "../../layout/kitchenContext";
import { applyKitchenContextToModuleParams } from "../../layout/kitchenMaterialSync";
import { makeDefaultDrawerLowParams } from "../drawerLow/types";
import type { DrawerLowParams } from "../drawerLow/types";
import { buildDrawerLowParametric } from "../drawerLow/parametricGeometry";
import materialsSnapshot from "../drawerLow/package/definitions/drawer_low.materials.snapshot.json";
import { makeDefaultSwingShelvesLowParams } from "../swingShelvesLow/types";
import { buildSwingShelvesLow } from "../swingShelvesLow/geometry";
import { makeDefaultCornerShelfLowerParams } from "../cornerShelfLower/types";
import { buildCornerShelfLower } from "../cornerShelfLower/geometry";
import {
  createModuleRuntimeCatalogContext,
  SYSTEM_PLACEHOLDER_MATERIAL
} from "./runtimeCatalog";

function getWorldBox(object: Mesh) {
  return new Box3().setFromObject(object);
}

function hasVolumeOverlap(left: Box3, right: Box3, epsilon = 0.000001) {
  return (
    left.min.x < right.max.x - epsilon &&
    left.max.x > right.min.x + epsilon &&
    left.min.y < right.max.y - epsilon &&
    left.max.y > right.min.y + epsilon &&
    left.min.z < right.max.z - epsilon &&
    left.max.z > right.min.z + epsilon
  );
}

function expectNoVolumeOverlap(group: { getObjectByName(name: string): unknown }, leftName: string, rightName: string) {
  const left = group.getObjectByName(leftName) as Mesh;
  const right = group.getObjectByName(rightName) as Mesh;
  expect(left, leftName).toBeTruthy();
  expect(right, rightName).toBeTruthy();
  expect(hasVolumeOverlap(getWorldBox(left), getWorldBox(right)), `${leftName} overlaps ${rightName}`).toBe(false);
}

function expectGapMm(left: Box3, right: Box3, expectedMm: number) {
  expect((right.min.z - left.max.z) * 1000).toBeCloseTo(expectedMm, 5);
}

describe("module runtime catalog context", () => {
  it("resolves valid materials from ClientCatalog", () => {
    const catalog = getSystemSeedCatalog();
    const ctx = createModuleRuntimeCatalogContext(catalog);
    const material = ctx.resolveMaterial(catalog.kitchenDefaults.carcassMaterialId, "carcass");
    expect(material?.id).toBe(catalog.kitchenDefaults.carcassMaterialId);
  });

  it("falls back through kitchen defaults, first material, then system placeholder", () => {
    const catalog = getSystemSeedCatalog();
    const ctx = createModuleRuntimeCatalogContext(catalog);
    expect(ctx.resolveMaterial("missing", "front")?.id).toBe(catalog.kitchenDefaults.frontMaterialId);

    const withoutDefault = structuredClone(catalog);
    withoutDefault.kitchenDefaults.frontMaterialId = "missing";
    expect(createModuleRuntimeCatalogContext(withoutDefault).resolveMaterial("missing", "front")?.id).toBe(withoutDefault.materials[0]?.id);

    const empty = structuredClone(catalog);
    empty.materials = [];
    expect(createModuleRuntimeCatalogContext(empty).resolveRenderMaterial("missing", "front")).toMatchObject(SYSTEM_PLACEHOLDER_MATERIAL);
  }, 30_000);

  it("ignores inactive materials when resolving runtime fallbacks", () => {
    const catalog = getSystemSeedCatalog();
    const inactiveId = catalog.kitchenDefaults.carcassMaterialId;
    catalog.materials = catalog.materials.map((material, index) => ({
      ...material,
      isActive: index > 0 && material.id !== inactiveId
    }));

    const resolved = createModuleRuntimeCatalogContext(catalog).resolveMaterial("missing", "carcass");

    expect(resolved?.id).not.toBe(inactiveId);
    expect(resolved?.isActive).toBe(true);
  });

  it("resolves components from ClientCatalog without global hardware fallback", () => {
    const catalog = getSystemSeedCatalog();
    const ctx = createModuleRuntimeCatalogContext(catalog);
    expect(ctx.resolveComponent("missing", "handle", "handle")?.id).toBe(catalog.kitchenDefaults.defaultHandleComponentId);

    const empty = structuredClone(catalog);
    empty.components = [];
    expect(createModuleRuntimeCatalogContext(empty).resolveComponent("missing", "handle", "handle")).toBeUndefined();
  });

  it("resolves component fallbacks only within the requested component type", () => {
    const catalog = getSystemSeedCatalog();
    catalog.kitchenDefaults.defaultHandleComponentId = catalog.components.find((component) => component.componentType === "hinge")?.id;

    const component = createModuleRuntimeCatalogContext(catalog).resolveComponent("missing", "handle", "handle");

    expect(component?.componentType).toBe("handle");
    expect(component?.id).not.toBe(catalog.kitchenDefaults.defaultHandleComponentId);
  });

  it("uses each client's material catalog in drawer parametric geometry", () => {
    const clientA = getSystemSeedCatalog();
    const clientB = getSystemSeedCatalog();
    const materialId = clientA.kitchenDefaults.carcassMaterialId!;
    clientA.materials = clientA.materials.map((material) =>
      material.id === materialId ? { ...material, preview: { ...material.preview, colorHex: "#112233" } } : material
    );
    clientB.materials = clientB.materials.map((material) =>
      material.id === materialId ? { ...material, preview: { ...material.preview, colorHex: "#445566" } } : material
    );

    const paramsA = applyKitchenContextToModuleParams(makeDefaultDrawerLowParams(), makeDefaultKitchenContext(clientA), clientA);
    const paramsB = applyKitchenContextToModuleParams(makeDefaultDrawerLowParams(), makeDefaultKitchenContext(clientB), clientB);
    const snapshot = materialsSnapshot as unknown as Parameters<typeof buildDrawerLowParametric>[1];
    const groupA = buildDrawerLowParametric(paramsA as DrawerLowParams, snapshot, clientA);
    const groupB = buildDrawerLowParametric(paramsB as DrawerLowParams, snapshot, clientB);
    const leftA = groupA.getObjectByName("leftSide") as Mesh;
    const leftB = groupB.getObjectByName("leftSide") as Mesh;

    expect(((leftA.material as MeshStandardMaterial).color.getHexString())).toBe("112233");
    expect(((leftB.material as MeshStandardMaterial).color.getHexString())).toBe("445566");
  }, 15_000);

  it("builds bottom boards for lower kitchen carcasses and drawer boxes", () => {
    const catalog = getSystemSeedCatalog();
    const snapshot = materialsSnapshot as unknown as Parameters<typeof buildDrawerLowParametric>[1];
    const drawer = buildDrawerLowParametric({ ...makeDefaultDrawerLowParams(), drawerCount: 4 }, snapshot, catalog);
    const swing = buildSwingShelvesLow(makeDefaultSwingShelvesLowParams(), catalog);

    expect(drawer.getObjectByName("bottom")).toBeTruthy();
    for (let index = 1; index <= 4; index += 1) {
      expect(drawer.getObjectByName(`drawer_${index}_bottom`)).toBeTruthy();
    }
    expect(swing.getObjectByName("bottom")).toBeTruthy();
  }, 15_000);

  it("keeps drawer boxes behind the back panel with a stable rear gap", () => {
    const catalog = getSystemSeedCatalog();
    const snapshot = materialsSnapshot as unknown as Parameters<typeof buildDrawerLowParametric>[1];
    const commonParams = {
      ...makeDefaultDrawerLowParams(),
      drawerCount: 1,
      backGrooveWidthMm: 18,
      drawerBackReserveMm: 10
    };
    const thick = buildDrawerLowParametric({ ...commonParams, backThickness: 18 } as DrawerLowParams, snapshot, catalog);
    const thin = buildDrawerLowParametric({ ...commonParams, backThickness: 3.3, backGrooveWidthMm: 3.3 } as DrawerLowParams, snapshot, catalog);

    const thickBack = getWorldBox(thick.getObjectByName("back") as Mesh);
    const thickDrawerBack = getWorldBox(thick.getObjectByName("drawer_1_back") as Mesh);
    const thickDrawerBottom = getWorldBox(thick.getObjectByName("drawer_1_bottom") as Mesh);
    const thickDrawerSide = getWorldBox(thick.getObjectByName("drawer_1_sideL") as Mesh);
    const thinBack = getWorldBox(thin.getObjectByName("back") as Mesh);
    const thinDrawerBack = getWorldBox(thin.getObjectByName("drawer_1_back") as Mesh);
    const thinDrawerBottom = getWorldBox(thin.getObjectByName("drawer_1_bottom") as Mesh);
    const thinDrawerSide = getWorldBox(thin.getObjectByName("drawer_1_sideL") as Mesh);

    expect(thinBack.min.z).toBeCloseTo(thickBack.min.z, 6);
    expect((thickBack.max.z - thickBack.min.z) * 1000).toBeCloseTo(18, 5);
    expect((thinBack.max.z - thinBack.min.z) * 1000).toBeCloseTo(3.3, 5);

    expectGapMm(thickBack, thickDrawerBack, 10);
    expectGapMm(thinBack, thinDrawerBack, 10);
    expectGapMm(thickBack, thickDrawerBottom, 10 + 13);
    expectGapMm(thinBack, thinDrawerBottom, 10 + 13);
    expectNoVolumeOverlap(thick, "back", "drawer_1_back");
    expectNoVolumeOverlap(thick, "back", "drawer_1_bottom");
    expectNoVolumeOverlap(thin, "back", "drawer_1_back");
    expectNoVolumeOverlap(thin, "back", "drawer_1_bottom");

    expect(thinDrawerSide.max.z).toBeCloseTo(thickDrawerSide.max.z, 6);
    expect((thinDrawerSide.max.z - thinDrawerSide.min.z) * 1000).toBeCloseTo(
      (thickDrawerSide.max.z - thickDrawerSide.min.z) * 1000 + 14.7,
      5
    );
  });

  it("syncs material selections for newly added drawer fronts and bottoms", () => {
    const catalog = getSystemSeedCatalog();
    const ctx = makeDefaultKitchenContext(catalog);
    const params = applyKitchenContextToModuleParams(
      { ...makeDefaultDrawerLowParams(), drawerCount: 5 },
      ctx,
      catalog
    ) as Record<string, unknown>;
    const selections = params.commercialSelections as {
      boardMaterials: Record<string, string>;
      boardThicknesses: Record<string, number>;
    };

    expect(selections.boardMaterials["drawer-front-5"]).toBe(ctx.frontsMaterialId);
    expect(selections.boardMaterials["drawer-box-5-bottom-panel"]).toBe(ctx.drawerBottomMaterialId);
    expect(selections.boardThicknesses["drawer-front-5"]).toBeGreaterThan(0);
    expect(selections.boardThicknesses["drawer-box-5-bottom-panel"]).toBeGreaterThan(0);
  });

  it("keeps corner lower bottom boards and places hinges against the door backs", () => {
    const catalog = getSystemSeedCatalog();
    const corner = buildCornerShelfLower(makeDefaultCornerShelfLowerParams(), catalog);
    const zDoor = corner.getObjectByName("door_front_z") as Mesh;
    const xDoor = corner.getObjectByName("door_front_x") as Mesh;
    const zHinge = corner.getObjectByName("hinge_front_z_1_door_plate") as Mesh;
    const xHinge = corner.getObjectByName("hinge_front_x_1_door_plate") as Mesh;

    expect(corner.getObjectByName("bottom_x")).toBeTruthy();
    expect(corner.getObjectByName("bottom_z")).toBeTruthy();

    expectNoVolumeOverlap(corner, "bottom_x", "back_x");
    expectNoVolumeOverlap(corner, "bottom_z", "back_z");
    expectNoVolumeOverlap(corner, "bottom_x", "back_corner_panel");
    expectNoVolumeOverlap(corner, "bottom_z", "back_corner_panel");

    const zDoorBox = getWorldBox(zDoor);
    const zHingeBox = getWorldBox(zHinge);
    const xDoorBox = getWorldBox(xDoor);
    const xHingeBox = getWorldBox(xHinge);

    expect(zDoorBox.min.x * 1000).toBeCloseTo(541, 3);
    expect(zDoorBox.max.x * 1000).toBeCloseTo(998, 3);
    expect(xDoorBox.min.z * 1000).toBeCloseTo(560.2, 3);
    expect(xDoorBox.max.z * 1000).toBeCloseTo(998, 3);

    expect(Math.abs(zHingeBox.max.z - zDoorBox.min.z)).toBeLessThan(0.002);
    expect(Math.abs(xHingeBox.max.x - xDoorBox.min.x)).toBeLessThan(0.002);
  });
});
