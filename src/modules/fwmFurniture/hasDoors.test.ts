import { describeFwmModuleHeight } from "./heightPresentation";
import { describe, expect, it } from "vitest";
import { Box3, Mesh, type Object3D } from "three";
import { getSystemSeedCatalog } from "../../core/catalog/catalog-repository";
import { createDefaultModulePackageParameters, buildModulePackageGeometryFromPackage } from "../../core/module-package/runtime/module-runtime-adapter";
import { systemModulePackageTemplates } from "../../system/module-packages";
import { makeDefaultKitchenContext } from "../../layout/kitchenContext";
import { getModuleDescriptors } from "../registry";
import type { ModuleParams } from "../../model/cabinetTypes";

const cases: Array<[string, Record<string, unknown>, RegExp]> = [
  ["fwm_catalog_base_doors", { doorCount: 2 }, /^(door_|hinge_)/],
  ["fwm_catalog_base_drawers", { drawerCount: 2, doorCount: 1 }, /^(door_|hinge_)/],
  // These two historical corner IDs describe the opposite of their physical role.
  ["fwm_catalog_base_corner", { variant: "corner_1d" }, /^(corner_blind_front_filler|corner_right_door_handle|corner_hinge_)/],
  ["fwm_catalog_base_corner", { variant: "corner_90" }, /^(door_front_|doorHandle_|hinge_front_)/],
  ["fwm_catalog_base_corner", { variant: "corner_chamfered" }, /corner_chamfered_(diagonal_front|diagonal_handle|hinge_lower|hinge_upper)_/],
  ["fwm_catalog_wall_cabinet", { variant: "corner_90" }, /^(door_front_|doorHandle_|hinge_front_)/],
  ["fwm_catalog_wall_cabinet", { variant: "corner_chamfered" }, /corner_chamfered_(diagonal_front|diagonal_handle|hinge_lower|hinge_upper)_/],
  ["fwm_catalog_tall_cabinet", { tallSlotCount: 3, tallSlot1Type: "drawer", tallSlot1HeightMm: 300, tallSlot2Type: "door", tallSlot2HeightMm: 600, tallSlot3Type: "door", tallSlot3HeightMm: 400, tallSlot3DoorOpeningMode: "lift_up" }, /^tower_door_/],
  ["swing_shelves_low", { doorDouble: true }, /^door_front_/],
  ["corner_shelf_lower", {}, /^(door_front_|doorHandle_|hinge_front_)/],
  ["flap_shelves_low", { doorSystem: "lift_up" }, /^(door-front|handle|lift-hardware-)/],
  ["flap_shelves_low", { doorSystem: "double_hinged" }, /^door-(left|right)/],
];

function parts(group: Object3D) {
  group.updateMatrixWorld(true);
  const result = new Map<string, number[]>();
  group.traverse(object => {
    if (!(object instanceof Mesh)) return;
    const bounds = new Box3().setFromObject(object);
    result.set(object.name, [...bounds.min.toArray(), ...bounds.max.toArray()].map(value => Number(value.toFixed(8))));
  });
  return result;
}

