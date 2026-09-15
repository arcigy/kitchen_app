import { describe, expect, it } from "vitest";
import { createSystemCatalogSeed } from "../core/catalog/catalog-bootstrap";
import type { ClientCatalog } from "../core/catalog/catalog-types";
import type { ProjectMaterialAssignment, ProjectMaterialAssignmentsState } from "../core/project-materials/project-material-types";
import { makeDefaultKitchenContext } from "../layout/kitchenContext";
import { createProjectMaterialRuntimeCatalog } from "./projectMaterialRuntimeCatalog";
import { syncProjectMaterialAssignmentsToKitchenContexts } from "./projectMaterialKitchenContextSync";

const timestamp = "2026-09-03T10:00:00.000Z";

function supplierAssignment(
  baseCatalog: ClientCatalog,
  category: "corpus" | "front" | "back" | "drawer_bottom" | "worktop",
  id: string,
  thicknessMm: number,
  colorHex: string
): ProjectMaterialAssignment {
  const source = baseCatalog.materials.find((material) => material.materialType === "board" && material.isActive)!;
  return {
    assignmentId: `material-assignment:${category}`,
    category,
    kind: "material",
    materialId: id,
    thicknessMm,
    customValues: { supplierBridge: { supplierProductCode: id } },
    source: "user",
    snapshots: {
      material: {
        definition: {
          ...source,
          id,
          boardFamily: category === "corpus" ? "body" : category,
          defaultThicknessMm: thicknessMm,
          availableThicknessesMm: [thicknessMm],
          preview: { ...source.preview, colorHex },
          supplierSource: { supplier: "demos", supplierProductId: id }
        },
        unitPrice: null,
        currency: "EUR",
        priceListId: null,
        capturedAt: timestamp
      }
    },
    updatedAt: timestamp
  };
}

describe("project material kitchen context sync", () => {
  it("updates the base and group contexts before a module rebuild uses their board aliases", () => {
    const baseCatalog: ClientCatalog = { clientId: "context-test", ...createSystemCatalogSeed() };
    const assignments: ProjectMaterialAssignmentsState = {
      schemaVersion: 2,
      initialized: true,
      revision: 1,
      assignments: [
        supplierAssignment(baseCatalog, "corpus", "supplier-material:demos:RED-18", 18, "#B31B34"),
        supplierAssignment(baseCatalog, "front", "supplier-material:demos:BLUE-19", 19, "#2451A6"),
        supplierAssignment(baseCatalog, "back", "supplier-material:demos:GREY-6", 6, "#777777"),
        supplierAssignment(baseCatalog, "drawer_bottom", "supplier-material:demos:WHITE-8", 8, "#F4F4F4"),
        supplierAssignment(baseCatalog, "worktop", "supplier-material:demos:OAK-38", 38, "#76503A")
      ]
    };
    const runtime = createProjectMaterialRuntimeCatalog(baseCatalog);
    runtime.applyProjectAssignments(assignments);
    const kitchenContext = makeDefaultKitchenContext(runtime.catalog);
    const groupContext = makeDefaultKitchenContext(runtime.catalog);

    const result = syncProjectMaterialAssignmentsToKitchenContexts({
      catalog: runtime.catalog,
      assignments,
      kitchenContext,
      kitchenGroups: [{ id: "kitchen-a", name: "Kitchen A", ctx: groupContext, instanceIds: [] }]
    });

    expect(result.changed).toBe(true);
    for (const context of [kitchenContext, groupContext]) {
      expect(context).toMatchObject({
        corpusMaterialId: "supplier-material:demos:RED-18",
        frontsMaterialId: "supplier-material:demos:BLUE-19",
        backMaterialId: "supplier-material:demos:GREY-6",
        drawerBottomMaterialId: "supplier-material:demos:WHITE-8",
        worktopMaterialId: "supplier-material:demos:OAK-38",
        worktopThicknessMm: 38,
        moduleHeightMm: context.heightMm - 38
      });
    }
  });
});
