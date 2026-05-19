import { describe, expect, it } from "vitest";
import { Box3, type Mesh, type MeshStandardMaterial } from "three";
import { getSystemSeedCatalog } from "../../core/catalog/catalog-repository";
import { makeDefaultKitchenContext } from "../../layout/kitchenContext";
import { applyKitchenContextToModuleParams } from "../../layout/kitchenMaterialSync";
import { makeDefaultDrawerLowParams } from "../drawerLow/types";
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

describe("module runtime catalog context", () => {
  it("resolves valid materials from ClientCatalog", () => {
    const catalog = getSystemSeedCatalog();
    const ctx = createModuleRuntimeCatalogContext(catalog);
    const material = ctx.resolveMaterial("mat.board.body.dtd.grey.18", "carcass");
    expect(material?.id).toBe("mat.board.body.dtd.grey.18");
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
  });

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
    const materialId = "mat.board.body.dtd.white.18";
    clientA.materials = clientA.materials.map((material) =>
      material.id === materialId ? { ...material, preview: { ...material.preview, colorHex: "#112233" } } : material
    );
    clientB.materials = clientB.materials.map((material) =>
      material.id === materialId ? { ...material, preview: { ...material.preview, colorHex: "#445566" } } : material
    );

    const params = makeDefaultDrawerLowParams();
    const snapshot = materialsSnapshot as unknown as Parameters<typeof buildDrawerLowParametric>[1];
    const groupA = buildDrawerLowParametric(params, snapshot, clientA);
    const groupB = buildDrawerLowParametric(params, snapshot, clientB);
    const leftA = groupA.getObjectByName("leftSide") as Mesh;
    const leftB = groupB.getObjectByName("leftSide") as Mesh;

    expect(((leftA.material as MeshStandardMaterial).color.getHexString())).toBe("112233");
    expect(((leftB.material as MeshStandardMaterial).color.getHexString())).toBe("445566");
  });

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

    expect(Math.abs(zHingeBox.max.z - zDoorBox.min.z)).toBeLessThan(0.002);
    expect(Math.abs(xHingeBox.max.x - xDoorBox.min.x)).toBeLessThan(0.002);
  });
});
