import { describe, expect, it, vi } from "vitest";
import { FakeElement } from "../app/testUtils/propertiesPanelHarness";
import type { ClientCatalog, ClientModuleDefinition, MaterialDefinition, VendorProductVariant } from "../core/catalog/catalog-types";
import { attachVendorModuleIntent } from "../core/catalog/vendor-module-intent";
import { createPinoVendorControls } from "./pinoVendorControls";

function installTaggedFakeDocument() {
  vi.stubGlobal("document", {
    createElement: (tagName: string) => {
      const element = new FakeElement();
      element.dataset.tagName = tagName;
      if (tagName === "input") element.type = "text";
      return element;
    },
    createTextNode: (text: string) => {
      const node = new FakeElement();
      node.textContent = text;
      return node;
    }
  });
}

function moduleDef(overrides: Partial<ClientModuleDefinition>): ClientModuleDefinition {
  return {
    id: overrides.modulePackageId ?? overrides.moduleType ?? "drawer_low",
    moduleType: overrides.moduleType ?? "drawer_low",
    modulePackageId: overrides.modulePackageId ?? `pino_nobilia_${overrides.moduleType ?? "drawer_low"}_vkh_2026_v1`,
    packageVersion: "1.0.0",
    packageHash: "hash",
    name: overrides.name ?? "Module",
    enabled: overrides.enabled ?? true,
    runtimeBuilderKey: overrides.runtimeBuilderKey ?? "drawerLow.v1",
    category: overrides.category ?? "base_cabinet",
    ...overrides
  };
}

function variant(overrides: Partial<VendorProductVariant> = {}): VendorProductVariant {
  return attachVendorModuleIntent({
    productTemplateId: "tpl_drawer",
    sourcePdf: "VKH_2026_CZ.pdf",
    sourcePage: 99,
    articleCode: "UA60",
    articleFamily: "UA",
    widthCm: 60,
    widthMm: 600,
    variantCode: null,
    variantCodeStatus: "none_expected",
    catalogKey: "UA-60",
    productTemplateName: "Spodni skrinka; 1 vysuv",
    notes: ["1 vysuv"],
    priceGroupValues: { "0": 930, "3": 1157 },
    confidence: 1,
    needsReview: false,
    ...overrides
  });
}

function catalog(): ClientCatalog {
  const materials: MaterialDefinition[] = [
    {
      id: "mat.body",
      name: "Body",
      displayName: "Body",
      boardFamily: "body",
      thicknessMm: 18,
      grainDirection: "none",
      pricePerM2: 1,
      sheetLengthMm: 2800,
      sheetWidthMm: 2070,
      allowRotation: true,
      active: true,
      isActive: true
    } as unknown as MaterialDefinition,
    {
      id: "mat.front",
      name: "Front",
      displayName: "Front",
      boardFamily: "front",
      thicknessMm: 18,
      grainDirection: "none",
      pricePerM2: 1,
      sheetLengthMm: 2800,
      sheetWidthMm: 2070,
      allowRotation: true,
      active: true,
      isActive: true
    } as unknown as MaterialDefinition,
    {
      id: "mat.back",
      name: "Back",
      displayName: "Back",
      boardFamily: "back",
      thicknessMm: 8,
      grainDirection: "none",
      pricePerM2: 1,
      sheetLengthMm: 2800,
      sheetWidthMm: 2070,
      allowRotation: true,
      active: true,
      isActive: true
    } as unknown as MaterialDefinition
  ];

  const productVariants = [
    variant(),
    variant({
      productTemplateId: "tpl_shelf",
      sourcePage: 100,
      articleCode: "U60",
      articleFamily: "U",
      catalogKey: "U-60",
      productTemplateName: "Spodni skrinka; 1 otocna dvirka; 2 prestavitelne police",
      notes: ["1 otocna dvirka", "2 prestavitelne police"]
    })
  ];

  return {
    clientId: "client_pino_nobilia_vkh_2026",
    materials,
    hardware: [],
    legacyMaterials: [],
    components: [],
    componentGeometry: [],
    modules: [
      moduleDef({
        moduleType: "drawer_low",
        modulePackageId: "pino_nobilia_drawer_low_vkh_2026_v1",
        runtimeBuilderKey: "drawerLow.v1"
      }),
      moduleDef({
        moduleType: "swing_shelves_low",
        modulePackageId: "pino_nobilia_swing_shelves_low_vkh_2026_v1",
        runtimeBuilderKey: "swingShelvesLow.v1"
      })
    ],
    priceList: { id: "price-list", name: "Price list", isActive: true, currency: "EUR", version: 1, prices: [] } as unknown as ClientCatalog["priceList"],
    kitchenDefaults: {
      carcassMaterialId: "mat.body",
      frontMaterialId: "mat.front",
      backPanelMaterialId: "mat.back",
      drawerBottomMaterialId: "mat.back",
      defaultHandleComponentId: "cmp.handle",
      defaultHingeComponentId: "cmp.hinge",
      defaultDrawerSystemComponentId: "cmp.runner",
      defaultWorktopThicknessMm: 38,
      defaultPlinthHeightMm: 100
    },
    vendorCatalog: {
      vendorId: "pino_nobilia",
      displayName: "PINO/Nobilia VKH 2026 CZ",
      source: "vkh_2026_cz_pdf",
      productVariants,
      productTemplates: [],
      pricingReferences: [],
      extractionMeta: {
        sourcePdf: "VKH_2026_CZ.pdf",
        pages: [99, 100],
        productVariants: productVariants.length,
        productTemplates: 0,
        pricingReferences: 0,
        importedAt: "2026-06-16T00:00:00.000Z",
        importStatus: "review_staging",
        productionImportApproved: false,
        notes: []
      }
    },
    meta: {
      catalogVersion: 1,
      source: "client-custom",
      createdAt: "2026-06-16T00:00:00.000Z",
      updatedAt: "2026-06-16T00:00:00.000Z"
    }
  };
}

describe("createPinoVendorControls", () => {
  it.each(["drawer_low", "swing_shelves_low", "pino_side_cabinet"])("does not expose controls capable of restoring %s", (type) => {
    installTaggedFakeDocument();
    const clientCatalog = catalog();
    const params = { type, modulePackageId: `pino_nobilia_${type}_vkh_2026_v1`, vendorProductTemplateId: "tpl_drawer" };
    const before = structuredClone(params);
    const container = new FakeElement();
    const onChange = vi.fn();
    expect(createPinoVendorControls(container as unknown as HTMLElement, params, {
      onChange, clientCatalog, getWorktopThicknessMm: () => 0
    })).toBeNull();
    expect(container.children).toHaveLength(0);
    expect(params).toEqual(before);
    expect(onChange).not.toHaveBeenCalled();
  });
});
