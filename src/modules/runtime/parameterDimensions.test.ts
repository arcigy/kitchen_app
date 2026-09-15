import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { systemModulePackageTemplates } from "../../system/module-packages";
import { createSystemCatalogSeed } from "../../core/catalog/catalog-bootstrap";
import { buildModulePackageGeometryFromPackage, createModulePackageDefaultParams } from "../../core/module-package/runtime/module-runtime-adapter";
import { resolveModuleParameterDimensions } from "./parameterDimensions";
import { normalizeModuleParamsForSource, type ModuleParams } from "../../model/cabinetTypes";

const catalog = { clientId: "settings-test", ...createSystemCatalogSeed() };
function build(type: string, changes: Record<string, unknown> = {}) {
  const modulePackage = systemModulePackageTemplates.find((pkg) => pkg.module.moduleType === type)!;
  const parameters = { ...createModulePackageDefaultParams({ modulePackage, catalog }), ...changes };
  const root = buildModulePackageGeometryFromPackage({ modulePackage, parameters, catalog });
  const dimensions = resolveModuleParameterDimensions({ modulePackage, parameters, root });
  return { modulePackage, parameters, root, dimensions };
}
describe("module parameter dimension geometry", () => {
  it.each(["fwm_catalog_base_doors", "fwm_catalog_base_drawers", "fwm_catalog_wall_cabinet", "fwm_catalog_tall_cabinet"])("resolves true width and height for %s", (type) => {
    for (const width of [600, 760]) {
      const { dimensions } = build(type, { width, height: 900, worktopThicknessMm: 0, requiresWorktop: false });
      expect(dimensions.find((d) => d.parameterKey === "width")?.valueMm).toBeCloseTo(width, 2);
      expect(dimensions.find((d) => d.parameterKey === "height")?.valueMm).toBeCloseTo(900, 2);
      expect(dimensions.every((d) => !/Count|angle|power/.test(d.parameterKey))).toBe(true);
    }
  });
  it("measures a chamfer as its coordinate segment and keeps the straight depth independent", () => {
    for (const side of ["left", "right"]) for (const chamfer of [200, 350]) {
      const { dimensions, root } = build("fwm_catalog_base_corner", { variant: "corner_chamfered", depth: 580, frontChamferMm: chamfer, frontChamferReferenceMm: 200, backChamferMm: 0, side, requiresWorktop: false, worktopThicknessMm: 0 });
      const cut = dimensions.find((d) => d.parameterKey === "frontChamferMm");
      expect(cut?.valueMm).toBeCloseTo(chamfer, 2);
      expect(cut?.start[0]).toBe(cut?.end[0]);
      expect(cut?.toParameterValue(420)).toBe(420);
      expect(dimensions.find((d) => d.parameterKey === "depth")?.valueMm).toBeCloseTo(580, 2);
      const front = root.children.find((child) => child.userData.boardName === "front_right_panel")!;
      expect(new THREE.Box3().setFromObject(front).getSize(new THREE.Vector3()).x * 1000).toBeCloseTo(580, 2);
    }
  });
  it("uses the explicit worktop reference without adding a worktop mesh", () => {
    const { dimensions, root } = build("fwm_catalog_base_drawers", { height: 780, heightCarcass: 742, worktopThicknessMm: 38, requiresWorktop: true });
    expect(dimensions.find((d) => d.parameterKey === "height")?.valueMm).toBeCloseTo(780, 2);
    expect(root.children.some((child) => child.userData.materialGroup === "worktop")).toBe(false);
  });
  it.each(["drawer_low", "swing_shelves_low", "corner_shelf_lower"])("resolves the worktop reference height for %s", (type) => {
    const { dimensions } = build(type, { height: 780, heightCarcass: 742, worktopThicknessMm: 38 });
    expect(dimensions.find((d) => d.parameterKey === "height")?.valueMm).toBeCloseTo(780, 2);
  });
  it("uses local reference points independently of a placed module transform", () => {
    const first = build("fwm_catalog_base_corner", { variant: "corner_chamfered", frontChamferMm: 250 });
    first.root.position.set(3, 1, -2); first.root.rotation.y = Math.PI * .63;
    const transformed = resolveModuleParameterDimensions(first);
    for (const d of first.dimensions) {
      const next = transformed.find((item) => item.id === d.id)!;
      expect(next.valueMm).toBeCloseTo(d.valueMm, 4);
      expect(new THREE.Vector3(...next.start).distanceTo(new THREE.Vector3(...d.start))).toBeLessThan(.00001);
    }
  });
  it("keeps front and rear cuts independent of the diagonal board", () => {
    const { dimensions } = build("fwm_catalog_base_corner", { variant: "corner_chamfered", frontChamferMm: 350, backChamferMm: 180, depth: 720 });
    expect(dimensions.find((d) => d.parameterKey === "frontChamferMm")?.valueMm).toBeCloseTo(350, 2);
    expect(dimensions.find((d) => d.parameterKey === "backChamferMm")?.valueMm).toBeCloseTo(180, 2);
  });
  it("anchors tall section dimensions at the real allocated opening planes", () => {
    const { dimensions, root } = build("fwm_catalog_tall_cabinet", { height: 2200, requiresWorktop: false, worktopThicknessMm: 0, tallSlotCount: 2,
      tallSlot1Type: "oven", tallSlot1HeightMm: 600, tallSlot2Type: "door", tallSlot2HeightMm: 0 });
    const oven = dimensions.find((d) => d.parameterKey === "tallSlot1HeightMm")!;
    expect(oven.valueMm).toBeCloseTo(600, 2);
    expect(oven.start[1] * 1000).toBeCloseTo(Number(root.userData.moduleRenderableBuildParameters.plinthHeight) + Number(root.userData.moduleRenderableBuildParameters.boardThickness), 2);
    const upper = dimensions.find((d) => d.parameterKey === "tallSlot2HeightMm")!;
    expect(upper.start[1]).toBeCloseTo(oven.end[1], 5);
    expect(upper.valueMm).toBeGreaterThan(1000);
    expect(upper.toParameterValue(900)).toBe(900);
  });
  it("converts a physical drawer front edit through the existing proportional normalization", () => {
    const first = build("fwm_catalog_base_drawers", { height: 820, heightCarcass: 782, worktopThicknessMm: 38, drawerCount: 3 });
    const parameters = normalizeModuleParamsForSource(first.parameters as ModuleParams);
    const normalized = build("fwm_catalog_base_drawers", parameters);
    const dimension = normalized.dimensions.find((d) => d.parameterKey === "drawer1FrontHeightMm")!;
    expect(dimension).toBeDefined();
    const nextParams = normalizeModuleParamsForSource({ ...parameters, drawer1FrontHeightMm: dimension.toParameterValue(240) }, "drawer1FrontHeightMm");
    const after = build("fwm_catalog_base_drawers", nextParams);
    expect(after.dimensions.find((d) => d.parameterKey === "drawer1FrontHeightMm")?.valueMm).toBeCloseTo(240, 1);
    expect(Number.isNaN(dimension.toParameterValue(5000))).toBe(true);
  });
  it("keeps unknown and technical parameters ineligible for guessed dimensions", () => {
    const { modulePackage, parameters, root } = build("fwm_catalog_wall_cabinet");
    const pkg = structuredClone(modulePackage);
    pkg.parameters.parameters.push({ key: "unknownOffset", label: "Unknown", type: "number", unit: "mm", affects: "geometry", defaultValue: 600 });
    pkg.ui.controls.push({ parameterKey: "unknownOffset", controlType: "number" });
    pkg.parameters.parameters.find((p) => p.key === "width")!.uiVisibility = "technical";
    const dimensions = resolveModuleParameterDimensions({ modulePackage: pkg, parameters: { ...parameters, unknownOffset: 600 }, root });
    expect(dimensions.some((d) => ["unknownOffset", "width"].includes(d.parameterKey))).toBe(false);
  });
  it("keeps every generated measurement finite and equal to actual 3D anchors across the shipped catalog", () => {
    for (const pkg of systemModulePackageTemplates) {
      const { dimensions } = build(pkg.module.moduleType);
      for (const d of dimensions) {
        expect(Number.isFinite(d.valueMm), `${pkg.module.moduleType}:${d.parameterKey}`).toBe(true);
        expect(new THREE.Vector3(...d.start).distanceTo(new THREE.Vector3(...d.end)) * 1000).toBeCloseTo(d.valueMm, 5);
      }
    }
  });
});