describe("door assembly removal", () => {
  it.each(cases)("%s %j keeps every non-door part and restores the exact original geometry", (type, overrides, doorNames) => {
    const catalog = getSystemSeedCatalog();
    const modulePackage = systemModulePackageTemplates.find(item => item.module.moduleType === type)!;
    const parameters = { ...createDefaultModulePackageParameters(modulePackage), ...overrides };
    const build = (values: Record<string, unknown>) => parts(buildModulePackageGeometryFromPackage({ modulePackage, parameters: values, catalog }));
    const before = build(parameters);
    const without = build({ ...parameters, hasDoors: false });
    const doors = [...before.keys()].filter(name => doorNames.test(name));
    expect(doors.length).toBeGreaterThan(0);
    expect([...without.keys()].filter(name => doorNames.test(name))).toEqual([]);
    const retained = new Map([...before].filter(([name]) => !doorNames.test(name)));
    expect(without).toEqual(retained);
    expect(build({ ...parameters, hasDoors: true })).toEqual(before);
    expect(modulePackage.parameters.parameters.find(item => item.key === "hasDoors")?.defaultValue).toBe(true);
    expect(modulePackage.ui.controls.some(item => item.parameterKey === "hasDoors" && item.controlType === "checkbox")).toBe(true);
  });

  it.each(cases)("%s %j removes only door BOM and its price, preserving drawers and structure", (type, overrides) => {
    const catalog = getSystemSeedCatalog();
    const modulePackage = systemModulePackageTemplates.find(item => item.module.moduleType === type)!;
    const descriptor = getModuleDescriptors().find(item => item.type === type)!;
    const parameters = { ...createDefaultModulePackageParameters(modulePackage), ...overrides } as ModuleParams;
    const calculate = (hasDoors: boolean) => descriptor.calculateBOM({ ...parameters, hasDoors }, makeDefaultKitchenContext(), catalog);
    const before = calculate(true);
    const without = calculate(false);
    const retained = without.quoteBom.items.filter(item => item.id !== "visible-edge-banding" && item.id !== "handles");
    for (const item of retained) expect(item).toEqual(before.quoteBom.items.find(original => original.id === item.id));
    expect(without.quoteBom.items.some(item => /hinge|lift-up|door-handle/.test(item.id))).toBe(false);
    expect(without.quoteBom.items.filter(item => item.itemType === "board").length).toBeLessThan(before.quoteBom.items.filter(item => item.itemType === "board").length);
    expect(without.pricing.finalPrice).toBeLessThan(before.pricing.finalPrice);
    expect(calculate(true).quoteBom.items).toEqual(before.quoteBom.items);
    expect(calculate(true).pricing.finalPrice).toBe(before.pricing.finalPrice);
  });
});


describe("cabinet height explanations", () => {
  it.each([
    ["fwm_catalog_base_doors", { height: 820, heightCarcass: 782, plinthHeight: 150, worktopThicknessMm: 38, requiresWorktop: true }, 782, 150],
    ["fwm_catalog_base_corner", { height: 820, heightCarcass: 782, plinthHeight: 150, worktopThicknessMm: 38, requiresWorktop: true, variant: "corner_1d" }, 782, 150],
    ["fwm_catalog_tall_cabinet", { height: 2080, plinthHeight: 150, requiresWorktop: false }, 2080, 150],
    ["fwm_catalog_wall_cabinet", { height: 700, plinthHeight: 0, requiresWorktop: false }, 700, 0],
    ["fwm_catalog_base_doors", { height: 720, plinthHeight: 0, requiresWorktop: false }, 720, 0],
  ] as Array<[string, Record<string, unknown>, number, number]>)("%s describes the actual geometry without mutating dimensions", (type, overrides, height, plinth) => {
    const modulePackage = systemModulePackageTemplates.find(item => item.module.moduleType === type)!;
    const parameters = { ...createDefaultModulePackageParameters(modulePackage), ...overrides, type };
    const before = structuredClone(parameters);
    const description = describeFwmModuleHeight(parameters, 1400)!;
    const geometry = buildModulePackageGeometryFromPackage({ modulePackage, parameters, catalog: getSystemSeedCatalog() });
    const bounds = new Box3().setFromObject(geometry);
    expect(description.cabinetHeightMm).toBe(height);
    expect(description.plinthHeightMm).toBe(plinth);
    expect(bounds.max.y * 1000).toBeCloseTo(height, 0);
    expect(description.summary).toContain(`${height} mm`);
    if (type === "fwm_catalog_wall_cabinet") {
      expect(description.summary).toContain("1400 mm");
      expect(description.summary).toContain("2100 mm");
    }
    expect(parameters).toEqual(before);
  });
  it("does not apply DELFI geometry semantics to unrelated client modules", () => {
    expect(describeFwmModuleHeight({ type: "pino_side_cabinet", height: 800 })).toBeNull();
    expect(describeFwmModuleHeight({ type: "fwm_catalog_worktop", height: 38 })).toBeNull();
  });
});
