import { describe, expect, it } from "vitest";
import { createSystemCatalogSeed } from "../core/catalog/catalog-bootstrap";
import type { ClientCatalog } from "../core/catalog/catalog-types";
import type { ProjectMaterialAssignment, ProjectMaterialAssignmentsState, ProjectMaterialScope } from "../core/project-materials/project-material-types";
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

  it("applies confirmed supplier thickness without retaining an untrusted supplier colour", () => {
    const module = { id: "m1", params: { commercialSelections: { boardMaterials: { side: "stale" }, boardThicknesses: { side: 99 } } } };
    const scopes: ProjectMaterialScope[] = [{
      id: "module:m1", kind: "module", label: "Module", items: [{
        id: "side", category: "corpus", label: "Side", description: "", quantity: 1, unit: "m2", pieces: 1,
        layoutTarget: { kind: "module-board", instanceId: "m1", materialSlotId: "side" }
      }]
    }];
    const supplier = assignment("supplier-material:demos:SUP-25");
    supplier.snapshots.material = {
      definition: {
        ...catalog().materials.find((item) => item.materialType === "board" && item.isActive)!,
        id: "supplier-material:demos:SUP-25",
        metadata: { supplierThicknessMm: 25 }
      },
      unitPrice: null, currency: "EUR", priceListId: null, capturedAt: "2026-08-10T00:00:00.000Z"
    };
    syncProjectMaterialAssignmentsToLayout({
      catalog: catalog(), instances: [module] as never, worktops: [], customFurniture: [],
      rebuildModule: () => true, rebuildWorktop: () => undefined, rebuildCustomFurniture: () => undefined
    }, { schemaVersion: 2, initialized: true, revision: 1, assignments: [supplier] }, scopes);
    expect(module.params.commercialSelections).toEqual({ boardMaterials: {}, boardThicknesses: { side: 25 } });
  });
});
