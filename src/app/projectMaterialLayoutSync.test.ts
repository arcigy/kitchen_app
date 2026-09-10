import { describe, expect, it } from "vitest";
import { createSystemCatalogSeed } from "../core/catalog/catalog-bootstrap";
import type { ClientCatalog } from "../core/catalog/catalog-types";
import type { ProjectMaterialAssignment, ProjectMaterialAssignmentsState, ProjectMaterialScope } from "../core/project-materials/project-material-types";
import { createProjectMaterialRuntimeCatalog } from "./projectMaterialRuntimeCatalog";
import { syncProjectMaterialAssignmentsToLayout } from "./projectMaterialLayoutSync";

const catalog = (): ClientCatalog => ({ clientId: "client_test", ...createSystemCatalogSeed() });

function assignment(materialId: string, thicknessMm?: number): ProjectMaterialAssignment {
  return {
    assignmentId: "material-assignment:corpus",
    category: "corpus",
    kind: "material",
    materialId,
    ...(thicknessMm ? { thicknessMm } : {}),
    customValues: {},
    source: "user",
    snapshots: {},
    updatedAt: "2026-08-10T00:00:00.000Z"
  };
}

describe("project material layout projection", () => {
  it("projects a scoped board material and thickness, then clears stale values when no assignment remains", () => {
    const activeBoard = catalog().materials.find((item) => item.materialType === "board" && item.isActive)!;
    const module = { id: "m1", params: { commercialSelections: { boardMaterials: { side: "stale" }, boardThicknesses: { side: 99 } } } };
    const scopes: ProjectMaterialScope[] = [{
      id: "module:m1", kind: "module", label: "Module", items: [{
        id: "side", category: "corpus", label: "Side", description: "", quantity: 1, unit: "m2", pieces: 1,
        layoutTarget: { kind: "module-board", instanceId: "m1", materialSlotId: "side" }
      }]
    }];
    let rebuilds = 0;
    const sync = (state: ProjectMaterialAssignmentsState) => syncProjectMaterialAssignmentsToLayout({
      catalog: catalog(), instances: [module] as never, worktops: [], customFurniture: [],
      rebuildModule: () => { rebuilds += 1; return true; }, rebuildWorktop: () => undefined, rebuildCustomFurniture: () => undefined
    }, state, scopes);

    sync({ schemaVersion: 2, initialized: true, revision: 1, assignments: [assignment(activeBoard.id, 25)] });
    expect(module.params.commercialSelections).toEqual({ boardMaterials: { side: activeBoard.id }, boardThicknesses: { side: 25 } });
    expect(rebuilds).toBe(1);

    sync({ schemaVersion: 2, initialized: true, revision: 2, assignments: [] });
    expect(module.params.commercialSelections).toEqual({ boardMaterials: {}, boardThicknesses: {} });
  });

  it("keeps authored values unchanged when an assignment has no valid board material", () => {
    const worktop = { id: "wt1", params: { materialId: "authored", thicknessMm: 38 } };
    const scopes: ProjectMaterialScope[] = [{
      id: "addition:wt1", kind: "addition", label: "Worktop", items: [{
        id: "worktop-board-wt1", category: "worktop", label: "Worktop", description: "", quantity: 1, unit: "m2", pieces: 1,
        layoutTarget: { kind: "worktop", worktopId: "wt1" }
      }]
    }];
    const result = syncProjectMaterialAssignmentsToLayout({
      catalog: catalog(), instances: [], worktops: [worktop] as never, customFurniture: [],
      rebuildModule: () => true, rebuildWorktop: () => { throw new Error("must not rebuild"); }, rebuildCustomFurniture: () => undefined
    }, { schemaVersion: 2, initialized: true, revision: 1, assignments: [assignment("missing-board", 25)] }, scopes);
    expect(worktop.params).toEqual({ materialId: "authored", thicknessMm: 38 });
    expect(result.worktopIds).toEqual([]);
  });

  it("projects a confirmed supplier board once its project runtime catalog snapshot is available", () => {
    const module = { id: "m1", params: { commercialSelections: { boardMaterials: { side: "stale" }, boardThicknesses: { side: 99 } } } };
    const scopes: ProjectMaterialScope[] = [{
      id: "module:m1", kind: "module", label: "Module", items: [{
        id: "side", category: "corpus", label: "Side", description: "", quantity: 1, unit: "m2", pieces: 1,
        layoutTarget: { kind: "module-board", instanceId: "m1", materialSlotId: "side" }
      }]
    }];
    const supplier = assignment("supplier-material:demos:SUP-25");
    supplier.thicknessMm = 25;
    supplier.snapshots.material = {
      definition: {
        ...catalog().materials.find((item) => item.materialType === "board" && item.isActive)!,
        id: "supplier-material:demos:SUP-25",
        supplierSource: { supplier: "demos", supplierProductId: "SUP-25" },
        metadata: { supplierThicknessMm: 25 },
        availableThicknessesMm: [25],
        defaultThicknessMm: 25
      },
      unitPrice: null, currency: "EUR", priceListId: null, capturedAt: "2026-08-10T00:00:00.000Z"
    };
    const runtime = createProjectMaterialRuntimeCatalog(catalog());
    runtime.applyProjectAssignments({ schemaVersion: 2, initialized: true, revision: 1, assignments: [supplier] });
    syncProjectMaterialAssignmentsToLayout({
      catalog: runtime.catalog, instances: [module] as never, worktops: [], customFurniture: [],
      rebuildModule: () => true, rebuildWorktop: () => undefined, rebuildCustomFurniture: () => undefined
    }, { schemaVersion: 2, initialized: true, revision: 1, assignments: [supplier] }, scopes);
    expect(module.params.commercialSelections).toEqual({ boardMaterials: { side: "supplier-material:demos:SUP-25" }, boardThicknesses: { side: 25 } });
  });

  it("keeps a confirmed worktop colour and thickness after a later corpus bridge update rebuilds modules", () => {
    const baseCatalog = catalog();
    const board = baseCatalog.materials.find((item) => item.materialType === "board" && item.isActive)!;
    const corpusMaterialId = "supplier-material:demos:CORPUS-BLUE-18";
    const worktopMaterialId = "supplier-material:demos:WORKTOP-GREEN-38";
    const supplierAssignment = (
      assignmentId: string,
      category: "corpus" | "worktop",
      materialId: string,
      thicknessMm: number,
      colorHex: string
    ): ProjectMaterialAssignment => ({
      assignmentId,
      category,
      kind: "material",
      materialId,
      thicknessMm,
      customValues: {},
      source: "user",
      snapshots: {
        material: {
          definition: {
            ...board,
            id: materialId,
            boardFamily: category === "worktop" ? "worktop" : "body",
            preview: { ...board.preview, colorHex },
            availableThicknessesMm: [thicknessMm],
            defaultThicknessMm: thicknessMm,
            supplierSource: { supplier: "demos", supplierProductId: materialId }
          },
          unitPrice: null,
          currency: "EUR",
          priceListId: null,
          capturedAt: "2026-09-02T12:00:00.000Z"
        }
      },
      updatedAt: "2026-09-02T12:00:00.000Z"
    });
    const assignments: ProjectMaterialAssignmentsState = {
      schemaVersion: 2,
      initialized: true,
      revision: 2,
      assignments: [
        supplierAssignment("material-assignment:corpus", "corpus", corpusMaterialId, 18, "#2451A6"),
        supplierAssignment("material-assignment:worktop", "worktop", worktopMaterialId, 38, "#238636")
      ],
      updatedAt: "2026-09-02T12:00:00.000Z"
    };
    const runtime = createProjectMaterialRuntimeCatalog(baseCatalog);
    runtime.applyProjectAssignments(assignments);
    const module = { id: "m1", params: { commercialSelections: { boardMaterials: { side: "old-corpus" }, boardThicknesses: { side: 16 } } } };
    const worktop = { id: "wt1", params: { materialId: worktopMaterialId, thicknessMm: 38 } };
    const scopes: ProjectMaterialScope[] = [
      {
        id: "module:m1", kind: "module", label: "Module", items: [{
          id: "side", category: "corpus", label: "Side", description: "", quantity: 1, unit: "m2", pieces: 1,
          layoutTarget: { kind: "module-board", instanceId: "m1", materialSlotId: "side" }
        }]
      },
      {
        id: "addition:wt1", kind: "addition", label: "Worktop", items: [{
          id: "worktop-board-wt1", category: "worktop", label: "Worktop", description: "", quantity: 1, unit: "m2", pieces: 1,
          layoutTarget: { kind: "worktop", worktopId: "wt1" }
        }]
      }
    ];
    let worktopRebuilds = 0;

    const result = syncProjectMaterialAssignmentsToLayout({
      catalog: runtime.catalog,
      instances: [module] as never,
      worktops: [worktop] as never,
      customFurniture: [],
      rebuildModule: () => {
        // Mirrors the kitchen-context rebuild that previously wiped the worktop.
        worktop.params.materialId = "authored-worktop";
        worktop.params.thicknessMm = 28;
        return true;
      },
      rebuildWorktop: () => { worktopRebuilds += 1; },
      rebuildCustomFurniture: () => undefined
    }, assignments, scopes);

    expect(module.params.commercialSelections).toEqual({ boardMaterials: { side: corpusMaterialId }, boardThicknesses: { side: 18 } });
    expect(worktop.params).toEqual({ materialId: worktopMaterialId, thicknessMm: 38 });
    expect(worktopRebuilds).toBe(1);
    expect(result.worktopIds).toEqual(["wt1"]);
  });

  it("tolerates a worktop being deleted or added while a bridge refresh is applied", () => {
    const activeBoard = catalog().materials.find((item) => item.materialType === "board" && item.isActive)!;
    const state: ProjectMaterialAssignmentsState = {
      schemaVersion: 2,
      initialized: true,
      revision: 3,
      assignments: [{
        assignmentId: "material-assignment:worktop",
        category: "worktop",
        kind: "material",
        materialId: activeBoard.id,
        thicknessMm: 30,
        customValues: {},
        source: "user",
        snapshots: {},
        updatedAt: "2026-09-02T12:00:00.000Z"
      }],
      updatedAt: "2026-09-02T12:00:00.000Z"
    };
    const scopes: ProjectMaterialScope[] = [{
      id: "addition:wt1", kind: "addition", label: "Worktop", items: [{
        id: "worktop-board-wt1", category: "worktop", label: "Worktop", description: "", quantity: 1, unit: "m2", pieces: 1,
        layoutTarget: { kind: "worktop", worktopId: "wt1" }
      }]
    }];
    const args = {
      catalog: catalog(), instances: [], customFurniture: [],
      rebuildModule: () => true,
      rebuildWorktop: () => undefined,
      rebuildCustomFurniture: () => undefined
    };

    expect(() => syncProjectMaterialAssignmentsToLayout({ ...args, worktops: [] }, state, scopes)).not.toThrow();

    const newWorktop = { id: "wt1", params: { materialId: "authored", thicknessMm: 38 } };
    const result = syncProjectMaterialAssignmentsToLayout({ ...args, worktops: [newWorktop] as never }, state, scopes);
    expect(newWorktop.params).toEqual({ materialId: activeBoard.id, thicknessMm: 30 });
    expect(result.worktopIds).toEqual(["wt1"]);
  });
});
