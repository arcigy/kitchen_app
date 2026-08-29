import { describe, expect, it, vi } from "vitest";
import { FakeElement } from "../app/testUtils/propertiesPanelHarness";
import type { ClientCatalog, ClientModuleDefinition, MaterialDefinition, VendorProductVariant } from "../core/catalog/catalog-types";
import { attachVendorModuleIntent } from "../core/catalog/vendor-module-intent";
import { resolveVendorModuleSeed } from "../core/catalog/vendor-module-seed-resolver";
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

function resolvedDrawerParams(clientCatalog: ClientCatalog) {
  const result = resolveVendorModuleSeed(clientCatalog, { catalogKey: "UA-60" });
  if (!result.params) throw new Error("Expected resolved drawer seed params.");
  return {
    ...result.params,
    modulePackageId: "pino_nobilia_drawer_low_vkh_2026_v1"
  } as Record<string, unknown>;
}

function walk(root: FakeElement, predicate: (node: FakeElement) => boolean): FakeElement[] {
  const out: FakeElement[] = [];
  const visit = (node: FakeElement) => {
    if (predicate(node)) out.push(node);
    for (const child of node.children) visit(child);
  };
  visit(root);
  return out;
}

function findRow(root: FakeElement, label: string): FakeElement {
  const row = walk(root, (node) =>
    node.className.includes("module-package-control") &&
    node.children[0]?.textContent === label
  )[0];
  if (!row) throw new Error(`Row "${label}" not found.`);
  return row;
}

function controlOfTag(row: FakeElement, tagName: string): FakeElement {
  const control = row.children.find((child) => child.dataset.tagName === tagName);
  if (!control) throw new Error(`Control ${tagName} not found.`);
  return control;
}

describe("createPinoVendorControls", () => {
  it("switches PINO vendor-backed base modules across catalog groups via resolver seeds", () => {
    installTaggedFakeDocument();
    const clientCatalog = catalog();
    const params = resolvedDrawerParams(clientCatalog);
    const container = new FakeElement() as unknown as HTMLElement;
    const onChange = vi.fn(() => true);

    const api = createPinoVendorControls(container, params, {
      onChange,
      clientCatalog,
      getWorktopThicknessMm: () => 0
    });

    expect(api).not.toBeNull();

    const groupSelect = controlOfTag(findRow(container as unknown as FakeElement, "Skupina"), "select");
    const nextGroup = groupSelect.children.find((child) => child.value !== groupSelect.value);
    expect(nextGroup?.value).toBeTruthy();

    groupSelect.value = nextGroup!.value;
    groupSelect.dispatch("change");

    expect(onChange).toHaveBeenCalledOnce();
    expect(params.type).toBe("swing_shelves_low");
    expect(params.modulePackageId).toBe("pino_nobilia_swing_shelves_low_vkh_2026_v1");
    expect(params.catalogKey).toBe("U-60");
    expect(params.articleFamily).toBe("U");
  });

  it("updates vendor price group, materials, and opened state through the shared change hook", () => {
    installTaggedFakeDocument();
    const clientCatalog = catalog();
    const params = {
      ...resolvedDrawerParams(clientCatalog),
      opened: false
    } as Record<string, unknown> & { opened: boolean; vendorSelectedPriceGroup?: string; bodyMaterialId?: string };
    const container = new FakeElement() as unknown as HTMLElement;
    const onChange = vi.fn(() => true);

    createPinoVendorControls(container, params, {
      onChange,
      clientCatalog,
      getWorktopThicknessMm: () => 0
    });

    const priceSelect = controlOfTag(findRow(container as unknown as FakeElement, "Cenova skupina"), "select");
    priceSelect.value = "3";
    priceSelect.dispatch("change");

    const bodySelect = controlOfTag(findRow(container as unknown as FakeElement, "Material korpusu"), "select");
    bodySelect.value = "mat.body";
    bodySelect.dispatch("change");

    const openedInput = controlOfTag(findRow(container as unknown as FakeElement, "Otvorene"), "input");
    openedInput.checked = true;
    openedInput.dispatch("change");

    expect(params.vendorSelectedPriceGroup).toBe("3");
    expect(params.bodyMaterialId).toBe("mat.body");
    expect(params.opened).toBe(true);
    expect(onChange).toHaveBeenCalledTimes(3);
  });
});
