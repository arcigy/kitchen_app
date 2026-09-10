import { describe, expect, it } from "vitest";
import { createSystemCatalogSeed } from "../core/catalog/catalog-bootstrap";
import type { ClientCatalog } from "../core/catalog/catalog-types";
import { assembleProjectSaveFile } from "../core/project-save/project-save-assembler";
import type { ProjectMetadata } from "../core/project/project-types";
import { makeDefaultKitchenContext } from "../layout/kitchenContext";
import { makeDefaultDrawerLowParams } from "../modules/drawerLow/types";
import { resolveProjectMaterialQuantities } from "./projectMaterialQuantityResolver";
import { resolveProjectMaterialScopes } from "./projectMaterialScopes";

const timestamp = "2026-07-10T08:00:00.000Z";
const clientId = "client_material_quantity_test";
const catalog: ClientCatalog = { clientId, ...createSystemCatalogSeed() };

const project: ProjectMetadata = {
  version: 1,
  clientId,
  projectId: "project_material_quantity_test",
  name: "Material quantity test",
  location: { address: "Test 1" },
  contact: { name: "Test" },
  status: "draft",
  createdAt: timestamp,
  updatedAt: timestamp,
  createdByUserId: "user_test",
  updatedByUserId: "user_test",
  activePhaseId: "phase_1",
  phases: ["phase_1"],
  phaseDetails: [{
    phaseId: "phase_1",
    phaseName: "Phase 1",
    phaseNumber: 1,
    status: "draft",
    createdAt: timestamp,
    updatedAt: timestamp
  }]
};

function createSave(args: {
  modules?: unknown[];
  snapshotInstances?: unknown[];
  bomSnapshot?: unknown;
}) {
  return assembleProjectSaveFile({
    clientId,
    projectId: project.projectId,
    activePhaseId: project.activePhaseId,
    project,
    catalog,
    layoutState: {
      snapshot: {
        walls: [],
        floors: [],
        columns: [],
        sections: [],
        worktops: [],
        customFurniture: [],
        instances: args.snapshotInstances ?? []
      },
      windows: [],
      doors: []
    },
    kitchenState: { context: makeDefaultKitchenContext(catalog), groups: [] },
    moduleInstances: args.modules ?? [],
    sceneState: {},
    bomSnapshot: args.bomSnapshot
  });
}

function quantity(result: ReturnType<typeof resolveProjectMaterialQuantities>, category: string) {
  return result.quantities.find((item) => item.category === category)?.quantity ?? 0;
}

describe("server project material quantity resolver", () => {
  it("ignores a forged client BOM quantity snapshot", () => {
    const save = createSave({
      bomSnapshot: {
        materialQuantities: [
          { category: "corpus", quantity: 987_654, unit: "m2", pieces: 99_999 }
        ]
      }
    });

    const result = resolveProjectMaterialQuantities(save, catalog);

    expect(quantity(result, "corpus")).toBe(0);
    expect(result.quantities.find((item) => item.category === "corpus")?.pieces).toBe(0);
  });

  it("derives non-zero board and hardware quantities from a real saved module", () => {
    const params = makeDefaultDrawerLowParams();
    const savedModule = {
      id: "module_1",
      type: params.type,
      params,
      kitchenGroupId: null,
      kitchenPlacement: null,
      positionMm: { x: 0, y: 0, z: 0 },
      rotationYDeg: 0
    };
    const save = createSave({
      modules: [savedModule],
      snapshotInstances: [savedModule],
      bomSnapshot: {
        materialQuantities: [{ category: "corpus", quantity: 0, unit: "m2" }]
      }
    });

    const result = resolveProjectMaterialQuantities(save, catalog);

    expect(quantity(result, "corpus")).toBeGreaterThan(0);
    expect(quantity(result, "front")).toBeGreaterThan(0);
    expect(quantity(result, "drawer_bottom")).toBeGreaterThan(0);
    expect(
      quantity(result, "handle") + quantity(result, "runner") + quantity(result, "leg") + quantity(result, "fastener")
    ).toBeGreaterThan(0);
  });

  it("falls back to saved layout instances when the module summary is non-empty but malformed", () => {
    const params = makeDefaultDrawerLowParams();
    const savedModule = { id: "module_snapshot_1", type: params.type, params, kitchenGroupId: null };
    const save = createSave({
      modules: [savedModule],
      snapshotInstances: [savedModule]
    });
    // Mirrors a legacy/corrupted persisted summary without creating an invalid
    // save through the current writer, which correctly rejects that mismatch.
    save.appState.modules = [{ id: "broken-summary", params: {} }];
    const result = resolveProjectMaterialQuantities(save, catalog);

    expect(quantity(result, "corpus")).toBeGreaterThan(0);
    expect(quantity(result, "front")).toBeGreaterThan(0);
  });

  it("rebuilds one module scope with its individual BOM boards and components", () => {
    const params = makeDefaultDrawerLowParams();
    const savedModule = { id: "module_scope_1", type: params.type, params, kitchenGroupId: null };
    const scopes = resolveProjectMaterialScopes(createSave({ modules: [savedModule], snapshotInstances: [savedModule] }), catalog);

    expect(scopes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "module:module_scope_1", kind: "module", items: expect.any(Array) })
    ]));
    expect(scopes.find((scope) => scope.id === "module:module_scope_1")?.items.length).toBeGreaterThan(0);
  });

  it("keeps drawer runner scope rows explicit about front height and corpus thickness", () => {
    const params = {
      ...makeDefaultDrawerLowParams(),
      drawerCount: 2,
      drawerFrontHeights: [180, 260],
      autoFit: false,
      boardThickness: 19
    };
    const savedModule = { id: "module_drawer_runner_scope", type: params.type, params, kitchenGroupId: null };
    const scope = resolveProjectMaterialScopes(createSave({ modules: [savedModule], snapshotInstances: [savedModule] }), catalog)
      .find((entry) => entry.id === "module:module_drawer_runner_scope");
    const runners = scope?.items.filter((item) => item.category === "runner") ?? [];

    expect(runners).toHaveLength(2);
    expect(runners.map((item) => item.description)).toEqual(expect.arrayContaining([
      "Čelo 180 mm · Korpus 19 mm"
    ]));
    expect(runners.every((item) => item.description.includes("Korpus 19 mm"))).toBe(true);
    expect(new Set(runners.map((item) => item.variantKey)).size).toBe(2);
  });

  it("returns BOM calculation failures as typed project warnings", () => {
    const invalidModule = {
      id: "module_unknown",
      type: "unknown_module",
      params: { type: "unknown_module" },
      kitchenGroupId: null
    };
    const result = resolveProjectMaterialQuantities(createSave({
      modules: [invalidModule],
      snapshotInstances: [invalidModule]
    }), catalog);

    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: expect.stringMatching(/^material-quantity:/),
        severity: "warning",
        affectedObjectId: "module_unknown"
      })
    ]));
  });
});
