// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { createSystemCatalogSeed } from "../core/catalog/catalog-bootstrap";
import type { ClientCatalog } from "../core/catalog/catalog-types";
import { createDefaultProjectMaterialAssignments } from "../core/project-materials/project-material-business";
import type { ProjectMaterialsView } from "../core/project-materials/project-material-types";
import { FakeElement } from "./testUtils/propertiesPanelHarness";
import { createMaterialsPhaseController } from "./materialsPhaseController";

class MaterialsHost extends FakeElement {
  removeEventListener(type: string, listener: (event: Record<string, unknown>) => void) {
    this.listeners.set(type, (this.listeners.get(type) ?? []).filter((candidate) => candidate !== listener));
  }
}

const NOW = "2026-07-09T20:00:00.000Z";
const testCatalog = (): ClientCatalog => ({ clientId: "client_test", ...createSystemCatalogSeed() });

describe("materials phase controller", () => {
  it("commits a valid exact material lookup into the local fallback model", async () => {
    const catalog = testCatalog();
    const initial = createDefaultProjectMaterialAssignments(catalog, NOW);
    const currentFront = initial.assignments.find((item) => item.category === "front")!;
    const source = catalog.materials.find((item) => item.boardFamily === "front")!;
    const replacement = { ...structuredClone(source), id: `${source.id}.replacement`, displayName: "Nový front" };
    catalog.materials.push(replacement);
    catalog.priceList.prices[replacement.id] = 42;
    const lookupCatalogItem = vi.fn().mockResolvedValue({ kind: "material", definition: replacement, unitPrice: 42 });
    const onViewChanged = vi.fn();
    const controller = createMaterialsPhaseController({
      container: new MaterialsHost() as unknown as HTMLElement,
      catalog,
      getQuantities: () => [{ category: "front", quantity: 12, unit: "m2" }],
      initialAssignments: initial,
      now: () => NOW,
      onViewChanged,
      api: { lookupCatalogItem }
    });

    const result = await controller.commitId({
      category: "front",
      field: "materialId",
      value: "supplier-alias-front",
      committedValue: currentFront.materialId ?? ""
    });

    expect(result).toEqual({ ok: true });
    const saved = controller.getSaveState();
    const front = saved.assignments.find((item) => item.category === "front")!;
    expect(front.materialId).toBe(replacement.id);
    expect(front.snapshots.material?.definition.displayName).toBe("Nový front");
    expect(front.snapshots.material?.unitPrice).toBe(42);
    expect(front.thicknessMm).toBe(replacement.defaultThicknessMm);
    expect(front.source).toBe("user");
    expect(saved.revision).toBe(initial.revision + 1);
    expect(onViewChanged).toHaveBeenLastCalledWith(expect.objectContaining({ assignments: saved }));
  });

  it("keeps the committed assignment unchanged after an invalid or inactive lookup", async () => {
    const catalog = testCatalog();
    const initial = createDefaultProjectMaterialAssignments(catalog, NOW);
    const before = structuredClone(initial.assignments.find((item) => item.category === "front")!);
    const inactive = { ...structuredClone(catalog.materials.find((item) => item.boardFamily === "front")!), isActive: false };
    const lookupCatalogItem = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ kind: "material", definition: inactive, unitPrice: 1 });
    const controller = createMaterialsPhaseController({
      container: new MaterialsHost() as unknown as HTMLElement,
      catalog,
      getQuantities: () => [],
      initialAssignments: initial,
      api: { lookupCatalogItem }
    });

    const missing = await controller.commitId({ category: "front", field: "materialId", value: "missing", committedValue: before.materialId ?? "" });
    const inactiveResult = await controller.commitId({ category: "front", field: "materialId", value: inactive.id, committedValue: before.materialId ?? "" });

    expect(missing.ok).toBe(false);
    expect(missing.error).toContain("Pôvodná hodnota");
    expect(inactiveResult.ok).toBe(false);
    expect(inactiveResult.error).toContain("neaktívna");
    expect(controller.getSaveState().assignments.find((item) => item.category === "front")).toEqual(before);
    expect(controller.getSaveState().revision).toBe(initial.revision);
  });

  it("loads and saves remotely only after the project materials endpoint succeeds", async () => {
    const catalog = testCatalog();
    const initial = createDefaultProjectMaterialAssignments(catalog, NOW);
    const remoteView = {
      assignments: initial,
      quantities: [{ category: "front" as const, quantity: 13, unit: "m2" as const }],
      warnings: [{
        id: "server-catalog-warning",
        severity: "warning" as const,
        title: "Server warning",
        description: "Authoritative server warning",
        affectedCategory: "front" as const
      }],
      priceSource: {
        priceListId: catalog.priceList.id,
        name: "Remote tenant price list",
        currency: catalog.priceList.currency,
        source: catalog.meta.source,
        lastSynchronizedAt: null
      }
    };
    const front = catalog.materials.find((item) => item.boardFamily === "front")!;
    const loadProjectMaterials = vi.fn().mockResolvedValue(remoteView);
    const updateProjectMaterialAssignment = vi.fn().mockResolvedValue(remoteView);
    const controller = createMaterialsPhaseController({
      container: new MaterialsHost() as unknown as HTMLElement,
      catalog,
      getProjectId: () => "project_1",
      getQuantities: () => [{ category: "front", quantity: 12, unit: "m2" }],
      initialAssignments: initial,
      api: {
        loadProjectMaterials,
        updateProjectMaterialAssignment,
        lookupCatalogItem: vi.fn().mockResolvedValue({ kind: "material", definition: front, unitPrice: 10 })
      }
    });

    await controller.open();
    expect(controller.getView().quantities).toEqual(remoteView.quantities);
    expect(controller.getView().warnings).toEqual(remoteView.warnings);
    expect(controller.getView().priceSource.name).toBe("Remote tenant price list");
    await controller.commitId({ category: "front", field: "materialId", value: "supplier-front-code", committedValue: "old" });

    expect(loadProjectMaterials).toHaveBeenCalledWith("project_1", expect.any(AbortSignal));
    expect(updateProjectMaterialAssignment).toHaveBeenCalledWith(
      "project_1",
      expect.objectContaining({ revision: initial.revision, assignment: expect.objectContaining({ category: "front", materialId: front.id }) }),
      expect.any(AbortSignal)
    );
    expect(controller.getView().quantities).toEqual(remoteView.quantities);
    expect(controller.getView().warnings).toEqual(remoteView.warnings);
  });

  it("keeps project assignments read-only when the authoritative server load fails", async () => {
    const catalog = testCatalog();
    const initial = createDefaultProjectMaterialAssignments(catalog, NOW);
    const front = catalog.materials.find((item) => item.boardFamily === "front")!;
    const updateProjectMaterialAssignment = vi.fn();
    const controller = createMaterialsPhaseController({
      container: new MaterialsHost() as unknown as HTMLElement,
      catalog,
      getProjectId: () => "project_1",
      getQuantities: () => [],
      initialAssignments: initial,
      api: {
        loadProjectMaterials: vi.fn().mockRejectedValue(new Error("offline")),
        updateProjectMaterialAssignment,
        lookupCatalogItem: vi.fn().mockResolvedValue({ kind: "material", definition: front, unitPrice: 10 })
      }
    });

    await controller.open();
    const result = await controller.commitId({
      category: "front",
      field: "materialId",
      value: front.id,
      committedValue: "old"
    });

    expect(result).toMatchObject({ ok: false });
    expect(result.error).toContain("nie sú načítané");
    expect(updateProjectMaterialAssignment).not.toHaveBeenCalled();
    expect(controller.getSaveState()).toEqual(initial);
  });

  it("replaces an uninitialized migrated state with current catalog defaults", () => {
    const catalog = testCatalog();
    const empty = { schemaVersion: 1 as const, initialized: false, revision: 0, assignments: [] };
    const controller = createMaterialsPhaseController({
      container: new MaterialsHost() as unknown as HTMLElement,
      catalog,
      getQuantities: () => [],
      initialAssignments: empty,
      now: () => NOW,
      api: { lookupCatalogItem: vi.fn() }
    });

    const state = controller.getSaveState();
    expect(state.initialized).toBe(true);
    expect(state.assignments).not.toHaveLength(0);
    expect(state.assignments.find((item) => item.category === "corpus")?.materialId).toBe(catalog.kitchenDefaults.carcassMaterialId);
  });

  it("recomputes module scopes from the current layout every time Materials opens", async () => {
    const catalog = testCatalog();
    const scopes: Array<{ id: string; kind: "module"; label: string; items: [] }> = [];
    const controller = createMaterialsPhaseController({
      container: new MaterialsHost() as unknown as HTMLElement,
      catalog,
      getQuantities: () => [],
      getScopes: () => scopes,
      initialAssignments: createDefaultProjectMaterialAssignments(catalog, NOW)
    });

    await controller.open();
    expect(controller.getView().scopes).toEqual([]);
    await controller.close();

    scopes.push({ id: "module:new-module", kind: "module", label: "New module", items: [] });
    await controller.open();

    expect(controller.getView().scopes).toEqual([
      expect.objectContaining({ id: "module:new-module", kind: "module" })
    ]);
  });

  it("does not let a stale remote response erase scopes from the live layout", async () => {
    const catalog = testCatalog();
    const initial = createDefaultProjectMaterialAssignments(catalog, NOW);
    const controller = createMaterialsPhaseController({
      container: new MaterialsHost() as unknown as HTMLElement,
      catalog,
      getProjectId: () => "project_1",
      getQuantities: () => [],
      getScopes: () => [{ id: "module:live", kind: "module", label: "Live module", items: [] }],
      initialAssignments: initial,
      api: {
        loadProjectMaterials: vi.fn().mockResolvedValue({
          assignments: initial,
          quantities: [],
          warnings: [],
          scopes: [],
          priceSource: {
            priceListId: catalog.priceList.id,
            name: catalog.priceList.name,
            currency: catalog.priceList.currency,
            source: catalog.meta.source,
            lastSynchronizedAt: null
          }
        })
      }
    });

    await controller.open();

    expect(controller.getView().scopes).toEqual([
      expect.objectContaining({ id: "module:live" })
    ]);
  });

  it("replaces a previously loaded Materials view with a skeleton until the refreshed server view arrives", async () => {
    const catalog = testCatalog();
    const initial = createDefaultProjectMaterialAssignments(catalog, NOW);
    const stale = structuredClone(initial);
    const current = structuredClone(initial);
    let resolveCurrent!: (value: ProjectMaterialsView) => void;
    const currentLoad = new Promise<ProjectMaterialsView>((resolve) => { resolveCurrent = resolve; });
    const remoteView = (assignments: typeof initial, warningTitle: string): ProjectMaterialsView => ({
      assignments,
      quantities: [],
      warnings: [{
        id: warningTitle,
        severity: "warning",
        title: warningTitle,
        description: "Authoritative server state"
      }],
      priceSource: {
        priceListId: catalog.priceList.id,
        name: catalog.priceList.name,
        currency: catalog.priceList.currency,
        source: catalog.meta.source,
        lastSynchronizedAt: null
      }
    });
    const container = document.createElement("section");
    const controller = createMaterialsPhaseController({
      container,
      catalog,
      getProjectId: () => "project_1",
      getQuantities: () => [],
      initialAssignments: initial,
      api: { loadProjectMaterials: vi.fn().mockResolvedValueOnce(remoteView(stale, "Old material warning")).mockReturnValueOnce(currentLoad) }
    });

    await controller.open();
    expect(container.textContent).toContain("Old material warning");
    await controller.close();

    const opening = controller.open();
    expect(container.querySelector('[data-loading-skeleton="phase"]')).not.toBeNull();
    expect(container.textContent).not.toContain("Old material warning");
    resolveCurrent(remoteView(current, "Current material warning"));
    await opening;

    expect(container.textContent).toContain("Current material warning");
  });
});
