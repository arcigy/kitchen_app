import { describe, expect, it } from "vitest";
import { createSystemCatalogSeed } from "../core/catalog/catalog-bootstrap";
import {
  buildPinoShowroomPlan,
  createPinoShowroomKitchenContext,
  createPinoShowroomSeedEntries,
  type PinoShowroomSeedEntry
} from "./pinoVendorShowroom";
import type { PinoVendorKitchenCatalogEntry } from "../layout/pinoVendorKitchenCatalog";

function vendorEntry(overrides: Partial<PinoVendorKitchenCatalogEntry> & Pick<PinoVendorKitchenCatalogEntry, "productTemplateId" | "productTemplateName" | "catalogKey" | "moduleType" | "modulePackageId" | "groupId" | "groupLabel" | "role" | "params">): PinoVendorKitchenCatalogEntry {
  const base: PinoVendorKitchenCatalogEntry = {
    productTemplateId: overrides.productTemplateId,
    productTemplateName: overrides.productTemplateName,
    catalogKey: overrides.catalogKey,
    moduleType: overrides.moduleType,
    modulePackageId: overrides.modulePackageId,
    runtimeBuilderKey: null,
    groupId: overrides.groupId,
    groupLabel: overrides.groupLabel,
    role: overrides.role,
    params: overrides.params,
    articleFamilies: [],
    availableWidthsMm: [],
    widthLabel: "",
    sourcePages: [],
    featureTags: [],
    placementZone: "low",
    status: "resolved",
    templateNeedsReview: false
  };
  return { ...base, ...overrides };
}

function showroomEntry(overrides: Partial<PinoShowroomSeedEntry> & Pick<PinoShowroomSeedEntry, "id" | "source" | "role" | "groupId" | "groupLabel" | "title" | "catalogKey" | "moduleType" | "params" | "widthMm" | "depthMm" | "footprintWidthMm" | "footprintDepthMm">): PinoShowroomSeedEntry {
  return { ...overrides };
}

