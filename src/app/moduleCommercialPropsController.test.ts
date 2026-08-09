// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import type { MaterialDefinition } from "../core/catalog/catalog-types";
import { createDefaultProjectMarginSettingsState, projectMarginTargetId } from "../core/project-margins/project-margin-types";
import type { ProjectMaterialAssignment, ProjectMaterialScope, ProjectMaterialsView } from "../core/project-materials/project-material-types";
import type { ProjectMarginsView } from "../layout/bom/projectMargins";
import { createModuleCommercialPropsController } from "./moduleCommercialPropsController";

const scope: ProjectMaterialScope = {
  id: "module:module-1",
  kind: "module",
  label: "Spodná skrinka",
  items: [{
    id: "left-side",
    category: "corpus",
    label: "Ľavý bok",
    description: "720 × 560 × 18 mm",
    quantity: 0.4,
    unit: "m2",
    pieces: 1
  }]
};

function assignment(id: string, name: string, assignmentId = `material-assignment:${id}`): ProjectMaterialAssignment {
  const definition: MaterialDefinition = {
    id,
    entityType: "material",
    materialCode: id.toUpperCase(),
    materialType: "board",
    name,
    displayName: name,
    category: "board",
    baseMaterial: "dtd",
    decor: name,
    color: "white",
    finish: "matte",
    pricingBasis: "sheet_area",
    pricingUnit: "m2",
    availableThicknessesMm: [18],
    defaultThicknessMm: 18,
    isActive: true,
    tags: [],
    preview: { colorHex: "#ffffff", roughness: 0.5, metalness: 0 },
    boardFamily: "body"
  };
  return {
    assignmentId,
    category: "corpus",
    kind: "material",
    materialId: id,
    thicknessMm: 18,
    customValues: { supplierBridge: { supplierId: "demos", supplierProductCode: id.toUpperCase() } },
    source: "user",
    snapshots: { material: { definition, unitPrice: id === "oak" ? 100 : 150, currency: "CZK", priceListId: "price-list", capturedAt: "2026-01-01T00:00:00.000Z" } },
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
}

function materialsView(assignments: ProjectMaterialAssignment[], revision = 3): ProjectMaterialsView {
  return {
    assignments: { schemaVersion: 2, initialized: true, revision, assignments },
    quantities: [],
    warnings: [],
    priceSource: { priceListId: "price-list", name: "Cenník", currency: "EUR", source: "tenant", lastSynchronizedAt: null },
    scopes: [scope]
  };
}

function marginsView(resourceLabel = "Dub", marginPercent = 20, revision = 4): ProjectMarginsView {
  const target = { scopeId: scope.id, itemId: "left-side", category: "corpus" as const };
  const item = {
    ...target,
    targetId: projectMarginTargetId(target),
    label: "Ľavý bok",
    scopeLabel: scope.label,
    resourceLabel,
    quantity: 0.4,
    unit: "m2" as const,
    baseCost: resourceLabel === "Biela" ? 60 : 40,
    marginPercent,
    marginAmount: 8,
    finalPrice: 48,
    source: "group" as const,
    missingPrice: false
  };
  const settings = { ...createDefaultProjectMarginSettingsState(), initialized: true, revision };
  return {
    revision,
    editable: true,
    currency: "CZK",
    priceAuthority: "Projektové snapshoty",
    settings,
    summary: { baseCost: item.baseCost, marginAmount: 8, combinedMarginPercent: 20, finalPrice: item.finalPrice, overrideCount: 0, missingPriceCount: 0 },
    groups: [{ category: "corpus", label: "Korpus", description: "Korpusové dosky", baseCost: item.baseCost, marginPercent: 20, combinedMarginPercent: 20, marginAmount: 8, finalPrice: item.finalPrice, overrideCount: 0, missingPriceCount: 0, items: [item] }],
    warnings: []
  };
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("module commercial properties controller", () => {
  it("copies a current project material to the stable module item and updates its exact margin target", async () => {
    const oak = assignment("oak", "Dub");
    const white = assignment("white", "Biela", "material-assignment:module:other:corpus:right-side");
    const initialMaterials = materialsView([oak, white]);
    const copiedWhite = { ...structuredClone(white), assignmentId: "material-assignment:module:module-1:corpus:left-side" };
    const updatedMaterials = materialsView([oak, white, copiedWhite], 4);
    const initialMargins = marginsView();
    const updatedPriceMargins = marginsView("Biela", 20, 5);
    const updatedMargin = marginsView("Biela", 25, 6);
    const loadMaterials = vi.fn(async () => initialMaterials);
    const loadMargins = vi.fn()
      .mockResolvedValueOnce(initialMargins)
      .mockResolvedValueOnce(updatedPriceMargins)
      .mockResolvedValueOnce(updatedPriceMargins);
    const copyMaterial = vi.fn(async () => updatedMaterials);
    const updateMargin = vi.fn(async () => updatedMargin);
    const copyText = vi.fn(async () => undefined);
    const ensureProjectSaved = vi.fn(async () => undefined);
    const onMaterialsChanged = vi.fn();
    const onMarginsChanged = vi.fn();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const controller = createModuleCommercialPropsController({
      getProjectId: () => "project-1",
      getModuleScope: () => scope,
      ensureProjectSaved,
      onMaterialsChanged,
      onMarginsChanged,
      copyText,
      api: { loadMaterials, loadMargins, copyMaterial, updateMargin }
    });

    controller.mount(host, "module-1");
    await controller.flushPending();

    expect(host.querySelector("[data-module-commercial-scope='module:module-1']")).not.toBeNull();
    expect(host.textContent).toContain("Ľavý bok");
    expect(host.querySelector<HTMLInputElement>("[data-module-commercial-material-input]")?.value).toBe("Dub");
    expect(host.textContent).toContain("Kč");

    const materialInput = host.querySelector<HTMLInputElement>("[data-module-commercial-material-input]")!;
    materialInput.value = "Biela";
    materialInput.dispatchEvent(new Event("change", { bubbles: true }));
    await controller.flushPending();

    expect(ensureProjectSaved).toHaveBeenCalledTimes(1);
    expect(copyMaterial).toHaveBeenCalledWith("project-1", {
      revision: 3,
      sourceAssignmentId: white.assignmentId,
      target: { scopeId: "module:module-1", itemId: "left-side", category: "corpus" }
    });
    expect(onMaterialsChanged).toHaveBeenLastCalledWith(updatedMaterials);
    expect(host.textContent).toContain("Biela");
    expect(host.textContent).toContain("Materiál Biela bol uložený");

    host.querySelector<HTMLButtonElement>("[data-module-commercial-copy]")!.click();
    await controller.flushPending();
    expect(copyText).toHaveBeenCalledWith("Biela");

    const marginInput = host.querySelector<HTMLInputElement>("[data-module-commercial-margin-input]")!;
    marginInput.value = "25";
    marginInput.dispatchEvent(new Event("change", { bubbles: true }));
    await controller.flushPending();

    expect(updateMargin).toHaveBeenCalledWith("project-1", {
      revision: 5,
      target: { scopeId: "module:module-1", itemId: "left-side", category: "corpus" },
      marginPercent: 25
    });
    expect(onMarginsChanged).toHaveBeenLastCalledWith(updatedMargin);
    expect(host.textContent).toContain("Marža 25 % bola uložená");
  });

  it("does not guess when pasted material name is ambiguous", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const copyMaterial = vi.fn();
    const controller = createModuleCommercialPropsController({
      getProjectId: () => "project-1",
      getModuleScope: () => scope,
      api: {
        loadMaterials: vi.fn(async () => materialsView([
          assignment("oak", "Dub", "material-assignment:module:module-1:corpus:left-side"),
          assignment("white-a", "Biela"),
          assignment("white-b", "Biela")
        ])),
        loadMargins: vi.fn(async () => marginsView("Biela")),
        copyMaterial,
        updateMargin: vi.fn()
      }
    });

    controller.mount(host, "module-1");
    await controller.flushPending();
    const input = host.querySelector<HTMLInputElement>("[data-module-commercial-material-input]")!;
    input.value = "Biela ";
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await controller.flushPending();

    expect(copyMaterial).not.toHaveBeenCalled();
    expect(host.textContent).toContain("rovnaký názov");
  });

  it("ignores a late load after the properties host is disconnected", async () => {
    let resolveMaterials!: (view: ProjectMaterialsView) => void;
    const pendingMaterials = new Promise<ProjectMaterialsView>((resolve) => { resolveMaterials = resolve; });
    const host = document.createElement("div");
    document.body.appendChild(host);
    const controller = createModuleCommercialPropsController({
      getProjectId: () => "project-1",
      getModuleScope: () => scope,
      api: {
        loadMaterials: vi.fn(() => pendingMaterials),
        loadMargins: vi.fn(async () => marginsView()),
        copyMaterial: vi.fn(),
        updateMargin: vi.fn()
      }
    });

    controller.mount(host, "module-1");
    const loadingHtml = host.innerHTML;
    host.remove();
    resolveMaterials(materialsView([assignment("oak", "Dub")]));
    await controller.flushPending();

    expect(host.innerHTML).toBe(loadingHtml);
  });
});
