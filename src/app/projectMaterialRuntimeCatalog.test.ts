import { describe, expect, it } from "vitest";
import { createSystemCatalogSeed } from "../core/catalog/catalog-bootstrap";
import type { ClientCatalog } from "../core/catalog/catalog-types";
import type { ProjectMaterialAssignmentsState } from "../core/project-materials/project-material-types";
import { createProjectMaterialRuntimeCatalog } from "./projectMaterialRuntimeCatalog";

describe("project material runtime catalog", () => {
  it("exposes a supplier board snapshot only for the active project and restores the tenant catalog afterwards", () => {
    const base: ClientCatalog = { clientId: "tenant-a", ...createSystemCatalogSeed() };
    const board = base.materials.find((material) => material.materialType === "board" && material.boardFamily === "body")!;
    const runtime = createProjectMaterialRuntimeCatalog(base);
    const supplierId = "supplier-material:demos:RED-18";
    const assignments: ProjectMaterialAssignmentsState = {
      schemaVersion: 2,
      initialized: true,
      revision: 1,
      assignments: [{
        assignmentId: "material-assignment:corpus",
        category: "corpus",
        kind: "material",
        materialId: supplierId,
        thicknessMm: 18,
        customValues: {},
        source: "user",
        snapshots: {
          material: {
            definition: {
              ...board,
              id: supplierId,
              preview: { ...board.preview, colorHex: "#B31B34" },
              availableThicknessesMm: [18],
              defaultThicknessMm: 18,
              supplierSource: { supplier: "demos", supplierProductId: "RED-18" }
            },
            unitPrice: null,
            currency: "EUR",
            priceListId: null,
            capturedAt: "2026-09-02T12:00:00.000Z"
          }
        },
        updatedAt: "2026-09-02T12:00:00.000Z"
      }]
    };

    runtime.applyProjectAssignments(assignments);
    expect(runtime.catalog.materials.find((material) => material.id === supplierId)?.preview.colorHex).toBe("#B31B34");
    expect(base.materials.some((material) => material.id === supplierId)).toBe(false);

    runtime.applyProjectAssignments({ ...assignments, assignments: [] });
    expect(runtime.catalog.materials.some((material) => material.id === supplierId)).toBe(false);
  });
});