describe("pinoVendorShowroom", () => {
  it("packs modules into multiple rows when row width would overflow", () => {
    const entries = [
      showroomEntry({
        id: "a",
        source: "vendor_catalog",
        role: "low",
        groupId: "g1",
        groupLabel: "Drawer base cabinets",
        title: "A",
        catalogKey: "A",
        moduleType: "drawer_low",
        params: { type: "drawer_low", width: 600, depth: 560 },
        widthMm: 600,
        depthMm: 560,
        footprintWidthMm: 4200,
        footprintDepthMm: 560
      }),
      showroomEntry({
        id: "b",
        source: "vendor_catalog",
        role: "low",
        groupId: "g1",
        groupLabel: "Drawer base cabinets",
        title: "B",
        catalogKey: "B",
        moduleType: "drawer_low",
        params: { type: "drawer_low", width: 600, depth: 560 },
        widthMm: 600,
        depthMm: 560,
        footprintWidthMm: 4200,
        footprintDepthMm: 560
      }),
      showroomEntry({
        id: "c",
        source: "vendor_catalog",
        role: "low",
        groupId: "g2",
        groupLabel: "Open shelf bases",
        title: "C",
        catalogKey: "C",
        moduleType: "drawer_low",
        params: { type: "drawer_low", width: 600, depth: 560 },
        widthMm: 600,
        depthMm: 560,
        footprintWidthMm: 4200,
        footprintDepthMm: 560
      })
    ];

    const plan = buildPinoShowroomPlan(entries, {
      maxRowWidthMm: 9000,
      rowGapMm: 1500,
      roleGapMm: 2000
    });

    expect(plan.rows).toHaveLength(2);
    expect(plan.rows[0]?.itemCount).toBe(2);
    expect(plan.rows[1]?.itemCount).toBe(1);
    expect(plan.rows[1]!.zMm).toBeGreaterThan(plan.rows[0]!.zMm);
  });

  it("creates side-cabinet showroom entries for every catalog row", () => {
    const planEntries = createPinoShowroomSeedEntries([]);
    const sideCabinetEntries = planEntries.filter((entry) => entry.source === "side_cabinet");

    expect(sideCabinetEntries).toHaveLength(32);
    expect(sideCabinetEntries.every((entry) => entry.role === "tall")).toBe(true);
    expect(sideCabinetEntries.some((entry) => entry.catalogKey === "GB-FB")).toBe(true);
    expect(sideCabinetEntries.some((entry) => entry.catalogKey === "S-45-K")).toBe(true);
  });

  it("adds explicit appliance showroom entries for dishwasher and tall appliance modules", () => {
    const planEntries = createPinoShowroomSeedEntries([]);
    const applianceEntries = planEntries.filter((entry) => entry.source === "synthetic_appliance");
    const applianceTypes = applianceEntries.map((entry) => entry.moduleType);

    expect(applianceEntries).toHaveLength(4);
    expect(applianceTypes).toEqual(expect.arrayContaining([
      "fwm_built_in_dishwasher",
      "fwm_built_in_fridge",
      "fwm_oven_tower_module",
      "fwm_microwave_tower_module"
    ]));
  });

  it("adds a showroom accessory row for every PINO handle from the PDF catalog", () => {
    const planEntries = createPinoShowroomSeedEntries([]);
    const handleEntries = planEntries.filter((entry) => entry.source === "handle_display");

    expect(handleEntries).toHaveLength(38);
    expect(handleEntries.every((entry) => entry.role === "accessory")).toBe(true);
    expect(handleEntries.some((entry) => entry.catalogKey === "HANDLE-601")).toBe(true);
    expect(handleEntries.some((entry) => entry.title.includes("894"))).toBe(true);
  });

  it("builds showroom kitchen context from tenant defaults and resolves worktop thickness from the selected material", () => {
    const catalog = createSystemCatalogSeed();
    catalog.materials.push({
      id: "mat.pino.worktop.custom.25",
      entityType: "material",
      materialType: "board",
      name: "PINO thin worktop",
      displayName: "PINO thin worktop",
      category: "PINO worktop",
      baseMaterial: "laminate",
      decor: "stone",
      color: "grey",
      finish: "matte",
      pricingBasis: "sheet_area",
      pricingUnit: "m2",
      availableThicknessesMm: [25],
      defaultThicknessMm: 25,
      isActive: true,
      tags: ["pino", "worktop"],
      preview: { colorHex: "#777777", roughness: 0.5, metalness: 0 },
      boardFamily: "worktop",
      recommendedUse: "worktop",
      grainDirectionRelevant: false
    });
    catalog.kitchenDefaults.worktopMaterialId = "mat.pino.worktop.custom.25";
    catalog.kitchenDefaults.defaultWorktopThicknessMm = 38;
    catalog.kitchenDefaults.defaultPlinthHeightMm = 150;

    const ctx = createPinoShowroomKitchenContext(catalog);

    expect(ctx.worktopMaterialId).toBe("mat.pino.worktop.custom.25");
    expect(ctx.worktopThicknessMm).toBe(25);
    expect(ctx.plinthHeightMm).toBe(150);
    expect(ctx.moduleHeightMm).toBe(ctx.heightMm - ctx.worktopThicknessMm);
  });

  it("combines vendor catalog entries with side cabinets and keeps a floor boundary", () => {
    const planEntries = createPinoShowroomSeedEntries([
      vendorEntry({
        productTemplateId: "vendor-drawer",
        productTemplateName: "Drawer module",
        catalogKey: "USA-60",
        moduleType: "drawer_low",
        modulePackageId: "pino_nobilia_drawer_low_vkh_2026_v1",
        groupId: "drawer_base",
        groupLabel: "Drawer base cabinets",
        role: "low",
        params: { type: "drawer_low", width: 600, depth: 560 }
      }),
      vendorEntry({
        productTemplateId: "vendor-cover",
        productTemplateName: "Cover panel",
        catalogKey: "UPT-10",
        moduleType: "fwm_interior_cladding_1",
        modulePackageId: "pino_nobilia_fwm_interior_cladding_1_vkh_2026_v1",
        groupId: "cover_panels",
        groupLabel: "Cover panels",
        role: "accessory",
        params: { type: "fwm_interior_cladding_1", width: 100, depth: 40 }
      })
    ]);

    const plan = buildPinoShowroomPlan(planEntries);

    expect(plan.entries).toHaveLength(76);
    expect(plan.placements).toHaveLength(76);
    expect(plan.floorBoundary).toHaveLength(4);
    expect(plan.extentsMm.maxX).toBeGreaterThan(plan.extentsMm.minX);
    expect(plan.extentsMm.maxZ).toBeGreaterThan(plan.extentsMm.minZ);
  });
});
