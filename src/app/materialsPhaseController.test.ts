// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { createSystemCatalogSeed } from "../core/catalog/catalog-bootstrap";
import type { ClientCatalog } from "../core/catalog/catalog-types";
import { createDefaultProjectMaterialAssignments, createProjectMaterialsView } from "../core/project-materials/project-material-business";
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

    await expect(controller.open()).rejects.toThrow("offline");
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
    const empty = { schemaVersion: 2 as const, initialized: false, revision: 0, assignments: [] };
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

  it("applies an externally assigned supplier material immediately without opening the Materials view", async () => {
    const catalog = testCatalog();
    const initial = createDefaultProjectMaterialAssignments(catalog, NOW);
    const remote = structuredClone(initial);
    const corpus = remote.assignments.find((assignment) => assignment.category === "corpus")!;
    corpus.thicknessMm = 19;
    corpus.snapshots.material!.definition.defaultThicknessMm = 19;
    const onAssignmentsCommitted = vi.fn();
    const loadProjectMaterials = vi.fn().mockResolvedValue({
      assignments: remote, quantities: [], warnings: [], scopes: [],
      priceSource: { priceListId: catalog.priceList.id, name: catalog.priceList.name, currency: catalog.priceList.currency, source: catalog.meta.source, lastSynchronizedAt: null }
    } satisfies ProjectMaterialsView);
    const controller = createMaterialsPhaseController({
      container: new MaterialsHost() as unknown as HTMLElement,
      catalog,
      getProjectId: () => "project_1",
      getQuantities: () => [],
      initialAssignments: initial,
      onAssignmentsCommitted,
      api: { loadProjectMaterials }
    });

    await controller.refreshFromServer();

    expect(loadProjectMaterials).toHaveBeenCalledWith("project_1", expect.any(AbortSignal));
    expect(controller.getSaveState().assignments.find((assignment) => assignment.category === "corpus")?.thicknessMm).toBe(19);
    expect(onAssignmentsCommitted).toHaveBeenCalledWith(expect.objectContaining({ assignments: expect.arrayContaining([expect.objectContaining({ category: "corpus", thicknessMm: 19 })]) }));
  });

  it("keeps cached Materials visible but read-only until refreshed", async () => {
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
    expect(container.textContent).toContain("Obnovujem");
    expect(container.textContent).toContain("Old material warning");
    expect(controller.getLoadState().kind).toBe("refreshing");
    resolveCurrent(remoteView(current, "Current material warning"));
    await opening;

    expect(container.textContent).toContain("Current material warning");
  });
});


it("opens Materials without waiting for unending waste pricing and leaves immediately", async () => {
  const catalog = testCatalog();
  const assignments = createDefaultProjectMaterialAssignments(catalog, NOW);
  const waste = vi.fn(() => new Promise<never>(() => {}));
  const controller = createMaterialsPhaseController({ container: document.createElement("div"), catalog, getProjectId: () => "p", getQuantities: () => [], onPricingChanged: vi.fn(), api: { loadProjectMaterials: async () => ({ assignments, quantities: [], warnings: [], priceSource: { priceListId: catalog.priceList.id, name: catalog.priceList.name, currency: "EUR", source: "system-seed", lastSynchronizedAt: null } }) }, pricingApi: { loadProjectMargins: waste } });
  await controller.open();
  expect(controller.getLoadState().kind).toBe("ready");
  await vi.waitFor(() => expect(waste).toHaveBeenCalledOnce());
  const started = performance.now();
  await controller.close();
  expect(performance.now() - started).toBeLessThan(250);
  controller.destroy();
});


it("waits for verification of an uncertain write before preparing another read", async () => {
  const catalog = testCatalog();
  const assignments = createDefaultProjectMaterialAssignments(catalog, NOW);
  const original = createProjectMaterialsView(assignments, [], catalog);
  const current = createProjectMaterialsView({ ...assignments, revision: assignments.revision + 1 }, [], catalog);
  let verify!: (value: ProjectMaterialsView) => void;
  const load = vi.fn().mockResolvedValueOnce(original).mockImplementationOnce(() => new Promise<ProjectMaterialsView>(resolve => { verify = resolve; })).mockResolvedValueOnce(current);
  const write = vi.fn().mockRejectedValue(new Error("uncertain response"));
  const prepareRead = vi.fn(async () => {});
  const front = catalog.materials.find(material => material.boardFamily === "front")!;
  const controller = createMaterialsPhaseController({ container: document.createElement("div"), catalog, getProjectId: () => "p", getQuantities: () => [], prepareRead, api: { loadProjectMaterials: load, updateProjectMaterialAssignment: write, lookupCatalogItem: async () => ({ kind: "material", definition: front, unitPrice: 12 }) } });
  await controller.open();
  const committing = controller.commitId({ category: "front", field: "materialId", value: front.id, committedValue: "old" });
  await vi.waitFor(() => expect(verify).toBeTypeOf("function"));
  const opening = controller.open();
  await Promise.resolve(); await Promise.resolve();
  expect(prepareRead).toHaveBeenCalledTimes(1);
  verify(current);
  expect((await committing).ok).toBe(false);
  await opening;
  expect(prepareRead).toHaveBeenCalledTimes(2);
  expect(write).toHaveBeenCalledOnce();
  expect(controller.getSaveState().revision).toBe(current.assignments.revision);
  controller.destroy();
});


it("does not cancel the pending phase read when module properties refresh assignments", async () => {
  const catalog = testCatalog();
  const assignments = createDefaultProjectMaterialAssignments(catalog, NOW);
  const remote = createProjectMaterialsView(assignments, [], catalog);
  let finish!: (view: ProjectMaterialsView) => void;
  const load = vi.fn(() => new Promise<ProjectMaterialsView>(resolve => { finish = resolve; }));
  const container = document.createElement("div");
  const controller = createMaterialsPhaseController({ container, catalog, getProjectId: () => "p", getQuantities: () => [], api: { loadProjectMaterials: load } });
  const opening = controller.open();
  await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
  controller.restoreSaveState(assignments);
  finish(remote);
  await opening;
  expect(controller.getLoadState().kind).toBe("ready");
  expect(container.querySelector('[data-loading-skeleton="phase"]')).toBeNull();
  expect(container.querySelector('[data-material-assignment-id="material-assignment:corpus"]')).not.toBeNull();
  controller.destroy();
});

it("allows a slow snapshot save without consuming the subsequent read deadline", async () => {
  vi.useFakeTimers();
  try {
    const catalog = testCatalog();
    const remote = createProjectMaterialsView(createDefaultProjectMaterialAssignments(catalog, NOW), [], catalog);
    const controller = createMaterialsPhaseController({
      container: document.createElement("div"), catalog, getProjectId: () => "p", getQuantities: () => [],
      prepareRead: () => new Promise(resolve => setTimeout(resolve, 12_000)),
      api: { loadProjectMaterials: () => new Promise(resolve => setTimeout(() => resolve(remote), 5_000)) }
    });
    const opening = controller.open();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(controller.getLoadState().kind).toBe("loading");
    await vi.advanceTimersByTimeAsync(2_000);
    await opening;
    expect(controller.getLoadState().kind).toBe("ready");
    controller.destroy();
  } finally { vi.useRealTimers(); }
});
