import { describe, expect, it } from "vitest";
import { getSystemSeedCatalog } from "../core/catalog/catalog-repository";
import { createDefaultModulePackageParameters } from "../core/module-package/runtime/module-runtime-adapter";
import type { ModuleParams } from "../model/cabinetTypes";
import { makeDefaultDrawerLowParams } from "../modules/drawerLow/types";
import { makeDefaultFwmFurnitureParams } from "../modules/fwmFurniture/types";
import { extendedFurnitureModulePackages } from "../system/module-packages/extendedFurniture";
import { createPinoNobiliaTenantModulePackages } from "../system/pinoNobiliaTenantPackages";
import { makeDefaultKitchenContext, resolveContext } from "./kitchenContext";
import { applyKitchenContextToModuleParams } from "./kitchenMaterialSync";

function getTenantPackage(moduleType: string) {
  const modulePackage = createPinoNobiliaTenantModulePackages().find((entry) => entry.module.moduleType === moduleType);
  expect(modulePackage, moduleType).toBeTruthy();
  return modulePackage!;
}

function num(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readDrawerFrontHeights(params: Record<string, unknown>) {
  return Array.isArray(params.drawerFrontHeights)
    ? params.drawerFrontHeights.filter((value): value is number => typeof value === "number" && Number.isFinite(value))
    : [];
}

function materialIdForFamily(catalog: ReturnType<typeof getSystemSeedCatalog>, family: string, except: string[] = []) {
  return catalog.materials.find((material) =>
    material.materialType === "board" &&
    material.isActive &&
    material.boardFamily === family &&
    !except.includes(material.id)
  )?.id ?? catalog.materials.find((material) =>
    material.materialType === "board" &&
    material.isActive &&
    material.boardFamily === family
  )?.id ?? "";
}

function materialById(catalog: ReturnType<typeof getSystemSeedCatalog>, materialId: string) {
  const material = catalog.materials.find((candidate) => candidate.id === materialId);
  expect(material, materialId).toBeTruthy();
  return material!;
}

function getVisibleDrawerStackHeight(params: Record<string, unknown>) {
  const drawerCount = Math.max(1, Math.round(num(params.drawerCount, 1)));
  const worktopThicknessMm = params.requiresWorktop === false ? 0 : Math.max(0, Math.round(num(params.worktopThicknessMm, 0)));
  return Math.max(
    drawerCount,
    Math.round(num(params.height, 0)) -
      worktopThicknessMm -
      Math.max(0, Math.round(num(params.plinthHeight, 0))) -
      Math.max(0, Math.round(num(params.topGap, 0))) -
      Math.max(0, Math.round(num(params.bottomGap, 0))) -
      Math.max(0, Math.round(num(params.frontGap, 0))) * (drawerCount - 1)
  );
}

describe("applyKitchenContextToModuleParams", () => {
  it("re-normalizes PINO tenant drawer modules after package kitchen-context sync", () => {
    const catalog = getSystemSeedCatalog();
    const modulePackage = getTenantPackage("drawer_low");
    const ctx = resolveContext({
      ...makeDefaultKitchenContext(catalog),
      heightMm: 910,
      worktopThicknessMm: 28,
      worktopDepthMm: 650,
      worktopFrontOffsetMm: 25,
      worktopBackOffsetMm: 15,
      plinthHeightMm: 120,
      plinthDepthMm: 70
    });
    const params = {
      ...makeDefaultDrawerLowParams(),
      modulePackageId: modulePackage.module.modulePackageId,
      catalogKey: "UA-60",
      drawerCount: 5,
      vendorPlacementZone: "low",
      vendorFeatureTags: ["drawer_stack"]
    } as ModuleParams & Record<string, unknown>;
    const beforeStackHeight = readDrawerFrontHeights(params).reduce((sum, value) => sum + value, 0);

    applyKitchenContextToModuleParams(params, ctx, catalog, modulePackage);

    const drawerFrontHeights = readDrawerFrontHeights(params);
    expect(params.height).toBe(ctx.heightMm);
    expect(params.heightCarcass).toBe(num(params.height) - num(params.worktopThicknessMm));
    expect(params.depth).toBe(ctx.moduleDepthMm);
    expect(params.plinthHeight).toBe(ctx.plinthHeightMm);
    expect(drawerFrontHeights).toHaveLength(5);
    expect(drawerFrontHeights.reduce((sum, value) => sum + value, 0)).toBe(getVisibleDrawerStackHeight(params));
    expect(drawerFrontHeights.reduce((sum, value) => sum + value, 0)).not.toBe(beforeStackHeight);
    expect(params.catalogKey).toBe("UA-60");
    expect(params.vendorPlacementZone).toBe("low");
    expect(params.vendorFeatureTags).toEqual(["drawer_stack"]);
  });

  it("keeps PINO appliance-ready base metadata while syncing kitchen dimensions and materials", () => {
    const catalog = getSystemSeedCatalog();
    const modulePackage = getTenantPackage("fwm_kitchen_special_module_2");
    const ctx = resolveContext({
      ...makeDefaultKitchenContext(catalog),
      heightMm: 930,
      worktopThicknessMm: 38,
      worktopDepthMm: 680,
      worktopFrontOffsetMm: 30,
      worktopBackOffsetMm: 10,
      plinthHeightMm: 140,
      plinthDepthMm: 80
    });
    const params = {
      ...makeDefaultFwmFurnitureParams("fwm_kitchen_special_module_2"),
      modulePackageId: modulePackage.module.modulePackageId,
      catalogKey: "UKB2A-40",
      vendorPlacementZone: "low",
      vendorFeatureTags: ["hob_zone"],
      vendorPlacementHint: "hob_zone",
      bodyMaterialId: "stale.body",
      frontMaterialId: "stale.front"
    } as ModuleParams & Record<string, unknown>;

    applyKitchenContextToModuleParams(params, ctx, catalog, modulePackage);

    expect(params.kitchenModuleRole).toBe("low");
    expect(params.requiresWorktop).toBe(true);
    expect(params.height).toBe(ctx.heightMm);
    expect(params.heightCarcass).toBe(num(params.height) - num(params.worktopThicknessMm));
    expect(params.depth).toBe(ctx.moduleDepthMm);
    expect(params.plinthHeight).toBe(ctx.plinthHeightMm);
    expect(params.worktopThicknessMm).toBe(ctx.worktopThicknessMm);
    expect(params.bodyMaterialId).toBe(ctx.corpusMaterialId);
    expect(params.frontMaterialId).toBe(ctx.frontsMaterialId);
    expect(params.catalogKey).toBe("UKB2A-40");
    expect(params.vendorPlacementZone).toBe("low");
    expect(params.vendorFeatureTags).toEqual(["hob_zone"]);
    expect(params.vendorPlacementHint).toBe("hob_zone");
  });

  it("forces package module material ids, colors, metadata and slots from the kitchen group", () => {
    const catalog = getSystemSeedCatalog();
    const modulePackage = extendedFurnitureModulePackages.find((entry) => entry.module.moduleType === "fwm_catalog_base_drawers");
    expect(modulePackage).toBeTruthy();
    const packageWithoutAliases = structuredClone(modulePackage!);
    for (const binding of packageWithoutAliases.behavior?.contextBindings ?? []) {
      for (const rule of binding.materialSync ?? []) rule.aliases = [];
    }
    expect(catalog.kitchenDefaults.carcassMaterialId).toBeTruthy();
    expect(catalog.kitchenDefaults.backPanelMaterialId).toBeTruthy();
    const bodyMaterialId = catalog.kitchenDefaults.carcassMaterialId!;
    const frontMaterialId = materialIdForFamily(catalog, "front");
    const backMaterialId = catalog.kitchenDefaults.backPanelMaterialId!;
    const drawerBottomMaterialId = materialIdForFamily(catalog, "drawer_bottom");
    const ctx = resolveContext({
      ...makeDefaultKitchenContext(catalog),
      corpusMaterialId: bodyMaterialId,
      frontsMaterialId: frontMaterialId,
      backMaterialId,
      drawerBottomMaterialId
    });
    const params = {
      ...createDefaultModulePackageParameters(packageWithoutAliases),
      type: packageWithoutAliases.module.moduleType,
      bodyMaterialId: "stale.body",
      frontMaterialId: "stale.front",
      backMaterialId: "stale.back",
      drawerBottomMaterialId: "stale.drawer_bottom",
      bodyColor: "#010101",
      frontColor: "#020202",
      backColor: "#030303",
      drawerColor: "#040404",
      materialAssignments: {
        carcass: "stale.body",
        front: "stale.front",
        back: "stale.back",
        drawer_bottom: "stale.drawer_bottom"
      },
      materials: {
        bodyMaterialId: "stale.body",
        frontMaterialId: "stale.front",
        backMaterialId: "stale.back",
        drawerMaterialId: "stale.drawer_bottom",
        bodyColor: "#010101",
        frontColor: "#020202",
        backColor: "#030303",
        drawerColor: "#040404"
      }
    } as unknown as ModuleParams & Record<string, unknown>;

    applyKitchenContextToModuleParams(params, ctx, catalog, packageWithoutAliases);

    const materials = params.materials as Record<string, unknown>;
    const assignments = params.materialAssignments as Record<string, unknown>;
    const body = materialById(catalog, bodyMaterialId);
    const front = materialById(catalog, frontMaterialId);
    const back = materialById(catalog, backMaterialId);
    const drawerBottom = materialById(catalog, drawerBottomMaterialId);

    expect(params.bodyMaterialId).toBe(bodyMaterialId);
    expect(params.bodyColor).toBe(body.preview.colorHex);
    expect(materials.bodyName).toBe(body.displayName);
    expect(assignments.carcass).toBe(bodyMaterialId);
    expect(params.frontMaterialId).toBe(frontMaterialId);
    expect(params.frontColor).toBe(front.preview.colorHex);
    expect(materials.frontName).toBe(front.displayName);
    expect(assignments.front).toBe(frontMaterialId);
    expect(params.backMaterialId).toBe(backMaterialId);
    expect(params.backColor).toBe(back.preview.colorHex);
    expect(materials.backName).toBe(back.displayName);
    expect(assignments.back).toBe(backMaterialId);
    expect(params.drawerBottomMaterialId).toBe(drawerBottomMaterialId);
    expect(params.drawerMaterialId).toBe(drawerBottomMaterialId);
    expect(params.drawerColor).toBe(drawerBottom.preview.colorHex);
    expect(materials.drawerName).toBe(drawerBottom.displayName);
    expect(assignments.drawer_bottom).toBe(drawerBottomMaterialId);
  });
});
